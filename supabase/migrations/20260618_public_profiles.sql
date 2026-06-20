-- Public profiles for the social feed.
--
-- The feed already exposes posts via the SECURITY DEFINER `feed_posts` view
-- (which nulls author_id for anonymous posts). A user's profile shows their
-- NON-anonymous posts only — filtering `feed_posts` by author_id achieves this
-- automatically, since anonymous rows have a null author_id there.
--
-- Follower/following counts can't be read from the client because `follows` RLS
-- only returns rows the caller is part of. This SECURITY DEFINER RPC returns the
-- aggregate profile a viewer is allowed to see.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_profile      profiles%ROWTYPE;
  v_post_count   integer;
  v_followers    integer;
  v_following    integer;
  v_is_following boolean;
  v_store_id     uuid;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_post_count
    FROM posts
    WHERE author_id = p_user_id
      AND deleted_at IS NULL
      AND is_anonymous = false;

  SELECT count(*) INTO v_followers FROM follows WHERE followee_id = p_user_id;
  SELECT count(*) INTO v_following FROM follows WHERE follower_id = p_user_id;

  SELECT EXISTS (
    SELECT 1 FROM follows WHERE follower_id = v_uid AND followee_id = p_user_id
  ) INTO v_is_following;

  SELECT id INTO v_store_id FROM vendor_stores WHERE profile_id = p_user_id LIMIT 1;

  RETURN jsonb_build_object(
    'id',              v_profile.id,
    'username',        v_profile.username,
    'display_name',    v_profile.display_name,
    'avatar_url',      v_profile.avatar_url,
    'bio',             v_profile.bio,
    'verified_seller', COALESCE(v_profile.verified_seller, false),
    'created_at',      v_profile.created_at,
    'post_count',      v_post_count,
    'follower_count',  v_followers,
    'following_count', v_following,
    'is_following',    COALESCE(v_is_following, false),
    'is_me',           COALESCE(p_user_id = v_uid, false),
    'store_id',        v_store_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO authenticated, anon;

COMMIT;
