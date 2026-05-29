-- Community chat settings: configurable slowmode (owner/admin only to change).

CREATE TABLE IF NOT EXISTS public.chat_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  slowmode_seconds integer NOT NULL DEFAULT 2 CHECK (slowmode_seconds >= 0 AND slowmode_seconds <= 3600),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Singleton row
INSERT INTO public.chat_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, UPDATE ON public.chat_settings TO authenticated;
GRANT SELECT ON public.chat_settings TO anon;
GRANT ALL ON public.chat_settings TO service_role;

ALTER TABLE public.chat_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read the current slowmode (the client shows it).
DROP POLICY IF EXISTS "Anyone can read chat settings" ON public.chat_settings;
CREATE POLICY "Anyone can read chat settings"
  ON public.chat_settings FOR SELECT
  USING (true);

-- Only admins/owners may change it.
DROP POLICY IF EXISTS "Admins can update chat settings" ON public.chat_settings;
CREATE POLICY "Admins can update chat settings"
  ON public.chat_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
