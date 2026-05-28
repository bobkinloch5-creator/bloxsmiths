
-- 1) Split plugin_token_hash into its own table so collaborators can no longer read each others' tokens via the profiles policy.
CREATE TABLE IF NOT EXISTS public.plugin_tokens (
  user_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Migrate existing values
INSERT INTO public.plugin_tokens (user_id, token_hash)
SELECT id, plugin_token_hash
FROM public.profiles
WHERE plugin_token_hash IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Drop the sensitive column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS plugin_token_hash;

-- Grants and RLS for plugin_tokens
GRANT SELECT ON public.plugin_tokens TO authenticated;
GRANT ALL ON public.plugin_tokens TO service_role;
ALTER TABLE public.plugin_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own plugin token"
ON public.plugin_tokens FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 2) Fix broken RLS policy on projects (c.project_id = c.id was a self-join bug)
DROP POLICY IF EXISTS "owners and collabs read projects" ON public.projects;
CREATE POLICY "owners and collabs read projects"
ON public.projects FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.project_collaborators c
    WHERE c.project_id = projects.id AND c.user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);
