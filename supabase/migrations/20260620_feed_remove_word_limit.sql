-- Revert the word-count limits added in 20260620_feed_word_limit.sql.
-- Per product decision, anti-spam length is enforced by CHARACTER caps
-- (2000 chars per post, 1000 per comment) which already existed; the word
-- checks are removed. Profanity moderation and all other logic are unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_post(
  p_body text,
  p_media_urls text[] DEFAULT '{}',
  p_is_anonymous boolean DEFAULT false
) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_banned boolean;
  v_post_id uuid;
  v_body text := COALESCE(trim(p_body), '');
  v_media text[] := COALESCE(p_media_urls, '{}');
  v_mod text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT transaction_banned INTO v_banned FROM profiles WHERE id = v_uid;
  IF COALESCE(v_banned, false) THEN RAISE EXCEPTION 'Account is restricted from posting'; END IF;

  IF v_body = '' AND array_length(v_media, 1) IS NULL THEN
    RAISE EXCEPTION 'Post cannot be empty';
  END IF;
  IF char_length(v_body) > 2000 THEN RAISE EXCEPTION 'Post is too long (max 2000 characters)'; END IF;
  IF COALESCE(array_length(v_media, 1), 0) > 4 THEN RAISE EXCEPTION 'Max 4 images per post'; END IF;

  IF v_body <> '' THEN
    v_mod := public.feed_text_violation(v_body);
    IF v_mod = 'hate' THEN
      RAISE EXCEPTION 'Your post contains hateful or sexual language that is not allowed on Evend.';
    ELSIF v_mod = 'excessive' THEN
      RAISE EXCEPTION 'Please tone down the profanity before posting.';
    END IF;
  END IF;

  INSERT INTO posts (author_id, body, media_urls, is_anonymous)
  VALUES (v_uid, v_body, v_media, COALESCE(p_is_anonymous, false))
  RETURNING id INTO v_post_id;

  RETURN v_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_post_comment(
  p_post_id uuid,
  p_body text,
  p_is_anonymous boolean DEFAULT false,
  p_parent_comment_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_banned boolean;
  v_comment_id uuid;
  v_body text := COALESCE(trim(p_body), '');
  v_parent_post uuid;
  v_mod text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT transaction_banned INTO v_banned FROM profiles WHERE id = v_uid;
  IF COALESCE(v_banned, false) THEN RAISE EXCEPTION 'Account is restricted from commenting'; END IF;
  IF v_body = '' THEN RAISE EXCEPTION 'Comment cannot be empty'; END IF;
  IF char_length(v_body) > 1000 THEN RAISE EXCEPTION 'Comment is too long (max 1000 characters)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM posts WHERE id = p_post_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  v_mod := public.feed_text_violation(v_body);
  IF v_mod = 'hate' THEN
    RAISE EXCEPTION 'Your comment contains hateful or sexual language that is not allowed on Evend.';
  ELSIF v_mod = 'excessive' THEN
    RAISE EXCEPTION 'Please tone down the profanity before commenting.';
  END IF;

  IF p_parent_comment_id IS NOT NULL THEN
    SELECT post_id INTO v_parent_post FROM post_comments WHERE id = p_parent_comment_id;
    IF v_parent_post IS NULL THEN
      RAISE EXCEPTION 'Parent comment not found';
    END IF;
    IF v_parent_post <> p_post_id THEN
      RAISE EXCEPTION 'Parent comment belongs to a different post';
    END IF;
  END IF;

  INSERT INTO post_comments (post_id, author_id, body, is_anonymous, parent_comment_id)
  VALUES (p_post_id, v_uid, v_body, COALESCE(p_is_anonymous, false), p_parent_comment_id)
  RETURNING id INTO v_comment_id;

  RETURN v_comment_id;
END;
$$;

COMMIT;
