CREATE TABLE IF NOT EXISTS public.project_ai_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  kind text NOT NULL DEFAULT 'preference',
  value text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0.70,
  source_prompt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, key),
  CHECK (kind IN ('preference', 'project_fact', 'recent')),
  CHECK (char_length(value) <= 1000),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS project_ai_memories_project_seen_idx
  ON public.project_ai_memories(project_id, last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ai_memories TO authenticated;
GRANT ALL ON public.project_ai_memories TO service_role;

ALTER TABLE public.project_ai_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project members read ai memories"
  ON public.project_ai_memories FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));

CREATE POLICY "project members insert ai memories"
  ON public.project_ai_memories FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "project members update ai memories"
  ON public.project_ai_memories FOR UPDATE TO authenticated
  USING (public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()));

CREATE POLICY "project owners delete ai memories"
  ON public.project_ai_memories FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

DROP TRIGGER IF EXISTS trg_project_ai_memories_updated_at ON public.project_ai_memories;
CREATE TRIGGER trg_project_ai_memories_updated_at
  BEFORE UPDATE ON public.project_ai_memories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
