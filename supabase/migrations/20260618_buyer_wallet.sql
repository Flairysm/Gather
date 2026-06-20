-- Closed-loop RM buyer wallet for Evend.
--
-- Funded by top-ups (trust-based for now; PSP integration is a follow-up) and,
-- later, DropsTCG token conversion. Spent on marketplace + auction purchases.
-- Direct writes are blocked; balance only changes through SECURITY DEFINER RPCs
-- that also append an immutable wallet_ledger row.

BEGIN;

CREATE TABLE IF NOT EXISTS public.evend_wallets (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance    numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL,            -- positive = credit, negative = debit
  balance_after  numeric(12,2) NOT NULL,
  type           text NOT NULL CHECK (type IN ('topup','purchase','auction','refund','conversion','adjustment')),
  reference_type text,
  reference_id   uuid,
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_idx ON public.wallet_ledger (user_id, created_at DESC);

ALTER TABLE public.evend_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evend_wallets_select_own ON public.evend_wallets;
CREATE POLICY evend_wallets_select_own ON public.evend_wallets FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS wallet_ledger_select_own ON public.wallet_ledger;
CREATE POLICY wallet_ledger_select_own ON public.wallet_ledger FOR SELECT USING (user_id = auth.uid());
-- No write policies: balance changes only via the RPCs below.

-- ── Internal: apply a signed amount atomically + write ledger ──
CREATE OR REPLACE FUNCTION public._wallet_apply(
  p_user_id uuid,
  p_amount numeric,
  p_type text,
  p_ref_type text DEFAULT NULL,
  p_ref_id uuid DEFAULT NULL,
  p_desc text DEFAULT NULL
) RETURNS numeric
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_balance numeric;
BEGIN
  INSERT INTO evend_wallets (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM evend_wallets WHERE user_id = p_user_id FOR UPDATE;

  v_balance := round(v_balance + p_amount, 2);
  IF v_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance'
      USING ERRCODE = 'P0001', HINT = 'insufficient_funds';
  END IF;

  UPDATE evend_wallets SET balance = v_balance, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO wallet_ledger (user_id, amount, balance_after, type, reference_type, reference_id, description)
  VALUES (p_user_id, round(p_amount, 2), v_balance, p_type, p_ref_type, p_ref_id, p_desc);

  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public._wallet_apply(uuid, numeric, text, text, uuid, text) FROM anon, authenticated;

-- ── Read the caller's wallet (creating an empty one if needed) ──
CREATE OR REPLACE FUNCTION public.get_wallet()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO evend_wallets (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM evend_wallets WHERE user_id = v_uid;
  RETURN jsonb_build_object('balance', v_balance);
END;
$$;

-- ── Top up (trust-based placeholder; swap to a PSP webhook later) ──
CREATE OR REPLACE FUNCTION public.topup_wallet(p_amount numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_amount numeric := round(COALESCE(p_amount, 0), 2);
  v_balance numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Top-up amount must be greater than zero'; END IF;
  IF v_amount > 10000 THEN RAISE EXCEPTION 'Maximum top-up is RM10,000 per transaction'; END IF;

  v_balance := _wallet_apply(v_uid, v_amount, 'topup', 'topup', NULL, 'Wallet top-up');
  RETURN jsonb_build_object('balance', v_balance, 'added', v_amount);
END;
$$;

-- ── checkout_order: now debits the buyer wallet (items + shipping) ──
DROP FUNCTION IF EXISTS public.checkout_order(jsonb);
CREATE OR REPLACE FUNCTION public.checkout_order(p_items jsonb, p_shipping_fee numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_buyer_id uuid;
  v_total numeric := 0;
  v_grand numeric := 0;
  v_shipping numeric := round(COALESCE(p_shipping_fee, 0), 2);
  v_order_id uuid;
  v_item jsonb;
  v_listing RECORD;
  v_qty int;
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

    v_total := v_total + (v_listing.price * v_qty);
  END LOOP;

  v_grand := round(v_total + v_shipping, 2);

  INSERT INTO orders (buyer_id, total) VALUES (v_buyer_id, v_grand) RETURNING id INTO v_order_id;

  -- Debit wallet (raises 'Insufficient wallet balance' -> whole tx rolls back)
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

  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (v_buyer_id, 'checkout', 'order', v_order_id,
    jsonb_build_object('item_total', v_total, 'shipping', v_shipping, 'total', v_grand,
      'item_count', jsonb_array_length(p_items), 'paid_with', 'wallet'));

  RETURN jsonb_build_object('order_id', v_order_id, 'total', v_grand, 'item_total', v_total, 'shipping', v_shipping);
END;
$function$;

-- ── pay_auction_win: now debits the buyer wallet (winning bid + shipping) ──
DROP FUNCTION IF EXISTS public.pay_auction_win(uuid);
CREATE OR REPLACE FUNCTION public.pay_auction_win(p_win_id uuid, p_shipping_fee numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_win auction_wins%ROWTYPE;
  v_order_id uuid;
  v_shipping numeric := round(COALESCE(p_shipping_fee, 0), 2);
  v_total numeric;
BEGIN
  SELECT * INTO v_win FROM auction_wins WHERE id = p_win_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Win record not found'; END IF;
  IF auth.uid() <> v_win.winner_id THEN RAISE EXCEPTION 'Not your win'; END IF;
  IF v_win.payment_status <> 'pending' THEN RAISE EXCEPTION 'Win is already %', v_win.payment_status; END IF;
  IF v_win.payment_deadline < now() THEN RAISE EXCEPTION 'Payment deadline has passed'; END IF;

  v_total := round(v_win.winning_bid + v_shipping, 2);

  UPDATE auction_wins SET payment_status = 'paid', paid_at = now() WHERE id = p_win_id;

  INSERT INTO orders (buyer_id, total) VALUES (v_win.winner_id, v_total) RETURNING id INTO v_order_id;

  PERFORM _wallet_apply(v_win.winner_id, -v_total, 'auction', 'order', v_order_id, 'Auction payment');

  INSERT INTO order_items (order_id, listing_id, seller_id, quantity, unit_price, fulfillment_status)
  VALUES (v_order_id, v_win.auction_id, v_win.seller_id, 1, v_win.winning_bid, 'confirmed');

  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'auction_payment', 'auction_win', p_win_id,
    jsonb_build_object('auction_id', v_win.auction_id, 'amount', v_win.winning_bid,
      'shipping', v_shipping, 'total', v_total, 'order_id', v_order_id, 'paid_with', 'wallet'));

  RETURN jsonb_build_object('win_id', p_win_id, 'payment_status', 'paid', 'paid_at', now(),
    'order_id', v_order_id, 'total', v_total);
END;
$function$;

COMMIT;
