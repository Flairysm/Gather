-- Vendor KYC: collect identity details on the vendor application so an admin can
-- verify the seller before approving.
--
--   * full_name / phone / ic_number — typed details
--   * ic_front_path / selfie_path     — storage paths in the PRIVATE vendor-kyc
--                                       bucket (IC photo + selfie holding IC)
--
-- IC images are PII, so the bucket is private: the owner can upload/read their
-- own folder; admins view them via short-lived signed URLs (service role).

BEGIN;

ALTER TABLE public.vendor_applications
  ADD COLUMN IF NOT EXISTS full_name      text,
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS ic_number      text,
  ADD COLUMN IF NOT EXISTS ic_front_path  text,
  ADD COLUMN IF NOT EXISTS selfie_path    text;

-- Private bucket for identity documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vendor-kyc', 'vendor-kyc', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;

-- Owners manage only their own folder (objects named '<uid>/...'). Service role
-- (admin) bypasses RLS to read + sign.
DROP POLICY IF EXISTS vendor_kyc_insert_own ON storage.objects;
CREATE POLICY vendor_kyc_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-kyc' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS vendor_kyc_select_own ON storage.objects;
CREATE POLICY vendor_kyc_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-kyc' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS vendor_kyc_update_own ON storage.objects;
CREATE POLICY vendor_kyc_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vendor-kyc' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'vendor-kyc' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
