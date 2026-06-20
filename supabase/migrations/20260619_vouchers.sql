-- Redeemable vouchers (DropsTCG → Evend prepaid credit).
--
-- A voucher is a code with a fixed RM value that a user redeems into their
-- profile, then applies at checkout as held credit (partial use supported).
-- It is purely a BUYER-SIDE funding instrument: applying a voucher reduces the
-- Stripe charge and the voucher's own balance only. order_payments.amount stays
-- the full order total, so escrow + seller-payout math is unchanged (the voucher
-- value is prepaid money already collected on the Drops side).
--
-- Lifecycle:
--   active (issued)  → redeemed (claimed by a user) → used (balance hits 0)
--                    → expired / void
-- Applications are tracked in voucher_redemptions:
--   reserved (held during a card checkout) → consumed (payment confirmed)
--                                          → released (checkout cancelled/failed)

BEGIN;

-- ── 1. Vouchers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vouchers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL,
  face_value      numeric(12,2) NOT NULL CHECK (face_value > 0),
  remaining_value numeric(12,2) NOT NULL CHECK (remaining_value >= 0),
  currency        text NOT NULL DEFAULT 'myr',
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','redeemed','used','expired','void')),
  source          text,                 -- e.g. 'dropstcg'
  batch           text,
  note            text,
  expires_at      timestamptz,
  redeemed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at     timestamptz,
  created_by      uuid,                 -- admin who issued
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Codes are matched case-insensitively; enforce uniqueness on the upper form.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vouchers_code ON public.vouchers (upper(code));
CREATE INDEX IF NOT EXISTS idx_vouchers_redeemed_by ON public.vouchers(redeemed_by) WHERE redeemed_by IS NOT NULL;

