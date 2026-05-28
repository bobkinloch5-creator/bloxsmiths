
-- 1. Make agent_conversations shared across project collaborators
DROP POLICY IF EXISTS "users read own convos" ON public.agent_conversations;
DROP POLICY IF EXISTS "users write own convos" ON public.agent_conversations;

CREATE POLICY "project members read convos"
  ON public.agent_conversations FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));

CREATE POLICY "project members insert convos"
  ON public.agent_conversations FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "project members update convos"
  ON public.agent_conversations FOR UPDATE TO authenticated
  USING (public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()));

CREATE POLICY "project owners delete convos"
  ON public.agent_conversations FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

-- 2. Make agent_messages visible to all project members
DROP POLICY IF EXISTS "users read own msgs" ON public.agent_messages;
DROP POLICY IF EXISTS "users write own msgs" ON public.agent_messages;

CREATE POLICY "project members read agent msgs"
  ON public.agent_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_conversations c
    WHERE c.id = agent_messages.conversation_id
      AND public.can_access_project(c.project_id, auth.uid())
  ));

CREATE POLICY "project members insert agent msgs"
  ON public.agent_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agent_conversations c
    WHERE c.id = agent_messages.conversation_id
      AND public.can_access_project(c.project_id, auth.uid())
  ));

CREATE POLICY "project members delete agent msgs"
  ON public.agent_messages FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agent_conversations c
    WHERE c.id = agent_messages.conversation_id
      AND public.can_access_project(c.project_id, auth.uid())
  ));

-- 3. Team chat (human-to-human) per project
CREATE TABLE public.project_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_chat_messages_project_idx
  ON public.project_chat_messages(project_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.project_chat_messages TO authenticated;
GRANT ALL ON public.project_chat_messages TO service_role;

ALTER TABLE public.project_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project members read team chat"
  ON public.project_chat_messages FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));

CREATE POLICY "project members post team chat"
  ON public.project_chat_messages FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "authors delete own team chat"
  ON public.project_chat_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

-- 4. Realtime for live updates
ALTER TABLE public.agent_messages REPLICA IDENTITY FULL;
ALTER TABLE public.project_chat_messages REPLICA IDENTITY FULL;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='agent_messages';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
  END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_chat_messages';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_chat_messages;
  END IF;
END $$;
