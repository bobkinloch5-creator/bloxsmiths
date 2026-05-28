CREATE TABLE public.user_mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  auth_header text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_mcp_servers TO authenticated;
GRANT ALL ON public.user_mcp_servers TO service_role;

ALTER TABLE public.user_mcp_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own mcp servers"
  ON public.user_mcp_servers
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER touch_user_mcp_servers
  BEFORE UPDATE ON public.user_mcp_servers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();