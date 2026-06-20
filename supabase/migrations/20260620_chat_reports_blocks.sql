-- Chat safety: report a conversation/user and block a user.
--
-- Mirrors the social `post_reports` pattern: owner-only SELECT RLS on the base
-- tables, all writes go through SECURITY DEFINER RPCs. Admin tooling reads these
-- via the service role (which bypasses RLS). A BEFORE INSERT trigger on
-- `messages` enforces blocks server-side so a blocked user cannot message the
-- person who blocked them, regardless of client.

BEGIN;

-- ─────────────────────────── Tables ───────────────────────────

CREATE TABLE IF NOT EXISTS public.user_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id  uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  reason           text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'open',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_reports_reporter_idx ON public.user_reports (reporter_id);
CREATE INDEX IF NOT EXISTS user_reports_reported_idx ON public.user_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS user_reports_status_idx   ON public.user_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx   ON public.user_blocks (blocked_id);

-- ─────────────────────────── RLS ───────────────────────────
-- Owner-only reads; writes only through the RPCs below.

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_reports_select_own ON public.user_reports;
CREATE POLICY user_reports_select_own ON public.user_reports
  FOR SELECT USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own ON public.user_blocks
  FOR SELECT USING (blocker_id = auth.uid());

-- ─────────────────────────── RPCs ───────────────────────────

-- Report a conversation. The reported user is derived from the conversation's
-- other participant so the client can't spoof it.
CREATE OR REPLACE FUNCTION public.report_conversation(
  p_conversation_id uuid,
  p_reason text DEFAULT ''
) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_parts   uuid[];
  v_other   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT participant_ids INTO v_parts
  FROM conversations WHERE id = p_conversation_id;

  IF v_parts IS NULL OR NOT (v_uid = ANY(v_parts)) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  v_other := (SELECT p FROM unnest(v_parts) p WHERE p <> v_uid LIMIT 1);

  INSERT INTO user_reports (reporter_id, reported_user_id, conversation_id, reason)
  VALUES (v_uid, v_other, p_conversation_id, COALESCE(NULLIF(trim(p_reason), ''), 'Reported from chat'));
END;
$$;

-- Block a user: records the block and hides any shared conversations for the
-- blocker so they disappear from the inbox.
CREATE OR REPLACE FUNCTION public.block_user(p_blocked uuid)
RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_blocked IS NULL OR p_blocked = v_uid THEN
    RAISE EXCEPTION 'cannot block this user' USING ERRCODE = '22023';
  END IF;

  INSERT INTO user_blocks (blocker_id, blocked_id)
  VALUES (v_uid, p_blocked)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  INSERT INTO conversation_user_meta (user_id, conversation_id, is_hidden, updated_at)
  SELECT v_uid, c.id, true, now()
  FROM conversations c
  WHERE v_uid = ANY(c.participant_ids) AND p_blocked = ANY(c.participant_ids)
  ON CONFLICT (user_id, conversation_id)
  DO UPDATE SET is_hidden = true, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_blocked uuid)
RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  DELETE FROM user_blocks WHERE blocker_id = v_uid AND blocked_id = p_blocked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_conversation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;

-- ─────────────────────── Enforce blocks on send ───────────────────────
-- Reject a message insert when another participant has blocked the sender.

CREATE OR REPLACE FUNCTION public._enforce_message_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM conversations c
    JOIN user_blocks b
      ON b.blocked_id = NEW.sender_id
     AND b.blocker_id = ANY(c.participant_ids)
     AND b.blocker_id <> NEW.sender_id
    WHERE c.id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'You can no longer message this person.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_message_block ON public.messages;
CREATE TRIGGER trg_enforce_message_block
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public._enforce_message_block();

COMMIT;
