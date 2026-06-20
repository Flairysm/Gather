-- Auction bid holds (escrow) for the closed-loop wallet.
--
-- Model: you can only bid up to your AVAILABLE balance = wallet balance minus
-- funds already reserved by your active (highest) bids on other auctions.
--   • Becoming the highest bidder reserves your bid amount (an "active" hold).
--   • Being outbid releases your hold; raising your own bid replaces it.
--   • Winning keeps the hold reserved until you complete checkout, where the
--     bid + shipping are captured from the wallet (guaranteed to succeed for the
--     bid portion because it was reserved). Losing releases it.
--   • Unpaid wins past their deadline expire and release the hold (hourly cron).
--
-- Every wallet debit (marketplace + auctions) now refuses to spend reserved
-- funds, so a user can never out-commit their wallet across concurrent auctions.

BEGIN;

-- ─────────────────────────── Holds table ───────────────────────────

CREATE TABLE IF NOT EXISTS public.auction_holds (
  auction_id  uuid NOT NULL REFERENCES public.auction_items(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      numeric(12,2) NOT NULL CHECK (amount >= 0),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','captured')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  PRIMARY KEY (auction_id, user_id)
);

CREATE INDEX IF NOT EXISTS auction_holds_active_idx
  ON public.auction_holds (user_id) WHERE status = 'active';

ALTER TABLE public.auction_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auction_holds_select_own ON public.auction_holds;
CREATE POLICY auction_holds_select_own ON public.auction_holds
  FOR SELECT USING (user_id = auth.uid());
-- No write policies: holds change only through the SECURITY DEFINER RPCs below.

-- Sum of a user's currently reserved (active) bid funds.
CREATE OR REPLACE FUNCTION public._active_holds(p_user_id uuid)
RETURNS numeric
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(sum(amount), 0)
  FROM auction_holds
  WHERE user_id = p_user_id AND status = 'active';
$$;
REVOKE ALL ON FUNCTION public._active_holds(uuid) FROM anon, authenticated;

-- ──────────── Wallet debit guard: never spend reserved funds ────────────

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

  -- A debit must not consume funds reserved for the user's active bids.
  -- (When capturing a winning bid, that hold is marked 'captured' first, so it
  -- is excluded here.)
  IF p_amount < 0 AND v_balance < public._active_holds(p_user_id) THEN
    RAISE EXCEPTION 'Those funds are reserved for your active auction bids'
      USING ERRCODE = 'P0001', HINT = 'reserved_for_bids';
  END IF;

  UPDATE evend_wallets SET balance = v_balance, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO wallet_ledger (user_id, amount, balance_after, type, reference_type, reference_id, description)
  VALUES (p_user_id, round(p_amount, 2), v_balance, p_type, p_ref_type, p_ref_id, p_desc);

  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public._wallet_apply(uuid, numeric, text, text, uuid, text) FROM anon, authenticated;

-- ──────────── get_wallet: expose balance / held / available ────────────

CREATE OR REPLACE FUNCTION public.get_wallet()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_held numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO evend_wallets (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM evend_wallets WHERE user_id = v_uid;
  v_held := public._active_holds(v_uid);
  RETURN jsonb_build_object(
    'balance', v_balance,
    'held', v_held,
    'available', GREATEST(round(v_balance - v_held, 2), 0)
  );
END;
$$;

-- ──────────── place_bid: enforce available balance + manage holds ────────────

CREATE OR REPLACE FUNCTION public.place_bid(p_auction_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_auction auction_items%ROWTYPE;
  v_bidder_id uuid;
  v_bidder profiles%ROWTYPE;
  v_min_bid numeric;
  v_time_extended boolean := false;
  v_new_ends_at timestamptz;
  v_last_bid_at timestamptz;
  v_balance numeric;
  v_own_hold numeric;
  v_available numeric;
  v_prev_leader uuid;
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

  -- ── Wallet gate: bid cannot exceed available (balance minus other reserved bids) ──
  -- Lock the wallet row to serialize this user's concurrent bids across auctions.
  INSERT INTO evend_wallets (user_id) VALUES (v_bidder_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM evend_wallets WHERE user_id = v_bidder_id FOR UPDATE;

  SELECT COALESCE(amount, 0) INTO v_own_hold
  FROM auction_holds
  WHERE auction_id = p_auction_id AND user_id = v_bidder_id AND status = 'active';
  v_own_hold := COALESCE(v_own_hold, 0);

  -- Available adds back this auction's own existing hold, since it is replaced.
  v_available := round(v_balance - public._active_holds(v_bidder_id) + v_own_hold, 2);
  IF p_amount > v_available THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Bid exceeds your available wallet balance (RM%). Top up to bid higher.', v_available
      USING ERRCODE = 'P0001', HINT = 'insufficient_funds';
  END IF;

  v_prev_leader := v_auction.highest_bidder_id;

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

  -- Release the previous leader's reservation (if it was someone else).
  IF v_prev_leader IS NOT NULL AND v_prev_leader <> v_bidder_id THEN
    UPDATE auction_holds
    SET status = 'released', released_at = now(), updated_at = now()
    WHERE auction_id = p_auction_id AND user_id = v_prev_leader AND status = 'active';
  END IF;

  -- Reserve the new highest bid for this bidder (replace any prior hold).
  INSERT INTO auction_holds (auction_id, user_id, amount, status)
  VALUES (p_auction_id, v_bidder_id, p_amount, 'active')
  ON CONFLICT (auction_id, user_id) DO UPDATE
    SET amount = EXCLUDED.amount, status = 'active', released_at = NULL, updated_at = now();

  RETURN jsonb_build_object(
    'auction_id', p_auction_id,
    'current_bid', p_amount,
    'bid_count', COALESCE(v_auction.bid_count, 0) + 1,
    'highest_bidder_id', v_bidder_id,
    'ends_at', v_new_ends_at,
    'time_extended', v_time_extended
  );
END;
$$;

-- ──────────── end_auction: release losers' holds, keep the winner's ────────────

CREATE OR REPLACE FUNCTION public.end_auction(p_auction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_auction auction_items%ROWTYPE;
  v_caller_id uuid;
  v_winner_id uuid;
  v_reserve_met boolean := true;
  v_win_id uuid;
BEGIN
  v_caller_id := auth.uid();

  SELECT * INTO v_auction FROM auction_items WHERE id = p_auction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auction not found'; END IF;
  IF v_auction.status <> 'active' THEN RAISE EXCEPTION 'Auction is not active'; END IF;

  -- Only the seller can end early; otherwise auction must have expired
  IF v_auction.ends_at > now() AND v_caller_id <> v_auction.seller_id THEN
    RAISE EXCEPTION 'Auction has not ended yet';
  END IF;

  v_winner_id := v_auction.highest_bidder_id;

  IF v_auction.reserve_price IS NOT NULL
     AND (v_auction.current_bid IS NULL OR v_auction.current_bid < v_auction.reserve_price) THEN
    v_reserve_met := false;
    v_winner_id := NULL;
  END IF;

  UPDATE auction_items
  SET status = 'ended', winner_id = v_winner_id, updated_at = now()
  WHERE id = p_auction_id;

  IF v_winner_id IS NOT NULL AND v_auction.current_bid IS NOT NULL THEN
    INSERT INTO auction_wins (auction_id, winner_id, seller_id, winning_bid, payment_deadline)
    VALUES (p_auction_id, v_winner_id, v_auction.seller_id, v_auction.current_bid, now() + interval '3 days')
    RETURNING id INTO v_win_id;
  END IF;

  -- Release every active hold on this auction except the winner's (which stays
  -- reserved until they pay). If there is no winner, this releases all of them.
  UPDATE auction_holds
  SET status = 'released', released_at = now(), updated_at = now()
  WHERE auction_id = p_auction_id
    AND status = 'active'
    AND user_id IS DISTINCT FROM v_winner_id;

  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (COALESCE(v_caller_id, '00000000-0000-0000-0000-000000000000'), 'auction_ended', 'auction', p_auction_id,
    jsonb_build_object('winner_id', v_winner_id, 'reserve_met', v_reserve_met, 'final_bid', v_auction.current_bid));

  RETURN jsonb_build_object(
    'auction_id', p_auction_id,
    'status', 'ended',
    'winner_id', v_winner_id,
    'reserve_met', v_reserve_met,
    'final_bid', v_auction.current_bid,
    'win_id', v_win_id
  );
END;
$$;

-- ──────────── Fix polymorphic order_items.listing_id ────────────
-- order_items.listing_id is used polymorphically by the app: it points to
-- listings(id) for marketplace orders and to auction_items(id) for auction
-- wins (see MyOrdersScreen hydration). The FK to listings(id) therefore made
-- auction payments impossible (every pay_auction_win violated it). Drop it so
-- auction wins can create real order rows as the app already expects.
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_listing_id_fkey;

-- ──────────── pay_auction_win: capture the reserved bid + shipping ────────────

DROP FUNCTION IF EXISTS public.pay_auction_win(uuid, numeric);
CREATE OR REPLACE FUNCTION public.pay_auction_win(p_win_id uuid, p_shipping_fee numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- Convert the reservation into a real charge: mark the hold captured BEFORE
  -- debiting so it is no longer counted as "reserved" by the wallet guard.
  UPDATE auction_holds
  SET status = 'captured', updated_at = now()
  WHERE auction_id = v_win.auction_id AND user_id = v_win.winner_id AND status = 'active';

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
$$;

-- ──────────── Expire overdue wins + release their holds (hourly) ────────────

CREATE OR REPLACE FUNCTION public.expire_overdue_wins()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE auction_wins
  SET payment_status = 'expired'
  WHERE payment_status = 'pending' AND payment_deadline < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE auction_holds h
  SET status = 'released', released_at = now(), updated_at = now()
  FROM auction_wins w
  WHERE w.payment_status = 'expired'
    AND h.auction_id = w.auction_id
    AND h.user_id = w.winner_id
    AND h.status = 'active';

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_overdue_wins() FROM anon, authenticated;

DO $cron$
BEGIN
  PERFORM cron.unschedule('expire-auction-wins');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

DO $cron$
BEGIN
  PERFORM cron.schedule('expire-auction-wins', '0 * * * *', 'SELECT public.expire_overdue_wins();');
EXCEPTION WHEN OTHERS THEN NULL;
END
$cron$;

COMMIT;
