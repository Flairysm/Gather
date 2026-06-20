-- Trust passport — vouches as written testimonials.
--
-- Surfaces the vouch note (text) as primary content: get_seller_vouches now
-- returns created_at per voucher and prioritises vouches that have a written
-- note (then followed vouchers, then recency), with a larger sample so the
-- Reviews tab can render a dedicated "Vouches" testimonial section.

BEGIN;

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
      v.created_at,
      (v_uid IS NOT NULL AND v.voucher_id = v_uid) AS is_me,
      (v_uid IS NOT NULL AND EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = v_uid AND f.followee_id = v.voucher_id
      )) AS is_followed
    FROM vouches v
    JOIN profiles p ON p.id = v.voucher_id
    WHERE v.seller_id = p_seller_id
    ORDER BY (v.note IS NOT NULL AND btrim(v.note) <> '') DESC,
             is_followed DESC,
             v.created_at DESC
    LIMIT 50
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

GRANT EXECUTE ON FUNCTION public.get_seller_vouches(uuid) TO authenticated, anon;

COMMIT;
