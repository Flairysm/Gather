-- Likes for social feed comments and replies.
--
-- Mirrors the post_likes design: a join table keyed by (comment_id, user_id),
-- a cached like_count column on post_comments kept in sync by a trigger, and a
-- toggle RPC that flips the current user's like. The feed_comments view is
-- recreated to expose like_count and liked_by_me (new columns appended at the
-- end so CREATE OR REPLACE VIEW stays happy).

BEGIN;

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.post_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_comment_likes_user_idx
  ON public.post_comment_likes (user_id);

-- ─────────────────────────── Count trigger ───────────────────────────

CREATE OR REPLACE FUNCTION public._bump_comment_like_count()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE post_comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_like_count ON public.post_comment_likes;
CREATE TRIGGER trg_comment_like_count
  AFTER INSERT OR DELETE ON public.post_comment_likes
  FOR EACH ROW EXECUTE FUNCTION public._bump_comment_like_count();

-- ─────────────────────────── RLS ───────────────────────────

ALTER TABLE public.post_comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS post_comment_likes_select_own ON public.post_comment_likes;
CREATE POLICY post_comment_likes_select_own ON public.post_comment_likes
  FOR SELECT USING (user_id = auth.uid());

-- ─────────────────────────── View ───────────────────────────

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
  c.parent_comment_id,
  c.like_count,
  EXISTS (
    SELECT 1 FROM public.post_comment_likes cl
    WHERE cl.comment_id = c.id AND cl.user_id = auth.uid()
  )                                                            AS liked_by_me
FROM public.post_comments c
LEFT JOIN public.profiles pr ON pr.id = c.author_id;

GRANT SELECT ON public.feed_comments TO anon, authenticated;

-- ─────────────────────────── Toggle RPC ───────────────────────────

CREATE OR REPLACE FUNCTION public.toggle_comment_like(p_comment_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_exists boolean;
  v_count  integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM post_comments WHERE id = p_comment_id) THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM post_comment_likes WHERE comment_id = p_comment_id AND user_id = v_uid
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM post_comment_likes WHERE comment_id = p_comment_id AND user_id = v_uid;
  ELSE
    INSERT INTO post_comment_likes (comment_id, user_id) VALUES (p_comment_id, v_uid)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT like_count INTO v_count FROM post_comments WHERE id = p_comment_id;
  RETURN jsonb_build_object('liked', NOT v_exists, 'like_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_comment_like(uuid) TO authenticated;

COMMIT;
