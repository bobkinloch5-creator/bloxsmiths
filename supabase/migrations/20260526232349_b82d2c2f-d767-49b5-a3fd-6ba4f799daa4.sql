
-- 1) user_provider_keys: stores each user's pasted API keys per provider
CREATE TABLE public.user_provider_keys (
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai','anthropic','google','groq')),
  api_key text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_provider_keys TO authenticated;
GRANT ALL ON public.user_provider_keys TO service_role;

ALTER TABLE public.user_provider_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own provider keys" ON public.user_provider_keys
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own provider keys" ON public.user_provider_keys
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own provider keys" ON public.user_provider_keys
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own provider keys" ON public.user_provider_keys
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER touch_user_provider_keys
  BEFORE UPDATE ON public.user_provider_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) project_ai_settings: per-project AI source mode
CREATE TABLE public.project_ai_settings (
  project_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'mcp' CHECK (mode IN ('mcp','api_key')),
  provider text CHECK (provider IN ('openai','anthropic','google','groq')),
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ai_settings TO authenticated;
GRANT ALL ON public.project_ai_settings TO service_role;

ALTER TABLE public.project_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read project ai settings" ON public.project_ai_settings
  FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "owners insert project ai settings" ON public.project_ai_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "owners update project ai settings" ON public.project_ai_settings
  FOR UPDATE TO authenticated USING (public.is_project_owner(project_id, auth.uid())) WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "owners delete project ai settings" ON public.project_ai_settings
  FOR DELETE TO authenticated USING (public.is_project_owner(project_id, auth.uid()));

CREATE TRIGGER touch_project_ai_settings
  BEFORE UPDATE ON public.project_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable realtime so the composer indicator updates live when toggled
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_ai_settings;
