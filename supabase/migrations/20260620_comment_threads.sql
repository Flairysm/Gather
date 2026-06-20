-- Threaded comment replies for the social feed.
--
-- Comments can now reference a parent comment (`parent_comment_id`), forming a
-- thread (Threads-style). Replies still count toward the post's total
-- comment_count (the existing trigger is unchanged). Deleting a comment cascades
-- to its replies via the self-referencing FK.

BEGIN;

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid
    REFERENCES public.post_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS post_comments_parent_idx
  ON public.post_comments (parent_comment_id, created_at);

-- Expose the parent link through the anonymity-stripping view.
-- New view columns must be appended at the end for CREATE OR REPLACE VIEW.
-- Intentionally SECURITY DEFINER (see 20260618_social_feed.sql): the Supabase
-- linter 0010 flag on this view is an accepted exception. Do not flip to
-- security_invoker — it would apply owner-only RLS and break public reads.
CREATE OR REPLACE VIEW public.feed_comments AS
SELECT
  c.id,
  c.post_id,
  c.body,
  c.is_anonymous,
  c.created_at,
  CASE WHEN c.is_anonymous THEN NULL ELSE c.author_id END      AS author_id,
  CASE WHEN c.is_anonymous THEN NULL ELSE pr.username END      AS author_username,
  CASE WHEN c.is_anonymous THEN NULL ELSE pr.display_name END  AS author_display_name,
  CASE WHEN c.is_anonymous THEN NULL ELSE pr.avatar_url END    AS author_avatar_url,
  (c.author_id = auth.uid())                                   AS is_mine,
  c.parent_comment_id
FROM public.post_comments c
LEFT JOIN public.profiles pr ON pr.id = c.author_id;

GRANT SELECT ON public.feed_comments TO anon, authenticated;

-- Replace the 3-arg RPC with a 4-arg version that accepts an optional parent.
DROP FUNCTION IF EXISTS public.add_post_comment(uuid, text, boolean);

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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT transaction_banned INTO v_banned FROM profiles WHERE id = v_uid;
  IF COALESCE(v_banned, false) THEN RAISE EXCEPTION 'Account is restricted from commenting'; END IF;
  IF v_body = '' THEN RAISE EXCEPTION 'Comment cannot be empty'; END IF;
  IF char_length(v_body) > 1000 THEN RAISE EXCEPTION 'Comment is too long (max 1000 chars)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM posts WHERE id = p_post_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  -- A reply must point at an existing comment on the same post.
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

GRANT EXECUTE ON FUNCTION public.add_post_comment(uuid, text, boolean, uuid) TO authenticated;

COMMIT;
