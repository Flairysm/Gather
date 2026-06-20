-- Social feed text moderation.
--
-- Goal: minor/casual profanity is allowed, but hate speech / slurs / sexual-violence
-- terms are always blocked, and *excessive* profanity is blocked. Enforced inside the
-- post/comment RPCs so it cannot be bypassed by the client.
--
-- Returns from feed_text_violation():
--   'hate'      -> contains a slur / sexual-violence term (always block)
--   'excessive' -> too many profane words (block)
--   NULL        -> allowed

BEGIN;

-- Normalize text for matching: lowercase, fold common leetspeak, collapse 3+ repeated
-- letters ("fuuuck" -> "fuck"), and turn anything non-alphabetic into a single space.
CREATE OR REPLACE FUNCTION public._moderation_norm(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(lower(coalesce(p_text, '')), '@$013457', 'asoieast'),
          '(.)\1{2,}', '\1', 'g'),
        '[^a-z ]+', ' ', 'g'),
      '\s+', ' ', 'g')
  );
$$;

CREATE OR REPLACE FUNCTION public.feed_text_violation(p_text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  norm     text := public._moderation_norm(p_text);
  despaced text := replace(public._moderation_norm(p_text), ' ', '');
  w        text;
  mild_count int := 0;
  hits     int;
  -- Always-block terms (hate slurs + sexual-violence). Matched whole-word, plus a
  -- spaces-removed pass for the longer ones to catch "n i g g e r"-style evasion.
  severe text[] := ARRAY[
    'nigger','nigga','faggot','retard','chink','spic','kike','coon','wetback',
    'tranny','dyke','paki','beaner','gook','cunt','rape','rapist','molest',
    'pedophile','pedo','bestiality','incest'
  ];
  -- Casual profanity. A little is fine; lots is not (threshold below).
  mild text[] := ARRAY[
    'fuck','shit','ass','asshole','bitch','bastard','dick','dickhead','piss',
    'cock','prick','slut','whore','crap','douche','wank','bollock','bugger',
    'twat','damn','jackass','dumbass'
  ];
BEGIN
  IF norm = '' THEN RETURN NULL; END IF;

  FOREACH w IN ARRAY severe LOOP
    IF norm ~ ('\m' || w || '(s|es|ed|ing|er|ers|y)?\M') THEN
      RETURN 'hate';
    END IF;
    IF char_length(w) >= 5 AND position(w IN despaced) > 0 THEN
      RETURN 'hate';
    END IF;
  END LOOP;

  FOREACH w IN ARRAY mild LOOP
    SELECT count(*) INTO hits
    FROM regexp_matches(norm, '\m' || w || '(s|es|ed|ing|er|ers|y)?\M', 'g');
    mild_count := mild_count + hits;
  END LOOP;

  IF mild_count >= 3 THEN RETURN 'excessive'; END IF;
  RETURN NULL;
END;
$$;

-- ── Re-create post / comment RPCs with the moderation check ──

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
  IF char_length(v_body) > 2000 THEN RAISE EXCEPTION 'Post is too long (max 2000 chars)'; END IF;
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
  IF char_length(v_body) > 1000 THEN RAISE EXCEPTION 'Comment is too long (max 1000 chars)'; END IF;
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

GRANT EXECUTE ON FUNCTION public.add_post_comment(uuid, text, boolean, uuid) TO authenticated;

COMMIT;
