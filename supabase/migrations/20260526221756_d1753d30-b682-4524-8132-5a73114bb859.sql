ALTER TABLE public.mcp_tokens
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_ok boolean,
  ADD COLUMN IF NOT EXISTS last_attempt_error text,
  ADD COLUMN IF NOT EXISTS attempt_count_24h integer NOT NULL DEFAULT 0;

-- Global table to record attempts even when no token matches (so the user can
-- still see "something tried to connect with a bad key"). One row per user.
CREATE TABLE IF NOT EXISTS public.mcp_anon_attempts (
  user_id uuid PRIMARY KEY,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
GRANT SELECT ON public.mcp_anon_attempts TO authenticated;
GRANT ALL ON public.mcp_anon_attempts TO service_role;
ALTER TABLE public.mcp_anon_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own anon attempts"
  ON public.mcp_anon_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);