
GRANT INSERT, UPDATE, DELETE ON public.plugin_tokens TO authenticated;

CREATE POLICY "users upsert own plugin token"
ON public.plugin_tokens FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own plugin token"
ON public.plugin_tokens FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own plugin token"
ON public.plugin_tokens FOR DELETE TO authenticated
USING (auth.uid() = user_id);
