-- Vendor store "trust passport" — Phase 1.
--
-- Adds two optional, additive columns to vendor_stores:
--   * social_links: jsonb map of platform -> handle/url. Rendered on the public
--     store page for verified sellers only (gating is enforced in the app).
--   * specialties: free-form tags ("Pokémon", "Vintage", "Graded slabs") used to
--     give the storefront personality and aid discovery.
--
-- Both inherit the existing vendor_stores RLS (owner-update, public-read), so no
-- policy changes are required.

BEGIN;

ALTER TABLE public.vendor_stores
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS specialties text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.vendor_stores.social_links IS
  'Map of social platform -> handle/url, e.g. {"instagram":"...","tiktok":"..."}. Shown for verified sellers only.';
COMMENT ON COLUMN public.vendor_stores.specialties IS
  'Free-form storefront tags for discovery, e.g. {"Pokémon","Vintage"}.';

COMMIT;
