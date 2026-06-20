-- Card-at-checkout (compliant MVP): buyers pay by card via Stripe; funds land in
-- the Evend platform balance and are held in escrow (order_payments), then
-- transferred to sellers on delivery. This REPLACES the stored-value wallet as a
-- payment method to avoid issuing e-money (BNM EMI scope).
--
-- What changes here:
--   * order_payments.auction_win_id link (so auction card payments can confirm).
--   * order_payments PI index relaxed to non-unique (one card charge can cover a
--     multi-seller cart => several order_payments rows share one payment_intent).
--   * create_card_checkout(): reserve stock + create orders/order_items/escrow
--     rows in 'pending_payment' / 'pending' state for a card charge (no wallet).
--   * pay_auction_win_card(): same, for an auction win.
--   * confirm_card_order(): webhook-driven; flips escrow -> held, items ->
--     confirmed, auction win -> paid. Idempotent.
--   * fail_card_order() / cancel_card_order(): restore reserved stock and remove
--     the unpaid order (on payment failure or sheet dismissal).
--   * place_bid(): drop the wallet-balance gate + bid holds (bidding no longer
--     requires wallet funds; winners pay by card).

BEGIN;

-- ── Schema tweaks ───────────────────────────────────────────────────────────
ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS auction_win_id uuid;

-- A single card charge may fund several seller orders (multi-seller cart), so the
-- payment_intent_id is no longer unique across order_payments.
DROP INDEX IF EXISTS public.uq_order_payments_pi;
CREATE INDEX IF NOT EXISTS idx_order_payments_pi
  ON public.order_payments(payment_intent_id) WHERE payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_payments_auction_win
  ON public.order_payments(auction_win_id) WHERE auction_win_id IS NOT NULL;