-- ── 2. Voucher applications (reserve → consume / release) ───────────────────
CREATE TABLE IF NOT EXISTS public.voucher_redemptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id        uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,
  payment_intent_id text,
  amount            numeric(12,2) NOT NULL CHECK (amount > 0),
  status            text NOT NULL DEFAULT 'reserved'
                      CHECK (status IN ('reserved','consumed','released')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher ON public.voucher_redemptions(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user    ON public.voucher_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_pi      ON public.voucher_redemptions(payment_intent_id) WHERE payment_intent_id IS NOT NULL;

-- ── 3. RLS: owners read their own vouchers/applications; writes via RPC ──────
ALTER TABLE public.vouchers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vouchers_select_own ON public.vouchers;
CREATE POLICY vouchers_select_own ON public.vouchers
  FOR SELECT TO authenticated USING (redeemed_by = auth.uid());

DROP POLICY IF EXISTS voucher_redemptions_select_own ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_select_own ON public.voucher_redemptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 4. Allow 'voucher' as a funding source on escrow rows ───────────────────
DO $fs$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.order_payments'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%funding_source%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.order_payments DROP CONSTRAINT %I', c);
  END IF;
END
$fs$;
ALTER TABLE public.order_payments
  ADD CONSTRAINT order_payments_funding_source_check
  CHECK (funding_source IN ('wallet','card','mixed','voucher'));

-- ── 5. Redeem a code into the caller's account ──────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_voucher(p_code text)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(COALESCE(p_code, '')));
  v record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_code = '' THEN RAISE EXCEPTION 'Enter a voucher code'; END IF;

  SELECT * INTO v FROM vouchers WHERE upper(code) = v_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid voucher code'; END IF;
  IF v.status = 'void' THEN RAISE EXCEPTION 'This voucher is no longer valid'; END IF;
  IF v.expires_at IS NOT NULL AND v.expires_at < now() THEN
    UPDATE vouchers SET status = 'expired', updated_at = now() WHERE id = v.id AND status <> 'expired';
    RAISE EXCEPTION 'This voucher has expired';
  END IF;

  IF v.redeemed_by IS NOT NULL THEN
    IF v.redeemed_by = v_uid THEN
      RETURN jsonb_build_object('status', 'already_yours', 'code', v.code,
        'remaining_value', v.remaining_value, 'face_value', v.face_value);
    END IF;
    RAISE EXCEPTION 'This voucher has already been redeemed';
  END IF;

  UPDATE vouchers
    SET redeemed_by = v_uid, redeemed_at = now(), status = 'redeemed', updated_at = now()
    WHERE id = v.id;

  RETURN jsonb_build_object('status', 'redeemed', 'code', v.code,
    'remaining_value', v.remaining_value, 'face_value', v.face_value, 'expires_at', v.expires_at);
END;
$function$;

-- ── 6. create_card_checkout: optional voucher applied to the card charge ────
-- Adds p_voucher_code. The voucher reduces the amount charged on the card (and,
-- if it fully covers the cart, settles the orders immediately with no charge).
-- order_payments.amount stays the full order total; funding_source records how
-- the buyer paid ('card' | 'mixed' | 'voucher').
DROP FUNCTION IF EXISTS public.create_card_checkout(jsonb, numeric, jsonb);
CREATE OR REPLACE FUNCTION public.create_card_checkout(
  p_items jsonb,
  p_shipping_fee numeric DEFAULT 0,
  p_shipping_address jsonb DEFAULT NULL,
  p_voucher_code text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  -- voucher
  v_code text := NULLIF(upper(btrim(COALESCE(p_voucher_code, ''))), '');
  v_voucher vouchers%ROWTYPE;
  v_reserved numeric;
  v_avail numeric;
  v_applied numeric := 0;
  v_payable numeric;
  v_redemption_id uuid;
  v_min_charge numeric := 2.00;   -- Stripe MYR minimum; leave at least this to charge
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

  v_grand := round(v_grand, 2);
  v_payable := v_grand;

  -- ── Voucher application ──
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
    -- Don't leave a residual smaller than Stripe's minimum charge: either cover
    -- it fully or leave at least v_min_charge for the card.
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

  -- ── Fully covered by voucher: settle now, no card charge ──
  IF v_payable <= 0 AND v_applied > 0 THEN
    -- Consume the voucher.
    UPDATE voucher_redemptions SET status = 'consumed', updated_at = now() WHERE id = v_redemption_id;
    UPDATE vouchers
      SET remaining_value = round(remaining_value - v_applied, 2),
          status = CASE WHEN round(remaining_value - v_applied, 2) <= 0 THEN 'used' ELSE status END,
          updated_at = now()
      WHERE id = v_voucher.id;

    -- Settle each order (escrow held, items confirmed, notify seller).
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

    RETURN jsonb_build_object(
      'order_ids', to_jsonb(v_order_ids), 'total', v_grand,
      'voucher_applied', v_applied, 'payable', 0, 'fully_paid', true
    );
  END IF;

  -- ── Card charge required (with optional partial voucher) ──
  IF v_applied > 0 THEN
    UPDATE order_payments SET funding_source = 'mixed' WHERE order_id = ANY(v_order_ids);
  END IF;

  RETURN jsonb_build_object(
    'order_ids', to_jsonb(v_order_ids), 'total', v_grand,
    'voucher_applied', v_applied, 'payable', v_payable,
    'voucher_redemption_id', v_redemption_id, 'fully_paid', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_card_checkout(jsonb, numeric, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_card_checkout(jsonb, numeric, jsonb, text) TO authenticated;

-- ── 7. confirm_card_order: also consume reserved voucher credit ─────────────
CREATE OR REPLACE FUNCTION public.confirm_card_order(p_payment_intent_id text, p_charge_id text DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  op record;
  r record;
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
    IF op.seller_id IS DISTINCT FROM op.buyer_id THEN
      INSERT INTO notifications (user_id, type, title, body, icon, color, reference_type, reference_id)
      VALUES (op.seller_id, 'new_sale', 'New order received',
        'You have a new paid order. Tap to view the shipping details and get it ready to ship.',
        'cube-outline', '#2C80FF', 'order', op.order_id);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  -- Consume any voucher credit reserved for this charge.
  FOR r IN
    SELECT * FROM voucher_redemptions
    WHERE payment_intent_id = p_payment_intent_id AND status = 'reserved'
    FOR UPDATE
  LOOP
    UPDATE voucher_redemptions SET status = 'consumed', updated_at = now() WHERE id = r.id;
    UPDATE vouchers
      SET remaining_value = round(remaining_value - r.amount, 2),
          status = CASE WHEN round(remaining_value - r.amount, 2) <= 0 THEN 'used' ELSE status END,
          updated_at = now()
      WHERE id = r.voucher_id;
  END LOOP;

  RETURN jsonb_build_object('confirmed', v_count);
END;
$function$;

-- ── 8. _void_card_orders: also release any reserved voucher credit ──────────
CREATE OR REPLACE FUNCTION public._void_card_orders(p_order_ids uuid[])
  RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_oid uuid;
  oi record;
  v_count int := 0;
  v_pis text[];
BEGIN
  -- Collect the PaymentIntents of the orders we're about to void (still pending).
  SELECT array_agg(DISTINCT payment_intent_id) INTO v_pis
    FROM order_payments
    WHERE order_id = ANY(p_order_ids) AND escrow_status = 'pending' AND payment_intent_id IS NOT NULL;

  FOREACH v_oid IN ARRAY p_order_ids
  LOOP
    IF NOT EXISTS (SELECT 1 FROM order_payments WHERE order_id = v_oid AND escrow_status = 'pending') THEN
      CONTINUE;
    END IF;
    FOR oi IN SELECT listing_id, quantity FROM order_items WHERE order_id = v_oid
    LOOP
      UPDATE listings
        SET quantity = quantity + oi.quantity, status = 'active', updated_at = now()
        WHERE id = oi.listing_id;
    END LOOP;
    DELETE FROM orders WHERE id = v_oid;
    v_count := v_count + 1;
  END LOOP;

  IF v_pis IS NOT NULL THEN
    UPDATE voucher_redemptions SET status = 'released', updated_at = now()
      WHERE payment_intent_id = ANY(v_pis) AND status = 'reserved';
  END IF;

  RETURN v_count;
END;
$function$;

-- ── 9. release_voucher_reservation: safety release by id (edge-fn catch) ────
CREATE OR REPLACE FUNCTION public.release_voucher_reservation(p_redemption_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rows int;
BEGIN
  UPDATE voucher_redemptions SET status = 'released', updated_at = now()
    WHERE id = p_redemption_id AND status = 'reserved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('released', v_rows);
END;
$function$;

-- ── 10. Admin: issue a voucher ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_voucher(
  p_code text,
  p_value numeric,
  p_source text DEFAULT 'dropstcg',
  p_expires_at timestamptz DEFAULT NULL,
  p_batch text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_code text := upper(btrim(COALESCE(p_code, '')));
  v_value numeric := round(COALESCE(p_value, 0), 2);
  v_id uuid;
BEGIN
  IF v_code = '' THEN RAISE EXCEPTION 'Voucher code is required'; END IF;
  IF v_value <= 0 THEN RAISE EXCEPTION 'Voucher value must be greater than zero'; END IF;
  IF EXISTS (SELECT 1 FROM vouchers WHERE upper(code) = v_code) THEN
    RAISE EXCEPTION 'A voucher with that code already exists';
  END IF;
  INSERT INTO vouchers (code, face_value, remaining_value, source, batch, expires_at, created_by)
  VALUES (v_code, v_value, v_value, NULLIF(btrim(p_source), ''), NULLIF(btrim(p_batch), ''), p_expires_at, p_admin_id)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('status', 'created', 'id', v_id, 'code', v_code, 'value', v_value);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_void_voucher(p_voucher_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rows int;
BEGIN
  UPDATE vouchers SET status = 'void', updated_at = now()
    WHERE id = p_voucher_id AND status IN ('active','redeemed');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Voucher not found or cannot be voided'; END IF;
  RETURN jsonb_build_object('status', 'void');
END;
$function$;

-- ── 11. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.redeem_voucher(text)                       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(text)                    TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_card_order(text, text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._void_card_orders(uuid[])                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_voucher_reservation(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_voucher(text,numeric,text,timestamptz,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_void_voucher(uuid)                   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_card_order(text, text)          TO service_role;
GRANT EXECUTE ON FUNCTION public._void_card_orders(uuid[])               TO service_role;
GRANT EXECUTE ON FUNCTION public.release_voucher_reservation(uuid)       TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_voucher(text,numeric,text,timestamptz,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_void_voucher(uuid)                TO service_role;

COMMIT;
