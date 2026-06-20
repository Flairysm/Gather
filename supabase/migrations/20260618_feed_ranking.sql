-- Feed ranking ("hot" algorithm) for the social feed.
--
-- The default feed was strictly chronological (newest first), so a highly
-- engaged post would sink below brand-new empty ones. This adds a ranked feed
-- that blends three signals, in the spirit of Reddit/Hacker News "hot":
--
--   1. Engagement  — likes + comments (comments weighted higher; they're a
--                    stronger signal than a tap).
--   2. Time decay  — older posts fall off via a gravity exponent. The "+2" in
--                    the denominator is a freshness floor so a just-posted item
--                    with zero engagement still surfaces (avoids cold start).
--   3. Personalization — posts whose author the viewer follows get a boost.
--                    Anonymous posts have a NULL author here, so they're never
--                    boosted and rank purely on engagement.
--
-- It reads through the existing `feed_posts` view, so anonymity stripping and
-- the per-viewer `is_mine` / `liked_by_me` flags are reused unchanged.
--
-- Pagination is offset-based: the score changes over time, so keyset pagination
-- by created_at no longer applies. At current volume sorting the recent window
-- per request is cheap. The scale path (when this gets slow) is a materialized
-- `hot_score` column refreshed by pg_cron and keyset-paginated by (score, id).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_ranked_feed(
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
  LEFT JOIN public.follows fl
    ON fl.follower_id = auth.uid()
   AND fl.followee_id = fp.author_id
  ORDER BY
    (
      (1 + 3 * fp.comment_count + fp.like_count)
      / power(extract(epoch FROM (now() - fp.created_at)) / 3600.0 + 2, 1.5)
      * (CASE WHEN fl.followee_id IS NOT NULL THEN 1.6 ELSE 1.0 END)
    ) DESC,
    fp.created_at DESC,
    fp.id DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_ranked_feed(integer, integer) TO anon, authenticated;

COMMIT;
