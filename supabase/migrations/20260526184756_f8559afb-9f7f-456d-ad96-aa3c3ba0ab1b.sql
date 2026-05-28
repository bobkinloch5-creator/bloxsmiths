CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  user_id uuid PRIMARY KEY,
  token_hash text NOT NULL,
  label text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_tokens_token_hash_idx ON public.mcp_tokens(token_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_tokens TO authenticated;
GRANT ALL ON public.mcp_tokens TO service_role;

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own mcp token"
  ON public.mcp_tokens FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users upsert own mcp token"
  ON public.mcp_tokens FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own mcp token"
  ON public.mcp_tokens FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own mcp token"
  ON public.mcp_tokens FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER mcp_tokens_touch_updated_at
  BEFORE UPDATE ON public.mcp_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();