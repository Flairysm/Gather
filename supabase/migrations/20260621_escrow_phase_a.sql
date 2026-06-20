-- Escrow / money-correctness fixes — Phase A
--
-- Closes live exploits in the buyer↔seller money flow:
--   1. Accepted offer prices are now honored end-to-end. The buyer is charged the
--      agreed amount (server-enforced), not the listing price. An accepted offer is
--      single-use: consumed on a real order, restored if the checkout is voided.
--   2. Only the offer's *recipient* (the counterparty, not the sender) can accept or
--      decline it — via respond_to_offer(). Prevents self-accepting your own offer.
--   3. Refunds are correct for every funding source. We record the per-order voucher
--      split (voucher_id + voucher_amount) at checkout so a refund can: restore the
--      voucher portion, credit the wallet portion, and (via the Edge Function) refund
--      exactly the card portion. Previously 'mixed'/'voucher' orders refunded nothing.
--   4. apply_order_refund() now also restocks the listing (only when the item never
--      shipped) so a cancelled/refunded pre-shipment order returns stock to sale.

-- ── Schema additions ────────────────────────────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS accepted_offer_id uuid;

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS voucher_id uuid,
  ADD COLUMN IF NOT EXISTS voucher_amount numeric NOT NULL DEFAULT 0;

-- Allow an offer to be marked consumed once it backs a real order.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_offer_status_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_offer_status_check
  CHECK (offer_status = ANY (ARRAY['pending','accepted','declined','countered','withdrawn','fulfilled']));

