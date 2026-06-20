-- Persist a snapshot of the buyer's shipping address on each order so sellers
-- know where to ship. Stored as a JSONB snapshot (not an FK to user_addresses)
-- because the buyer's saved address can later be edited or deleted.
alter table public.orders
  add column if not exists shipping_address jsonb;

-- ── create_card_checkout: accept + store the shipping address snapshot ──
-- The signature grows by one param, so drop the old 2-arg version first.
drop function if exists public.create_card_checkout(jsonb, numeric);

create or replace function public.create_card_checkout(
  p_items jsonb,
  p_shipping_fee numeric default 0,
  p_shipping_address jsonb default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      RAISE EXCEPTION 'Insufficient stock for "%" (available: %, requested: %)', v_listing.card_name, v_listing.quantity, v_qty;
    END IF;
    v_listing_ids := array_append(v_listing_ids, v_listing.id);
    v_qtys        := array_append(v_qtys, v_qty);
    v_item_sellers:= array_append(v_item_sellers, v_listing.seller_id);
    v_prices      := array_append(v_prices, v_listing.price);
    IF NOT (v_listing.seller_id = ANY(v_sellers)) THEN
      v_sellers := array_append(v_sellers, v_listing.seller_id);
    END IF;
  END LOOP;

  FOREACH v_seller IN ARRAY v_sellers
  LOOP
    v_subtotal := 0;
    FOR i IN 1 .. array_length(v_listing_ids, 1) LOOP
      IF v_item_sellers[i] = v_seller THEN
        v_subtotal := v_subtotal + (v_prices[i] * v_qtys[i]);
      END IF;
    END LOOP;
    v_order_total := round(v_subtotal + v_shipping, 2);
    INSERT INTO orders (buyer_id, total, shipping_address)
    VALUES (v_buyer_id, v_order_total, p_shipping_address)
    RETURNING id INTO v_order_id;
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
    INSERT INTO order_payments (order_id, buyer_id, seller_id, seller_stripe_account_id, amount, platform_fee, funding_source, escrow_status)
    VALUES (v_order_id, v_buyer_id, v_seller, v_stripe_acct, v_order_total, v_shipping, 'card', 'pending');
  END LOOP;

  RETURN jsonb_build_object('order_ids', to_jsonb(v_order_ids), 'total', round(v_grand, 2));
END;
$function$;

-- ── pay_auction_win_card: accept + store the shipping address snapshot ──
drop function if exists public.pay_auction_win_card(uuid, numeric);

create or replace function public.pay_auction_win_card(
  p_win_id uuid,
  p_shipping_fee numeric default 0,
  p_shipping_address jsonb default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  SELECT * INTO v_existing FROM order_payments WHERE auction_win_id = p_win_id AND escrow_status = 'pending' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('order_id', v_existing.order_id, 'total', v_existing.amount, 'payment_intent_id', v_existing.payment_intent_id, 'reused', true);
  END IF;
  v_total := round(v_win.winning_bid + v_shipping, 2);
  INSERT INTO orders (buyer_id, total, shipping_address)
  VALUES (v_win.winner_id, v_total, p_shipping_address)
  RETURNING id INTO v_order_id;
  INSERT INTO order_items (order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status)
  VALUES (v_order_id, v_win.auction_id, v_win.seller_id, 1, v_win.winning_bid, 'pending_payment');
  SELECT stripe_account_id INTO v_stripe_acct FROM vendor_stores WHERE profile_id = v_win.seller_id;
  INSERT INTO order_payments (order_id, buyer_id, seller_id, seller_stripe_account_id, amount, platform_fee, funding_source, escrow_status, auction_win_id)
  VALUES (v_order_id, v_win.winner_id, v_win.seller_id, v_stripe_acct, v_total, v_shipping, 'card', 'pending', p_win_id);
  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_total, 'reused', false);
END;
$function$;

-- ── confirm_card_order: notify each seller when their order is paid ──
create or replace function public.confirm_card_order(p_payment_intent_id text, p_charge_id text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  op record;
  v_count int := 0;
BEGIN
  FOR op IN SELECT * FROM order_payments WHERE payment_intent_id = p_payment_intent_id AND escrow_status = 'pending' FOR UPDATE
  LOOP
    UPDATE order_payments SET escrow_status = 'held', held_at = now(), charge_id = COALESCE(p_charge_id, charge_id), updated_at = now() WHERE id = op.id;
    UPDATE order_items SET fulfillment_status = 'confirmed' WHERE order_id = op.order_id AND fulfillment_status = 'pending_payment';
    IF op.auction_win_id IS NOT NULL THEN
      UPDATE auction_wins SET payment_status = 'paid', paid_at = now() WHERE id = op.auction_win_id AND payment_status <> 'paid';
    END IF;

    -- Surface the sale to the seller (skip self-purchases). 'new_sale' routes
    -- to the Vendor Hub in the app's notification handler.
    IF op.seller_id IS DISTINCT FROM op.buyer_id THEN
      INSERT INTO notifications (user_id, type, title, body, icon, color, reference_type, reference_id)
      VALUES (
        op.seller_id, 'new_sale', 'New order received',
        'You have a new paid order. Tap to view the shipping details and get it ready to ship.',
        'cube-outline', '#2C80FF', 'order', op.order_id
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('confirmed', v_count);
END;
$function$;
