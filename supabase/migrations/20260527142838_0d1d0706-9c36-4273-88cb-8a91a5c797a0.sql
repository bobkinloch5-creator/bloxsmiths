
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-images', 'generated-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read so links in AI replies render.
CREATE POLICY "Public read generated-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-images');

-- Writes happen only from server (service_role bypasses RLS) — no insert policy needed for users.
