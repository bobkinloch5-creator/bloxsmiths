-- Make projects and project-owned data private to the owning auth user only.
-- Collaboration tables may remain for legacy data, but no policy or helper
-- should use them to grant access.

CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = _project_id
      AND p.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = _project_id
      AND p.user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "projects_owner_all" ON public.projects;
DROP POLICY IF EXISTS "projects_collab_read" ON public.projects;
DROP POLICY IF EXISTS "owners and collabs read projects" ON public.projects;
DROP POLICY IF EXISTS "owners update projects" ON public.projects;
DROP POLICY IF EXISTS "owners delete projects" ON public.projects;

CREATE POLICY "projects_owner_all"
  ON public.projects
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "files_access" ON public.project_files;
DROP POLICY IF EXISTS "members read files" ON public.project_files;
DROP POLICY IF EXISTS "members write files" ON public.project_files;

CREATE POLICY "project owners read files"
  ON public.project_files
  FOR SELECT
  TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "project owners write files"
  ON public.project_files
  FOR ALL
  TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));

DROP POLICY IF EXISTS "collab_read_self_or_owner" ON public.project_collaborators;
DROP POLICY IF EXISTS "collab_owner_manage" ON public.project_collaborators;
DROP POLICY IF EXISTS "members read collaborators" ON public.project_collaborators;
DROP POLICY IF EXISTS "owners manage collaborators" ON public.project_collaborators;

DROP POLICY IF EXISTS "collab members can read each other profiles" ON public.profiles;
DROP POLICY IF EXISTS "admins read all generations" ON public.generations;

DROP POLICY IF EXISTS "project members read convos" ON public.agent_conversations;
DROP POLICY IF EXISTS "project members insert convos" ON public.agent_conversations;
DROP POLICY IF EXISTS "project members update convos" ON public.agent_conversations;
DROP POLICY IF EXISTS "project owners delete convos" ON public.agent_conversations;
DROP POLICY IF EXISTS "users read own convos" ON public.agent_conversations;
DROP POLICY IF EXISTS "users write own convos" ON public.agent_conversations;
DROP POLICY IF EXISTS "convo_own" ON public.agent_conversations;

CREATE POLICY "users read own convos"
  ON public.agent_conversations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "users insert own convos"
  ON public.agent_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "users update own convos"
  ON public.agent_conversations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (auth.uid() = user_id AND public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "users delete own convos"
  ON public.agent_conversations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_project_owner(project_id, auth.uid()));

DROP POLICY IF EXISTS "project members read agent msgs" ON public.agent_messages;
DROP POLICY IF EXISTS "project members insert agent msgs" ON public.agent_messages;
DROP POLICY IF EXISTS "project members delete agent msgs" ON public.agent_messages;
DROP POLICY IF EXISTS "users read own msgs" ON public.agent_messages;
DROP POLICY IF EXISTS "users write own msgs" ON public.agent_messages;
DROP POLICY IF EXISTS "msg_access" ON public.agent_messages;

CREATE POLICY "users read own msgs"
  ON public.agent_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_conversations c
      WHERE c.id = agent_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.is_project_owner(c.project_id, auth.uid())
    )
  );

CREATE POLICY "users insert own msgs"
  ON public.agent_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agent_conversations c
      WHERE c.id = agent_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.is_project_owner(c.project_id, auth.uid())
    )
  );

CREATE POLICY "users update own msgs"
  ON public.agent_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_conversations c
      WHERE c.id = agent_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.is_project_owner(c.project_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agent_conversations c
      WHERE c.id = agent_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.is_project_owner(c.project_id, auth.uid())
    )
  );

CREATE POLICY "users delete own msgs"
  ON public.agent_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_conversations c
      WHERE c.id = agent_messages.conversation_id
        AND c.user_id = auth.uid()
        AND public.is_project_owner(c.project_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "project members read team chat" ON public.project_chat_messages;
DROP POLICY IF EXISTS "project members post team chat" ON public.project_chat_messages;
DROP POLICY IF EXISTS "authors delete own team chat" ON public.project_chat_messages;

CREATE POLICY "users read own team chat"
  ON public.project_chat_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "users post own team chat"
  ON public.project_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "users delete own team chat"
  ON public.project_chat_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_project_owner(project_id, auth.uid()));