-- ── respond_to_offer: only the counterparty may accept/decline ──────────────
CREATE OR REPLACE FUNCTION public.respond_to_offer(p_message_id uuid, p_status text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  m record;
  v_participants uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_status NOT IN ('accepted','declined') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  SELECT * INTO m FROM messages WHERE id = p_message_id AND kind = 'offer' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF m.offer_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This offer is no longer pending';
  END IF;
  IF m.sender_id = v_uid THEN
    RAISE EXCEPTION 'You cannot respond to your own offer';
  END IF;

  SELECT participant_ids INTO v_participants FROM conversations WHERE id = m.conversation_id;
  IF v_participants IS NULL OR NOT (v_uid = ANY(v_participants)) THEN
    RAISE EXCEPTION 'You are not part of this conversation';
  END IF;

  UPDATE messages SET offer_status = p_status WHERE id = p_message_id;
  RETURN jsonb_build_object('status', p_status, 'amount', m.offer_amount, 'listing_id', m.offer_listing_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.respond_to_offer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_offer(uuid, text) TO authenticated;

-- ── create_card_checkout: honor accepted offers + record voucher split ──────
CREATE OR REPLACE FUNCTION public.create_card_checkout(p_items jsonb, p_shipping_fee numeric DEFAULT 0, p_shipping_address jsonb DEFAULT NULL::jsonb, p_voucher_code text DEFAULT NULL::text)
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
  v_offer_ids uuid[] := '{}';
  v_offer uuid;
  v_off record;
  v_participants uuid[];
  v_unit_price numeric;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
  v_subtotal numeric;
  v_order_total numeric;
  v_grand numeric := 0;
  v_stripe_acct text;
  i int;
  v_code text := NULLIF(upper(btrim(COALESCE(p_voucher_code, ''))), '');
  v_voucher vouchers%ROWTYPE;
  v_reserved numeric;
  v_avail numeric;
  v_applied numeric := 0;
  v_payable numeric;
  v_redemption_id uuid;
  v_min_charge numeric := 2.00;
  v_remaining numeric;
  v_alloc numeric;
  v_ot numeric;
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

    -- Optional accepted-offer override: charge the agreed price, server-enforced.
    v_offer := NULLIF(v_item->>'offer_id', '')::uuid;
    v_unit_price := v_listing.price;
    IF v_offer IS NOT NULL THEN
      SELECT * INTO v_off FROM messages WHERE id = v_offer AND kind = 'offer' FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
      IF v_off.offer_status IS DISTINCT FROM 'accepted' THEN
        RAISE EXCEPTION 'This offer is no longer available';
      END IF;
      IF v_off.offer_listing_id IS DISTINCT FROM v_listing.id THEN
        RAISE EXCEPTION 'Offer does not match the item';
      END IF;
      IF v_off.offer_amount IS NULL OR v_off.offer_amount <= 0 THEN
        RAISE EXCEPTION 'Offer amount is invalid';
      END IF;
      IF v_qty <> 1 THEN RAISE EXCEPTION 'Offer items must have quantity 1'; END IF;
      SELECT participant_ids INTO v_participants FROM conversations WHERE id = v_off.conversation_id;
      IF v_participants IS NULL OR NOT (v_buyer_id = ANY(v_participants)) THEN
        RAISE EXCEPTION 'This offer is not yours to redeem';
      END IF;
      IF EXISTS (
        SELECT 1 FROM order_items
        WHERE accepted_offer_id = v_offer AND fulfillment_status NOT IN ('cancelled','refunded')
      ) THEN
        RAISE EXCEPTION 'This offer has already been used';
      END IF;
      v_unit_price := round(v_off.offer_amount, 2);
      UPDATE messages SET offer_status = 'fulfilled' WHERE id = v_offer;
    END IF;

    v_listing_ids := array_append(v_listing_ids, v_listing.id);
    v_qtys        := array_append(v_qtys, v_qty);
    v_item_sellers:= array_append(v_item_sellers, v_listing.seller_id);
    v_prices      := array_append(v_prices, v_unit_price);
    v_offer_ids   := array_append(v_offer_ids, v_offer);
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
        INSERT INTO order_items (order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status, accepted_offer_id)
        VALUES (v_order_id, v_listing_ids[i], v_seller, v_qtys[i], v_prices[i], 'pending_payment', v_offer_ids[i]);
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

  v_grand := round(v_grand, 2);
  v_payable := v_grand;

  IF v_code IS NOT NULL THEN
    SELECT * INTO v_voucher FROM vouchers WHERE upper(code) = v_code FOR UPDATE;
    IF NOT FOUND OR v_voucher.redeemed_by IS DISTINCT FROM v_buyer_id THEN
      RAISE EXCEPTION 'Voucher not found in your account';
    END IF;
    IF v_voucher.status NOT IN ('redeemed') THEN
      RAISE EXCEPTION 'This voucher cannot be used';
    END IF;
    IF v_voucher.expires_at IS NOT NULL AND v_voucher.expires_at < now() THEN
      RAISE EXCEPTION 'This voucher has expired';
    END IF;
    SELECT COALESCE(SUM(amount), 0) INTO v_reserved
      FROM voucher_redemptions WHERE voucher_id = v_voucher.id AND status = 'reserved';
    v_avail := round(v_voucher.remaining_value - v_reserved, 2);
    IF v_avail <= 0 THEN RAISE EXCEPTION 'This voucher has no balance left'; END IF;
    v_applied := round(LEAST(v_avail, v_grand), 2);
    IF v_applied < v_grand AND (v_grand - v_applied) < v_min_charge THEN
      v_applied := round(v_grand - v_min_charge, 2);
    END IF;
    IF v_applied < 0 THEN v_applied := 0; END IF;
    IF v_applied > 0 THEN
      v_payable := round(v_grand - v_applied, 2);
      INSERT INTO voucher_redemptions (voucher_id, user_id, amount, status)
      VALUES (v_voucher.id, v_buyer_id, v_applied, 'reserved')
      RETURNING id INTO v_redemption_id;
    END IF;
  END IF;

  -- Record the voucher split per order so refunds can restore the exact portions.
  IF v_applied > 0 THEN
    v_remaining := v_applied;
    FOR i IN 1 .. array_length(v_order_ids, 1) LOOP
      SELECT amount INTO v_ot FROM order_payments WHERE order_id = v_order_ids[i];
      v_alloc := round(LEAST(v_remaining, v_ot), 2);
      UPDATE order_payments
        SET voucher_id = v_voucher.id, voucher_amount = v_alloc
        WHERE order_id = v_order_ids[i];
      v_remaining := round(v_remaining - v_alloc, 2);
    END LOOP;
  END IF;

  -- Voucher fully covers the cart — settle inline, no card charge.
  IF v_payable <= 0 AND v_applied > 0 THEN
    UPDATE voucher_redemptions SET status = 'consumed', updated_at = now() WHERE id = v_redemption_id;
    UPDATE vouchers
      SET remaining_value = round(remaining_value - v_applied, 2),
          status = CASE WHEN round(remaining_value - v_applied, 2) <= 0 THEN 'used' ELSE status END,
          updated_at = now()
      WHERE id = v_voucher.id;
    FOR i IN 1 .. array_length(v_order_ids, 1) LOOP
      UPDATE order_payments
        SET escrow_status = 'held', held_at = now(), funding_source = 'voucher', updated_at = now()
        WHERE order_id = v_order_ids[i] AND escrow_status = 'pending';
      UPDATE order_items
        SET fulfillment_status = 'confirmed'
        WHERE order_id = v_order_ids[i] AND fulfillment_status = 'pending_payment';
      INSERT INTO notifications (user_id, type, title, body, icon, color, reference_type, reference_id)
      SELECT op.seller_id, 'new_sale', 'New order received',
             'You have a new paid order. Tap to view the shipping details and get it ready to ship.',
             'cube-outline', '#2C80FF', 'order', op.order_id
        FROM order_payments op
        WHERE op.order_id = v_order_ids[i] AND op.seller_id IS DISTINCT FROM op.buyer_id;
    END LOOP;
    RETURN jsonb_build_object('order_ids', to_jsonb(v_order_ids), 'total', v_grand,
      'voucher_applied', v_applied, 'payable', 0, 'fully_paid', true);
  END IF;

  IF v_applied > 0 THEN
    UPDATE order_payments SET funding_source = 'mixed' WHERE order_id = ANY(v_order_ids);
  END IF;

  RETURN jsonb_build_object('order_ids', to_jsonb(v_order_ids), 'total', v_grand,
    'voucher_applied', v_applied, 'payable', v_payable,
    'voucher_redemption_id', v_redemption_id, 'fully_paid', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_card_checkout(jsonb, numeric, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_card_checkout(jsonb, numeric, jsonb, text) TO authenticated;

-- ── _void_card_orders: also restore any accepted offers that backed the order ─
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
    IF NOT EXISTS (SELECT 1 FROM order_payments WHERE order_id = v_oid AND escrow_status = 'pending') THEN
      CONTINUE;
    END IF;

    -- Release any accepted offers back to 'accepted' so the buyer can retry.
    UPDATE messages SET offer_status = 'accepted'
      WHERE id IN (SELECT accepted_offer_id FROM order_items WHERE order_id = v_oid AND accepted_offer_id IS NOT NULL)
        AND offer_status = 'fulfilled';

    FOR oi IN SELECT listing_id, quantity FROM order_items WHERE order_id = v_oid
    LOOP
      UPDATE listings
        SET quantity = quantity + oi.quantity, status = 'active', updated_at = now()
        WHERE id = oi.listing_id;
    END LOOP;

    DELETE FROM orders WHERE id = v_oid;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public._void_card_orders(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._void_card_orders(uuid[]) TO service_role;

-- ── apply_order_refund: correct per-source refund + restock-if-unshipped ─────
-- Returns card_amount so the Edge Function knows exactly how much to refund on
-- Stripe (voucher/wallet portions are restored here, in-DB).
CREATE OR REPLACE FUNCTION public.apply_order_refund(p_order_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  op record;
  v_card numeric;
  v_shipped boolean;
BEGIN
  SELECT * INTO op FROM order_payments WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF op.escrow_status = 'refunded' THEN RETURN jsonb_build_object('status', 'already_refunded'); END IF;
  IF op.escrow_status <> 'held' THEN
    RETURN jsonb_build_object('status', 'not_refundable', 'escrow_status', op.escrow_status);
  END IF;

  v_card := round(GREATEST(op.amount - COALESCE(op.voucher_amount, 0), 0), 2);

  -- Restore the voucher portion (mixed / voucher-funded).
  IF COALESCE(op.voucher_amount, 0) > 0 AND op.voucher_id IS NOT NULL THEN
    UPDATE vouchers
      SET remaining_value = round(remaining_value + op.voucher_amount, 2),
          status = CASE WHEN status = 'used' THEN 'redeemed' ELSE status END,
          updated_at = now()
      WHERE id = op.voucher_id;
  END IF;

  -- Wallet-funded (e.g. auction wins) — credit the wallet back in full.
  IF op.funding_source = 'wallet' THEN
    PERFORM _wallet_apply(op.buyer_id, op.amount, 'refund', 'order', op.order_id, 'Order refund');
  END IF;

  -- Restock only if the item never shipped (pre-shipment cancel/refund).
  SELECT bool_or(fulfillment_status IN ('shipped','delivered')) INTO v_shipped
    FROM order_items WHERE order_id = p_order_id;
  IF NOT COALESCE(v_shipped, false) THEN
    UPDATE listings l
      SET quantity = l.quantity + oi.quantity, status = 'active', updated_at = now()
      FROM order_items oi
      WHERE oi.order_id = p_order_id AND oi.listing_id = l.id;
  END IF;

  UPDATE order_payments
    SET escrow_status = 'refunded', refunded_at = now(), updated_at = now()
    WHERE id = op.id;

  UPDATE order_items SET fulfillment_status = 'refunded' WHERE order_id = p_order_id;

  RETURN jsonb_build_object('status', 'refunded', 'funding_source', op.funding_source,
    'amount', op.amount, 'voucher_amount', COALESCE(op.voucher_amount, 0), 'card_amount', v_card);
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_order_refund(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_refund(uuid) TO service_role;
