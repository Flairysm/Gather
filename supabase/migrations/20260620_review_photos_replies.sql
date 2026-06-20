-- Vendor "trust passport" — Phase 2b: Review photos + seller replies.
--
--   * reviews.photos       — buyer-attached photos of what arrived.
--   * reviews.seller_reply — seller's public response to a review.
-- Plus a `review-photos` storage bucket (mirrors `listing-images`) and an
-- updated submit_review that accepts photos, and a reply_to_review RPC.

BEGIN;

-- ── Columns ───────────────────────────────────────────────────────────────
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS photos          text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS seller_reply    text,
  ADD COLUMN IF NOT EXISTS seller_reply_at timestamptz;

-- ── Storage bucket for review photos ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS review_photos_public_read ON storage.objects;
CREATE POLICY review_photos_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'review-photos');

DROP POLICY IF EXISTS review_photos_auth_upload ON storage.objects;
CREATE POLICY review_photos_auth_upload ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'review-photos' AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS review_photos_owner_delete ON storage.objects;
CREATE POLICY review_photos_owner_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'review-photos' AND (auth.uid())::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS review_photos_owner_update ON storage.objects;
CREATE POLICY review_photos_owner_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'review-photos' AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ── submit_review now accepts photos ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_review(
  p_order_id uuid,
  p_seller_id uuid,
  p_rating integer,
  p_comment text DEFAULT NULL,
  p_photos text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_reviewer_id uuid;
  v_avg_rating numeric;
  v_review_count integer;
  v_has_delivered boolean;
  v_has_bad_status boolean;
  v_photos text[] := coalesce(p_photos, '{}'::text[]);
BEGIN
  v_reviewer_id := auth.uid();
  IF v_reviewer_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Rating must be 1-5'; END IF;

  IF NOT EXISTS(SELECT 1 FROM orders WHERE id = p_order_id AND buyer_id = v_reviewer_id) THEN
    RAISE EXCEPTION 'Order not found or not yours';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM order_items WHERE order_id = p_order_id AND fulfillment_status = 'delivered'
  ) INTO v_has_delivered;
  IF NOT v_has_delivered THEN
    RAISE EXCEPTION 'Cannot review: order has not been delivered yet';
  END IF;

  SELECT NOT EXISTS(
    SELECT 1 FROM order_items WHERE order_id = p_order_id AND fulfillment_status NOT IN ('cancelled', 'refunded')
  ) INTO v_has_bad_status;
  IF v_has_bad_status THEN
    RAISE EXCEPTION 'Cannot review: order was cancelled or refunded';
  END IF;

  -- Cap photos defensively.
  IF array_length(v_photos, 1) > 6 THEN
    v_photos := v_photos[1:6];
  END IF;

  INSERT INTO reviews (order_id, reviewer_id, seller_id, rating, comment, photos)
  VALUES (p_order_id, v_reviewer_id, p_seller_id, p_rating, p_comment, v_photos)
  ON CONFLICT (order_id, reviewer_id) DO UPDATE
  SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, photos = EXCLUDED.photos;

  SELECT avg(rating), count(*) INTO v_avg_rating, v_review_count
  FROM reviews WHERE seller_id = p_seller_id;

  UPDATE profiles
  SET rating = round(v_avg_rating, 2),
      review_count = v_review_count,
      updated_at = now()
  WHERE id = p_seller_id;

  RETURN jsonb_build_object(
    'avg_rating', round(v_avg_rating, 2),
    'review_count', v_review_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_review(uuid, uuid, integer, text, text[]) TO authenticated;

-- ── Seller reply ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reply_to_review(p_review_id uuid, p_reply text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_reply text := nullif(btrim(p_reply), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT seller_id INTO v_owner FROM reviews WHERE id = p_review_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Review not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'Only the seller can reply to this review'; END IF;

  UPDATE reviews
  SET seller_reply = v_reply,
      seller_reply_at = CASE WHEN v_reply IS NULL THEN NULL ELSE now() END
  WHERE id = p_review_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reply_to_review(uuid, text) TO authenticated;

COMMIT;
