
-- plugin_connections write policies
CREATE POLICY "users insert own plugin conns"
ON public.plugin_connections FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own plugin conns"
ON public.plugin_connections FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- plugin_context write policies
CREATE POLICY "members insert plugin_context"
ON public.plugin_context FOR INSERT TO authenticated
WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "members update plugin_context"
ON public.plugin_context FOR UPDATE TO authenticated
USING (public.can_access_project(project_id, auth.uid()))
WITH CHECK (public.can_access_project(project_id, auth.uid()));

CREATE POLICY "members delete plugin_context"
ON public.plugin_context FOR DELETE TO authenticated
USING (public.is_project_owner(project_id, auth.uid()));

-- studio_errors insert policy
CREATE POLICY "users insert own errors"
ON public.studio_errors FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Realtime channel authorization: only project members can subscribe
-- to broadcast/presence topics for their projects.
CREATE POLICY "members access project realtime topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  CASE
    WHEN realtime.topic() ~ '^(project_chat|project_files|plugin_context):[0-9a-fA-F-]{36}$'
      THEN public.can_access_project(
        (regexp_split_to_array(realtime.topic(), ':'))[2]::uuid,
        auth.uid()
      )
    WHEN realtime.topic() ~ '^agent_messages:[0-9a-fA-F-]{36}$'
      THEN EXISTS (
        SELECT 1 FROM public.agent_conversations c
        WHERE c.id = (regexp_split_to_array(realtime.topic(), ':'))[2]::uuid
          AND public.can_access_project(c.project_id, auth.uid())
      )
    ELSE false
  END
);

-- Lock down internal SECURITY DEFINER helpers from being directly callable
REVOKE EXECUTE ON FUNCTION public.grant_credits_service(uuid, integer, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;
