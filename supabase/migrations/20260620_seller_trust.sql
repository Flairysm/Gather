-- Vendor "trust passport" — Phase 3: Trust score / tier + response time.
--
-- get_seller_trust(seller) returns a friendly, passport-style summary:
--   * score (0-100) using the same components as _rank_seller_quality
--     (Bayesian rating, sales, listing recency, verification, disputes).
--   * tier: Bronze / Silver / Gold / Platinum.
--   * response time: median minutes between an inbound message and the
--     seller's next reply (last 90 days), plus a human label.
--
-- Also drops the now-stale 4-arg submit_review overload; the app always calls
-- the 5-arg version (with photos) shipped in 20260620_review_photos_replies.

BEGIN;

DROP FUNCTION IF EXISTS public.submit_review(uuid, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.get_seller_trust(p_seller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_p             profiles%ROWTYPE;
  v_last_at       timestamptz;
  v_open_disputes numeric;
  v_score01       numeric;
  v_score         integer;
  v_tier          text;
  v_resp_min      numeric;
  v_resp_label    text;
BEGIN
  SELECT * INTO v_p FROM profiles WHERE id = p_seller_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT max(created_at) INTO v_last_at FROM listings WHERE seller_id = p_seller_id;

  SELECT count(*)::numeric INTO v_open_disputes
  FROM disputes
  WHERE seller_id = p_seller_id AND status IN ('open', 'under_review');

  -- Mirror _rank_seller_quality (0..1).
  v_score01 :=
      0.35 * (
        ((8 * 4.6) + coalesce(v_p.rating, 4.6) * greatest(coalesce(v_p.review_count, 0), 0))
        / (8 + greatest(coalesce(v_p.review_count, 0), 0))
      ) / 5.0
    + 0.25 * least(ln(1 + greatest(coalesce(v_p.total_sales, 0), 0)) / ln(501), 1)
    + 0.20 * (CASE
                WHEN v_last_at IS NULL THEN 0
                ELSE exp(- (extract(epoch FROM (now() - v_last_at)) / 86400.0) / 30.0)
              END)
    + 0.10 * (CASE WHEN coalesce(v_p.verified_seller, false) THEN 1 ELSE 0 END)
    - 0.10 * least(coalesce(v_open_disputes, 0) / (greatest(coalesce(v_p.total_sales, 0), 0) + 5), 1);

  v_score := greatest(0, least(100, round(v_score01 * 100)))::integer;

  v_tier := CASE
    WHEN v_score >= 85 THEN 'Platinum'
    WHEN v_score >= 70 THEN 'Gold'
    WHEN v_score >= 50 THEN 'Silver'
    ELSE 'Bronze'
  END;

  -- Median reply latency: gap between an inbound message and the seller's
  -- next message in the same conversation (ignore gaps > 7 days).
  WITH convs AS (
    SELECT id FROM conversations WHERE p_seller_id = ANY (participant_ids)
  ),
  msgs AS (
    SELECT
      m.sender_id,
      m.created_at,
      lag(m.sender_id)  OVER w AS prev_sender,
      lag(m.created_at) OVER w AS prev_at
    FROM messages m
    JOIN convs c ON c.id = m.conversation_id
    WHERE m.created_at > now() - interval '90 days'
    WINDOW w AS (PARTITION BY m.conversation_id ORDER BY m.created_at)
  ),
  gaps AS (
    SELECT extract(epoch FROM (created_at - prev_at)) / 60.0 AS gap_min
    FROM msgs
    WHERE sender_id = p_seller_id
      AND prev_sender IS NOT NULL
      AND prev_sender <> p_seller_id
      AND created_at - prev_at < interval '7 days'
  )
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_min) INTO v_resp_min FROM gaps;

  v_resp_label := CASE
    WHEN v_resp_min IS NULL    THEN NULL
    WHEN v_resp_min < 15       THEN 'Usually replies within minutes'
    WHEN v_resp_min < 60       THEN 'Usually replies within an hour'
    WHEN v_resp_min < 60 * 6   THEN 'Usually replies within a few hours'
    WHEN v_resp_min < 60 * 24  THEN 'Usually replies within a day'
    ELSE 'Usually replies within a few days'
  END;

  RETURN jsonb_build_object(
    'score',           v_score,
    'tier',            v_tier,
    'response_minutes', v_resp_min,
    'response_label',  v_resp_label
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_trust(uuid) TO authenticated, anon;

COMMIT;
