ALTER TABLE public.project_ai_settings DROP CONSTRAINT IF EXISTS project_ai_settings_provider_check;
ALTER TABLE public.project_ai_settings ADD CONSTRAINT project_ai_settings_provider_check CHECK (provider IN ('openai','anthropic','google','groq','neokens'));

ALTER TABLE public.user_provider_keys DROP CONSTRAINT IF EXISTS user_provider_keys_provider_check;
ALTER TABLE public.user_provider_keys ADD CONSTRAINT user_provider_keys_provider_check CHECK (provider IN ('openai','anthropic','google','groq','neokens'));