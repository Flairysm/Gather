-- Phase 2: Stripe-funded wallet top-ups + per-order escrow rows.
--
--  * credit_wallet_topup(): idempotent wallet credit invoked by the Stripe
--    webhook (service role) after a top-up PaymentIntent succeeds.
--  * checkout_order(): unchanged money logic, but now also records an
--    order_payments escrow row (held) per order so seller payouts (Transfers)
--    and refunds have a source of truth. amount = grand total, platform_fee =
--    shipping (platform-retained); seller receives amount - platform_fee.

BEGIN;

CREATE OR REPLACE FUNCTION public.credit_wallet_topup(p_payment_intent_id text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_balance numeric;
BEGIN
  SELECT * INTO r FROM wallet_topups WHERE payment_intent_id = p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF r.status = 'credited' THEN
    RETURN jsonb_build_object('status', 'already_credited');
  END IF;

  v_balance := _wallet_apply(r.user_id, r.amount, 'topup', 'topup', r.id, 'Wallet top-up (Stripe)');

  UPDATE wallet_topups
    SET status = 'credited', credited_at = now(), updated_at = now()
    WHERE id = r.id;

  RETURN jsonb_build_object('status', 'credited', 'balance', v_balance);
END;
$function$;

REVOKE ALL ON FUNCTION public.credit_wallet_topup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_wallet_topup(text) FROM anon;
REVOKE ALL ON FUNCTION public.credit_wallet_topup(text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.checkout_order(p_items jsonb, p_shipping_fee numeric DEFAULT 0)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_buyer_id uuid;
  v_total numeric := 0;
  v_grand numeric := 0;
  v_shipping numeric := round(COALESCE(p_shipping_fee, 0), 2);
  v_order_id uuid;
  v_item jsonb;
  v_listing RECORD;
  v_qty int;
  v_seller_id uuid;
  v_stripe_acct text;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF EXISTS(SELECT 1 FROM profiles WHERE id = v_buyer_id AND transaction_banned) THEN
    RAISE EXCEPTION 'Your account is banned from transactions';
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
      RAISE EXCEPTION 'Insufficient stock for "%" (available: %, requested: %)',
        v_listing.card_name, v_listing.quantity, v_qty;
    END IF;

    v_seller_id := v_listing.seller_id;
    v_total := v_total + (v_listing.price * v_qty);
  END LOOP;

  v_grand := round(v_total + v_shipping, 2);

  INSERT INTO orders (buyer_id, total) VALUES (v_buyer_id, v_grand) RETURNING id INTO v_order_id;

  PERFORM _wallet_apply(v_buyer_id, -v_grand, 'purchase', 'order', v_order_id, 'Marketplace purchase');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'quantity')::int;
    SELECT * INTO v_listing FROM listings WHERE id = (v_item->>'listing_id')::uuid;

    INSERT INTO order_items (order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status)
    VALUES (v_order_id, v_listing.id, v_listing.seller_id, v_qty, v_listing.price, 'confirmed');

    UPDATE listings
    SET quantity = quantity - v_qty,
        status = CASE WHEN quantity - v_qty <= 0 THEN 'sold' ELSE status END,
        updated_at = now()
    WHERE id = v_listing.id;
  END LOOP;

  -- Escrow record: wallet funds are real money in the platform balance.
  SELECT stripe_account_id INTO v_stripe_acct FROM vendor_stores WHERE profile_id = v_seller_id;
  INSERT INTO order_payments (
    order_id, buyer_id, seller_id, seller_stripe_account_id,
    amount, platform_fee, funding_source, escrow_status, held_at
  ) VALUES (
    v_order_id, v_buyer_id, v_seller_id, v_stripe_acct,
    v_grand, v_shipping, 'wallet', 'held', now()
  );

  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (v_buyer_id, 'checkout', 'order', v_order_id,
    jsonb_build_object('item_total', v_total, 'shipping', v_shipping, 'total', v_grand,
      'item_count', jsonb_array_length(p_items), 'paid_with', 'wallet'));

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_grand, 'item_total', v_total, 'shipping', v_shipping);
END;
$function$;

COMMIT;
