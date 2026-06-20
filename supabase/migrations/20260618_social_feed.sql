-- Social feed ("X for collectors") for Evend.
--
-- Display-only anonymity: posts/comments ALWAYS store the real author_id so
-- moderation and bans work. Public reads go through SECURITY DEFINER views that
-- null out author identity when is_anonymous = true, so the real author_id is
-- never sent to other clients.

BEGIN;

-- ─────────────────────────── Tables ───────────────────────────

CREATE TABLE IF NOT EXISTS public.posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body          text NOT NULL DEFAULT '',
  media_urls    text[] NOT NULL DEFAULT '{}',
  is_anonymous  boolean NOT NULL DEFAULT false,
  like_count    integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  edited_at     timestamptz,
  deleted_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body         text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.post_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  status      text NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS posts_created_idx ON public.posts (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS posts_author_idx ON public.posts (author_id);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON public.post_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS post_likes_user_idx ON public.post_likes (user_id);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON public.follows (followee_id);

-- ─────────────────────────── Count triggers ───────────────────────────

CREATE OR REPLACE FUNCTION public._bump_post_like_count()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_like_count ON public.post_likes;
CREATE TRIGGER trg_post_like_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public._bump_post_like_count();

CREATE OR REPLACE FUNCTION public._bump_post_comment_count()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comment_count ON public.post_comments;
CREATE TRIGGER trg_post_comment_count
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public._bump_post_comment_count();

-- ─────────────────────────── RLS ───────────────────────────
-- Base-table reads are restricted to the owner's own rows. Everyone else reads
-- the feed through the SECURITY DEFINER views below, which strip anonymous
-- authors. Writes go through SECURITY DEFINER RPCs.

ALTER TABLE public.posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posts_select_own ON public.posts;
CREATE POLICY posts_select_own ON public.posts FOR SELECT USING (author_id = auth.uid());

DROP POLICY IF EXISTS post_likes_select_own ON public.post_likes;
CREATE POLICY post_likes_select_own ON public.post_likes FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS post_comments_select_own ON public.post_comments;
CREATE POLICY post_comments_select_own ON public.post_comments FOR SELECT USING (author_id = auth.uid());

DROP POLICY IF EXISTS follows_select ON public.follows;
CREATE POLICY follows_select ON public.follows FOR SELECT
  USING (follower_id = auth.uid() OR followee_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE policies: mutations only through RPCs.

-- ─────────────────────────── Anonymity-stripping views ───────────────────────────
--
-- NOTE: `feed_posts` and `feed_comments` are intentionally SECURITY DEFINER.
-- The Supabase linter flags them (lint 0010 security_definer_view); this is an
-- ACCEPTED EXCEPTION, not a bug. Base tables have owner-only SELECT RLS
-- (author_id = auth.uid()), so these views are the only public read path: they
-- bypass that RLS to show everyone's posts while nulling out author_id for
-- anonymous rows. security_invoker would apply the caller's RLS and return only
-- the viewer's own posts, breaking the feed — and RLS (row-level) cannot do the
-- conditional column masking these views require. Do not flip to security_invoker.

CREATE OR REPLACE VIEW public.feed_posts AS
SELECT
  p.id,
  p.body,
  p.media_urls,
  p.is_anonymous,
  p.like_count,
  p.comment_count,
  p.created_at,
  p.edited_at,
  CASE WHEN p.is_anonymous THEN NULL ELSE p.author_id END        AS author_id,
  CASE WHEN p.is_anonymous THEN NULL ELSE pr.username END        AS author_username,
  CASE WHEN p.is_anonymous THEN NULL ELSE pr.display_name END    AS author_display_name,
  CASE WHEN p.is_anonymous THEN NULL ELSE pr.avatar_url END      AS author_avatar_url,
  (p.author_id = auth.uid())                                     AS is_mine,
  EXISTS (
    SELECT 1 FROM public.post_likes l
    WHERE l.post_id = p.id AND l.user_id = auth.uid()
  )                                                              AS liked_by_me
FROM public.posts p
LEFT JOIN public.profiles pr ON pr.id = p.author_id
WHERE p.deleted_at IS NULL;

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
  (c.author_id = auth.uid())                                   AS is_mine
FROM public.post_comments c
LEFT JOIN public.profiles pr ON pr.id = c.author_id;

GRANT SELECT ON public.feed_posts TO anon, authenticated;
GRANT SELECT ON public.feed_comments TO anon, authenticated;

-- ─────────────────────────── RPCs ───────────────────────────

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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT transaction_banned INTO v_banned FROM profiles WHERE id = v_uid;
  IF COALESCE(v_banned, false) THEN RAISE EXCEPTION 'Account is restricted from posting'; END IF;

  IF v_body = '' AND array_length(v_media, 1) IS NULL THEN
    RAISE EXCEPTION 'Post cannot be empty';
  END IF;
  IF char_length(v_body) > 2000 THEN RAISE EXCEPTION 'Post is too long (max 2000 chars)'; END IF;
  IF COALESCE(array_length(v_media, 1), 0) > 4 THEN RAISE EXCEPTION 'Max 4 images per post'; END IF;

  INSERT INTO posts (author_id, body, media_urls, is_anonymous)
  VALUES (v_uid, v_body, v_media, COALESCE(p_is_anonymous, false))
  RETURNING id INTO v_post_id;

  RETURN v_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_post(p_post_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE posts SET deleted_at = now()
  WHERE id = p_post_id AND author_id = auth.uid() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found or not yours'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM posts WHERE id = p_post_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  SELECT EXISTS (SELECT 1 FROM post_likes WHERE post_id = p_post_id AND user_id = v_uid) INTO v_exists;
  IF v_exists THEN
    DELETE FROM post_likes WHERE post_id = p_post_id AND user_id = v_uid;
  ELSE
    INSERT INTO post_likes (post_id, user_id) VALUES (p_post_id, v_uid)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT like_count INTO v_count FROM posts WHERE id = p_post_id;
  RETURN jsonb_build_object('liked', NOT v_exists, 'like_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_post_comment(
  p_post_id uuid,
  p_body text,
  p_is_anonymous boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_banned boolean;
  v_comment_id uuid;
  v_body text := COALESCE(trim(p_body), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT transaction_banned INTO v_banned FROM profiles WHERE id = v_uid;
  IF COALESCE(v_banned, false) THEN RAISE EXCEPTION 'Account is restricted from commenting'; END IF;
  IF v_body = '' THEN RAISE EXCEPTION 'Comment cannot be empty'; END IF;
  IF char_length(v_body) > 1000 THEN RAISE EXCEPTION 'Comment is too long (max 1000 chars)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM posts WHERE id = p_post_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  INSERT INTO post_comments (post_id, author_id, body, is_anonymous)
  VALUES (p_post_id, v_uid, v_body, COALESCE(p_is_anonymous, false))
  RETURNING id INTO v_comment_id;

  RETURN v_comment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_post_comment(p_comment_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM post_comments WHERE id = p_comment_id AND author_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment not found or not yours'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_post(p_post_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO post_reports (post_id, reporter_id, reason)
  VALUES (p_post_id, v_uid, COALESCE(trim(p_reason), 'unspecified'))
  ON CONFLICT (post_id, reporter_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_follow(p_target_user_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_uid = p_target_user_id THEN RAISE EXCEPTION 'Cannot follow yourself'; END IF;

  SELECT EXISTS (SELECT 1 FROM follows WHERE follower_id = v_uid AND followee_id = p_target_user_id) INTO v_exists;
  IF v_exists THEN
    DELETE FROM follows WHERE follower_id = v_uid AND followee_id = p_target_user_id;
  ELSE
    INSERT INTO follows (follower_id, followee_id) VALUES (v_uid, p_target_user_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('following', NOT v_exists);
END;
$$;

-- ─────────────────────────── Storage bucket ───────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-media', 'post-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "post-media public read" ON storage.objects;
CREATE POLICY "post-media public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "post-media owner write" ON storage.objects;
CREATE POLICY "post-media owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "post-media owner delete" ON storage.objects;
CREATE POLICY "post-media owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'post-media' AND owner = auth.uid());

COMMIT;