-- ── create_card_checkout: reserve stock + stage orders for a card charge ─────
-- Mirrors checkout_order's validation, but DOES NOT touch the wallet. Creates one
-- order per seller, decrements (reserves) stock, and inserts a 'pending' escrow
-- row per order. Returns the order ids and the server-authoritative grand total
-- (the Edge Function charges exactly this amount).
CREATE OR REPLACE FUNCTION public.create_card_checkout(p_items jsonb, p_shipping_fee numeric DEFAULT 0)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_buyer_id uuid;
  v_shipping numeric := round(COALESCE(p_shipping_fee, 0), 2);
  v_item jsonb;
  v_listing RECORD;
  v_qty int;
  v_seller uuid;
  v_sellers uuid[] := '{}';
  v_listing_ids uuid[] := '{}';
  v_qtys int[] := '{}';
  v_item_sellers uuid[] := '{}';
  v_prices numeric[] := '{}';
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
  v_subtotal numeric;
  v_order_total numeric;
  v_grand numeric := 0;
  v_stripe_acct text;
  i int;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS(SELECT 1 FROM profiles WHERE id = v_buyer_id AND transaction_banned) THEN
    RAISE EXCEPTION 'Your account is banned from transactions';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items to check out';
  END IF;

  -- Validate + lock each listing, collect per-item details.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    IF v_qty < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;

    SELECT * INTO v_listing FROM listings WHERE id = (v_item->>'listing_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Listing % not found', v_item->>'listing_id'; END IF;
    IF v_listing.status NOT IN ('active') THEN
      RAISE EXCEPTION 'Listing "%" is no longer available', v_listing.card_name;
    END IF;
    IF v_listing.seller_id = v_buyer_id THEN
      RAISE EXCEPTION 'Cannot purchase your own listing "%"', v_listing.card_name;
    END IF;
    IF v_listing.quantity < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for "%" (available: %, requested: %)',
        v_listing.card_name, v_listing.quantity, v_qty;
    END IF;

    v_listing_ids := array_append(v_listing_ids, v_listing.id);
    v_qtys        := array_append(v_qtys, v_qty);
    v_item_sellers:= array_append(v_item_sellers, v_listing.seller_id);
    v_prices      := array_append(v_prices, v_listing.price);
    IF NOT (v_listing.seller_id = ANY(v_sellers)) THEN
      v_sellers := array_append(v_sellers, v_listing.seller_id);
    END IF;
  END LOOP;

  -- One order per seller.
  FOREACH v_seller IN ARRAY v_sellers
  LOOP
    v_subtotal := 0;
    FOR i IN 1 .. array_length(v_listing_ids, 1) LOOP
      IF v_item_sellers[i] = v_seller THEN
        v_subtotal := v_subtotal + (v_prices[i] * v_qtys[i]);
      END IF;
    END LOOP;
    v_order_total := round(v_subtotal + v_shipping, 2);

    INSERT INTO orders (buyer_id, total) VALUES (v_buyer_id, v_order_total) RETURNING id INTO v_order_id;
    v_order_ids := array_append(v_order_ids, v_order_id);
    v_grand := v_grand + v_order_total;

    FOR i IN 1 .. array_length(v_listing_ids, 1) LOOP
      IF v_item_sellers[i] = v_seller THEN
        INSERT INTO order_items (order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status)
        VALUES (v_order_id, v_listing_ids[i], v_seller, v_qtys[i], v_prices[i], 'pending_payment');

        UPDATE listings
        SET quantity = quantity - v_qtys[i],
            status = CASE WHEN quantity - v_qtys[i] <= 0 THEN 'sold' ELSE status END,
            updated_at = now()
        WHERE id = v_listing_ids[i];
      END IF;
    END LOOP;

    SELECT stripe_account_id INTO v_stripe_acct FROM vendor_stores WHERE profile_id = v_seller;
    INSERT INTO order_payments (
      order_id, buyer_id, seller_id, seller_stripe_account_id,
      amount, platform_fee, funding_source, escrow_status
    ) VALUES (
      v_order_id, v_buyer_id, v_seller, v_stripe_acct,
      v_order_total, v_shipping, 'card', 'pending'
    );
  END LOOP;

  RETURN jsonb_build_object('order_ids', to_jsonb(v_order_ids), 'total', round(v_grand, 2));
END;
$function$;

REVOKE ALL ON FUNCTION public.create_card_checkout(jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_card_checkout(jsonb, numeric) TO authenticated;

-- ── pay_auction_win_card: stage an auction-win order for a card charge ───────
CREATE OR REPLACE FUNCTION public.pay_auction_win_card(p_win_id uuid, p_shipping_fee numeric DEFAULT 0)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_win auction_wins%ROWTYPE;
  v_shipping numeric := round(COALESCE(p_shipping_fee, 0), 2);
  v_total numeric;
  v_order_id uuid;
  v_stripe_acct text;
  v_existing record;
BEGIN
  SELECT * INTO v_win FROM auction_wins WHERE id = p_win_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Win record not found'; END IF;
  IF auth.uid() <> v_win.winner_id THEN RAISE EXCEPTION 'Not your win'; END IF;
  IF v_win.payment_status = 'paid' THEN RAISE EXCEPTION 'Win is already paid'; END IF;
  IF v_win.payment_status <> 'pending' THEN RAISE EXCEPTION 'Win is %', v_win.payment_status; END IF;
  IF v_win.payment_deadline < now() THEN RAISE EXCEPTION 'Payment deadline has passed'; END IF;

  -- Reuse an in-flight pending card charge for this win, if any.
  SELECT * INTO v_existing FROM order_payments
    WHERE auction_win_id = p_win_id AND escrow_status = 'pending'
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('order_id', v_existing.order_id, 'total', v_existing.amount,
      'payment_intent_id', v_existing.payment_intent_id, 'reused', true);
  END IF;

  v_total := round(v_win.winning_bid + v_shipping, 2);

  INSERT INTO orders (buyer_id, total) VALUES (v_win.winner_id, v_total) RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status)
  VALUES (v_order_id, v_win.auction_id, v_win.seller_id, 1, v_win.winning_bid, 'pending_payment');

  SELECT stripe_account_id INTO v_stripe_acct FROM vendor_stores WHERE profile_id = v_win.seller_id;
  INSERT INTO order_payments (
    order_id, buyer_id, seller_id, seller_stripe_account_id,
    amount, platform_fee, funding_source, escrow_status, auction_win_id
  ) VALUES (
    v_order_id, v_win.winner_id, v_win.seller_id, v_stripe_acct,
    v_total, v_shipping, 'card', 'pending', p_win_id
  );

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_total, 'reused', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.pay_auction_win_card(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_auction_win_card(uuid, numeric) TO authenticated;

-- ── confirm_card_order: webhook-driven settlement (idempotent) ───────────────
CREATE OR REPLACE FUNCTION public.confirm_card_order(p_payment_intent_id text, p_charge_id text DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  op record;
  v_count int := 0;
BEGIN
  FOR op IN
    SELECT * FROM order_payments
    WHERE payment_intent_id = p_payment_intent_id AND escrow_status = 'pending'
    FOR UPDATE
  LOOP
    UPDATE order_payments
      SET escrow_status = 'held', held_at = now(), charge_id = COALESCE(p_charge_id, charge_id), updated_at = now()
      WHERE id = op.id;

    UPDATE order_items
      SET fulfillment_status = 'confirmed'
      WHERE order_id = op.order_id AND fulfillment_status = 'pending_payment';

    IF op.auction_win_id IS NOT NULL THEN
      UPDATE auction_wins SET payment_status = 'paid', paid_at = now()
        WHERE id = op.auction_win_id AND payment_status <> 'paid';
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('confirmed', v_count);
END;
$function$;

-- ── _void_card_orders: restore reserved stock and delete unpaid orders ───────
CREATE OR REPLACE FUNCTION public._void_card_orders(p_order_ids uuid[])
  RETURNS int
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_oid uuid;
  oi record;
  v_count int := 0;
BEGIN
  FOREACH v_oid IN ARRAY p_order_ids
  LOOP
    -- Only void orders whose escrow is still pending (never paid).
    IF NOT EXISTS (SELECT 1 FROM order_payments WHERE order_id = v_oid AND escrow_status = 'pending') THEN
      CONTINUE;
    END IF;

    -- Restore marketplace stock (auction items aren't in listings -> no-op).
    FOR oi IN SELECT listing_id, quantity FROM order_items WHERE order_id = v_oid
    LOOP
      UPDATE listings
        SET quantity = quantity + oi.quantity, status = 'active', updated_at = now()
        WHERE id = oi.listing_id;
    END LOOP;

    -- Deleting the order cascades to order_items + order_payments.
    DELETE FROM orders WHERE id = v_oid;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_card_order(p_payment_intent_id text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(order_id) INTO v_ids
    FROM order_payments WHERE payment_intent_id = p_payment_intent_id AND escrow_status = 'pending';
  IF v_ids IS NULL THEN RETURN jsonb_build_object('voided', 0); END IF;
  RETURN jsonb_build_object('voided', public._void_card_orders(v_ids));
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_card_order(p_order_ids uuid[])
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- Only the buyer's own, still-pending orders.
  SELECT array_agg(DISTINCT op.order_id) INTO v_ids
    FROM order_payments op
    WHERE op.order_id = ANY(p_order_ids) AND op.buyer_id = v_uid AND op.escrow_status = 'pending';
  IF v_ids IS NULL THEN RETURN jsonb_build_object('voided', 0); END IF;
  RETURN jsonb_build_object('voided', public._void_card_orders(v_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_card_order(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_card_order(text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._void_card_orders(uuid[])      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_card_order(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_card_order(text)          TO service_role;
REVOKE ALL ON FUNCTION public.cancel_card_order(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_card_order(uuid[]) TO authenticated;

-- ── place_bid: bidding no longer requires wallet funds ───────────────────────
-- Winners pay by card after the auction (3-day deadline + hourly expiry already
-- enforce non-payment). We keep auction_holds untouched (now always empty).
CREATE OR REPLACE FUNCTION public.place_bid(p_auction_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_auction auction_items%ROWTYPE;
  v_bidder_id uuid;
  v_bidder profiles%ROWTYPE;
  v_min_bid numeric;
  v_time_extended boolean := false;
  v_new_ends_at timestamptz;
  v_last_bid_at timestamptz;
BEGIN
  v_bidder_id := auth.uid();
  IF v_bidder_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_bidder FROM profiles WHERE id = v_bidder_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF v_bidder.transaction_banned THEN
    RAISE EXCEPTION 'BANNED: You are banned from transactions. Reason: %',
      COALESCE(v_bidder.transaction_ban_reason, 'Policy violation');
  END IF;

  -- Rate limit: 1 bid per 3 seconds per auction per user
  SELECT max(created_at) INTO v_last_bid_at
  FROM auction_bids
  WHERE auction_id = p_auction_id AND bidder_id = v_bidder_id;
  IF v_last_bid_at IS NOT NULL AND (now() - v_last_bid_at) < interval '3 seconds' THEN
    RAISE EXCEPTION 'RATE_LIMITED: Please wait a few seconds before bidding again';
  END IF;

  SELECT * INTO v_auction FROM auction_items WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auction not found'; END IF;
  IF v_auction.status <> 'active' THEN RAISE EXCEPTION 'Auction is not active'; END IF;
  IF v_auction.ends_at <= now() THEN RAISE EXCEPTION 'Auction has ended'; END IF;
  IF v_bidder_id = v_auction.seller_id THEN RAISE EXCEPTION 'Cannot bid on your own auction'; END IF;

  IF v_auction.current_bid IS NOT NULL THEN
    v_min_bid := v_auction.current_bid + v_auction.min_bid_increment;
  ELSE
    v_min_bid := v_auction.starting_price;
  END IF;
  IF p_amount < v_min_bid THEN RAISE EXCEPTION 'Bid must be at least %', v_min_bid; END IF;

  INSERT INTO auction_bids (auction_id, bidder_id, amount) VALUES (p_auction_id, v_bidder_id, p_amount);
  v_new_ends_at := v_auction.ends_at;
  IF EXTRACT(EPOCH FROM (v_auction.ends_at - now())) < v_auction.snipe_threshold_seconds THEN
    v_new_ends_at := now() + (v_auction.snipe_extension_seconds * interval '1 second');
    v_time_extended := true;
  END IF;

  UPDATE auction_items
  SET current_bid = p_amount,
      bid_count = COALESCE(bid_count, 0) + 1,
      highest_bidder_id = v_bidder_id,
      ends_at = v_new_ends_at,
      updated_at = now()
  WHERE id = p_auction_id;

  RETURN jsonb_build_object(
    'auction_id', p_auction_id,
    'current_bid', p_amount,
    'bid_count', COALESCE(v_auction.bid_count, 0) + 1,
    'highest_bidder_id', v_bidder_id,
    'ends_at', v_new_ends_at,
    'time_extended', v_time_extended
  );
END;
$function$;

COMMIT;
