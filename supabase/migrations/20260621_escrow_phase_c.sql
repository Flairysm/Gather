-- Penalty / strike system — Phase C
--
-- Gives teeth to the escrow rules. Records policy strikes and auto-restricts an
-- account after 3 strikes within a rolling 90-day window. Strikes are issued for:
--   * auction_no_pay  — winner didn't pay by the deadline (auction flake)
--   * seller_no_ship  — buyer cancelled an order the seller failed to ship in time
--   * dispute_lost    — a dispute was resolved in the buyer's favor
--
-- transaction_banned is already enforced by place_bid() and create_card_checkout(),
-- so an auto-restrict immediately blocks bidding, buying, and (via existing checks)
-- selling actions.

CREATE TABLE IF NOT EXISTS public.user_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('auction_no_pay','seller_no_ship','dispute_lost')),
  reason text,
  reference_type text,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_strikes_user ON public.user_strikes(user_id, created_at DESC);

ALTER TABLE public.user_strikes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_strikes_select_self ON public.user_strikes;
CREATE POLICY user_strikes_select_self ON public.user_strikes
  FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies: only SECURITY DEFINER functions write strikes.

-- ── add_strike: record a strike, auto-restrict at 3 within 90 days ──────────
CREATE OR REPLACE FUNCTION public.add_strike(
  p_user_id uuid,
  p_kind text,
  p_reason text DEFAULT NULL,
  p_ref_type text DEFAULT NULL,
  p_ref_id uuid DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_recent int;
  v_threshold int := 3;
  v_banned boolean;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('status', 'noop'); END IF;

  INSERT INTO user_strikes (user_id, kind, reason, reference_type, reference_id)
  VALUES (p_user_id, p_kind, p_reason, p_ref_type, p_ref_id);

  SELECT count(*) INTO v_recent
    FROM user_strikes
    WHERE user_id = p_user_id AND created_at > now() - interval '90 days';

  SELECT transaction_banned INTO v_banned FROM profiles WHERE id = p_user_id;

  IF v_recent >= v_threshold AND NOT COALESCE(v_banned, false) THEN
    UPDATE profiles
      SET transaction_banned = true,
          transaction_ban_reason = format(
            'Auto-restricted after %s policy strikes in 90 days (missed payments or unshipped orders). Contact support to appeal.',
            v_recent)
      WHERE id = p_user_id;

    INSERT INTO notifications (user_id, type, title, body, icon, color)
    VALUES (p_user_id, 'account_restricted', 'Account restricted',
      'Your account has been restricted from buying, bidding, and selling after repeated policy strikes. Contact support to appeal.',
      'ban', '#EF4444');

    RETURN jsonb_build_object('status', 'banned', 'strikes', v_recent);
  END IF;

  RETURN jsonb_build_object('status', 'struck', 'strikes', v_recent);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_strike(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_strike(uuid, text, text, text, uuid) TO service_role;

-- ── expire_overdue_wins: now strikes the flaking winner ─────────────────────
CREATE OR REPLACE FUNCTION public.expire_overdue_wins()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    UPDATE auction_wins
      SET payment_status = 'expired'
      WHERE payment_status = 'pending' AND payment_deadline < now()
      RETURNING winner_id, auction_id
  LOOP
    v_count := v_count + 1;
    PERFORM add_strike(r.winner_id, 'auction_no_pay',
      'Did not pay for an auction win by the deadline', 'auction', r.auction_id);
  END LOOP;

  UPDATE auction_holds h
    SET status = 'released', released_at = now(), updated_at = now()
    FROM auction_wins w
    WHERE w.payment_status = 'expired'
      AND h.auction_id = w.auction_id
      AND h.user_id = w.winner_id
      AND h.status = 'active';

  RETURN v_count;
END;
$function$;
