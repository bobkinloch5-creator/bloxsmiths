
CREATE TABLE public.oauth_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text,
  code_challenge_method text,
  scope text,
  resource text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_codes_expires_idx ON public.oauth_codes(expires_at);
GRANT ALL ON public.oauth_codes TO service_role;
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_access_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX oauth_access_tokens_user_idx ON public.oauth_access_tokens(user_id);
GRANT ALL ON public.oauth_access_tokens TO service_role;
ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;
