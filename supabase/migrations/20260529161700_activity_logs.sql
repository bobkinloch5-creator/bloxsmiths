-- Migration to add activity_logs table for website logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  description text NOT NULL,
  path text,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON public.activity_logs(event_type);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Allow reading logs only to staff or admin
CREATE POLICY "Admins or staff can read activity logs"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (public.is_staff_or_admin(auth.uid()));

-- Allow inserting logs from anyone (so we can log navigation/errors)
CREATE POLICY "Anyone can insert activity logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (true);
