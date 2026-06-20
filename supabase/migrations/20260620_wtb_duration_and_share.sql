-- WTB (wanted) bounty duration + shareable wanted cards in chat.
--
-- 1) wanted_posts.expires_at: optional bounty expiry. NULL = never expires
--    (keeps existing posts visible). Browse filters out posts past expiry.
-- 2) messages.shared_wanted_id + a new 'wanted_share' message kind so a seller
--    can attach a WTB card to a chat (mirrors the existing 'listing_share').

BEGIN;

-- ── 1. Wanted bounty duration ──
ALTER TABLE public.wanted_posts
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS wanted_posts_expires_idx
  ON public.wanted_posts (expires_at);

-- ── 2. Wanted card attachment in messages ──
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS shared_wanted_id uuid
    REFERENCES public.wanted_posts(id) ON DELETE SET NULL;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_kind_check
  CHECK (kind = ANY (ARRAY['text','offer','image','listing_share','wanted_share']));

COMMIT;
