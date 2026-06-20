-- "Following" feed: a strictly chronological timeline of posts from the
-- accounts the viewer follows. Pairs with `get_ranked_feed` (the "For You"
-- tab). A SECURITY DEFINER function is required because `follows` RLS only
-- exposes rows the caller participates in, and we want to join against them
-- server-side.
--
-- Anonymous posts have a NULL author in `feed_posts`, so the join naturally
-- excludes them — you can't attribute an anonymous post to "someone you
-- follow" without leaking identity, which is the desired behavior.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_following_feed(
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id                   uuid,
  body                 text,
  media_urls           text[],
  is_anonymous         boolean,
  like_count           integer,
  comment_count        integer,
  created_at           timestamptz,
  edited_at            timestamptz,
  author_id            uuid,
  author_username      text,
  author_display_name  text,
  author_avatar_url    text,
  is_mine              boolean,
  liked_by_me          boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    fp.id,
    fp.body,
    fp.media_urls,
    fp.is_anonymous,
    fp.like_count,
    fp.comment_count,
    fp.created_at,
    fp.edited_at,
    fp.author_id,
    fp.author_username,
    fp.author_display_name,
    fp.author_avatar_url,
    fp.is_mine,
    fp.liked_by_me
  FROM public.feed_posts fp
  JOIN public.follows fl
    ON fl.follower_id = auth.uid()
   AND fl.followee_id = fp.author_id
  ORDER BY fp.created_at DESC, fp.id DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_following_feed(integer, integer) TO anon, authenticated;

COMMIT;
