-- Vendor "trust passport" — Phase 2a: Vouches.
--
-- Vouches are peer endorsements, distinct from star ratings:
--   * Ratings (reviews) are transactional — one per order, star-based.
--   * Vouches are a social "I vouch for this seller" signal.
--
-- Anti-fraud gate (product decision): only a buyer with >=1 DELIVERED order
-- item from that seller may vouch. Writes go exclusively through SECURITY
-- DEFINER RPCs (no direct client INSERT/DELETE), mirroring submit_review.

BEGIN;

-- ── Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vouches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voucher_id, seller_id),
  CHECK (voucher_id <> seller_id)
);

CREATE INDEX IF NOT EXISTS vouches_seller_idx ON public.vouches (seller_id);

-- Denormalised counter on profiles (mirrors review_count).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vouch_count integer NOT NULL DEFAULT 0;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.vouches ENABLE ROW LEVEL SECURITY;

-- Public read so the storefront can show who vouched.
DROP POLICY IF EXISTS vouches_public_read ON public.vouches;
CREATE POLICY vouches_public_read ON public.vouches
  FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policies: all writes flow through the RPCs below.

-- ── Helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._refresh_vouch_count(p_seller_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM vouches WHERE seller_id = p_seller_id;
  UPDATE profiles SET vouch_count = v_count, updated_at = now() WHERE id = p_seller_id;
  RETURN v_count;
END;
$$;

-- ── Add / remove vouch ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_vouch(p_seller_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_eligible  boolean;
  v_count     integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_uid = p_seller_id THEN RAISE EXCEPTION 'You cannot vouch for yourself'; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.buyer_id = v_uid
      AND oi.seller_id = p_seller_id
      AND oi.fulfillment_status = 'delivered'
  ) INTO v_eligible;

  IF NOT v_eligible THEN
    RAISE EXCEPTION 'Only buyers with a completed order from this seller can vouch';
  END IF;

  INSERT INTO vouches (voucher_id, seller_id, note)
  VALUES (v_uid, p_seller_id, nullif(btrim(p_note), ''))
  ON CONFLICT (voucher_id, seller_id) DO UPDATE SET note = EXCLUDED.note;

  v_count := public._refresh_vouch_count(p_seller_id);
  RETURN jsonb_build_object('vouched', true, 'vouch_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_vouch(p_seller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM vouches WHERE voucher_id = v_uid AND seller_id = p_seller_id;
  v_count := public._refresh_vouch_count(p_seller_id);
  RETURN jsonb_build_object('vouched', false, 'vouch_count', v_count);
END;
$$;

-- ── Read aggregate (social-graph aware) ─────────────────────────────────────
-- Returns total, whether the viewer has vouched / is eligible, the count of
-- vouchers the viewer follows, and a sample (followed vouchers first).
CREATE OR REPLACE FUNCTION public.get_seller_vouches(p_seller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_total         integer;
  v_has_vouched   boolean := false;
  v_eligible      boolean := false;
  v_followed_cnt  integer := 0;
  v_sample        jsonb;
BEGIN
  SELECT count(*) INTO v_total FROM vouches WHERE seller_id = p_seller_id;

  IF v_uid IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM vouches WHERE seller_id = p_seller_id AND voucher_id = v_uid
    ) INTO v_has_vouched;

    SELECT EXISTS (
      SELECT 1
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.buyer_id = v_uid
        AND oi.seller_id = p_seller_id
        AND oi.fulfillment_status = 'delivered'
    ) INTO v_eligible;
    v_eligible := v_eligible AND v_uid <> p_seller_id;

    SELECT count(*) INTO v_followed_cnt
    FROM vouches vv
    JOIN follows f ON f.followee_id = vv.voucher_id
    WHERE vv.seller_id = p_seller_id AND f.follower_id = v_uid;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_sample
  FROM (
    SELECT
      v.voucher_id AS id,
      p.username,
      p.display_name,
      p.avatar_url,
      v.note,
      (v_uid IS NOT NULL AND EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = v_uid AND f.followee_id = v.voucher_id
      )) AS is_followed
    FROM vouches v
    JOIN profiles p ON p.id = v.voucher_id
    WHERE v.seller_id = p_seller_id
    ORDER BY is_followed DESC, v.created_at DESC
    LIMIT 24
  ) s;

  RETURN jsonb_build_object(
    'total',          v_total,
    'has_vouched',    v_has_vouched,
    'eligible',       v_eligible,
    'followed_count', v_followed_cnt,
    'sample',         v_sample
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_vouch(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_vouch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_vouches(uuid) TO authenticated, anon;

COMMIT;
