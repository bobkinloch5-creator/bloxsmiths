CREATE TABLE IF NOT EXISTS public.ai_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  project_id uuid NULL,
  feature text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  source text NULL,
  ok boolean NOT NULL,
  duration_ms integer NULL,
  error_kind text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_provider_events_created_at_idx
  ON public.ai_provider_events(created_at DESC);

CREATE INDEX IF NOT EXISTS ai_provider_events_provider_model_idx
  ON public.ai_provider_events(provider, model, created_at DESC);

ALTER TABLE public.ai_provider_events ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.ai_provider_events TO service_role;

CREATE POLICY "service role manages ai provider events"
ON public.ai_provider_events FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
