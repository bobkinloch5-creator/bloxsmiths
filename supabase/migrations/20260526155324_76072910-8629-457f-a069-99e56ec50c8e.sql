
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'editor', 'viewer', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  credits BIGINT NOT NULL DEFAULT 50,
  plugin_token_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'))
$$;

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  game_type TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_user ON public.projects(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
CREATE INDEX idx_collab_user ON public.project_collaborators(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_collaborators TO authenticated;
GRANT ALL ON public.project_collaborators TO service_role;
ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collab_read_self_or_owner" ON public.project_collaborators FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));
CREATE POLICY "collab_owner_manage" ON public.project_collaborators FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.can_access_project(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id)
      OR EXISTS(SELECT 1 FROM public.project_collaborators WHERE project_id = _project_id AND user_id = _user_id);
$$;

CREATE POLICY "projects_owner_all" ON public.projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_collab_read" ON public.projects FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_collaborators WHERE project_id = id AND user_id = auth.uid()));

CREATE TABLE public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  service_location TEXT,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, path)
);
CREATE INDEX idx_files_project ON public.project_files(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO authenticated;
GRANT ALL ON public.project_files TO service_role;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "files_access" ON public.project_files FOR ALL TO authenticated
  USING (public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()));

CREATE TABLE public.plugin_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_connected_at TIMESTAMPTZ,
  studio_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pconn_user ON public.plugin_connections(user_id);
GRANT SELECT ON public.plugin_connections TO authenticated;
GRANT ALL ON public.plugin_connections TO service_role;
ALTER TABLE public.plugin_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pconn_read_own" ON public.plugin_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.plugin_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context JSONB NOT NULL,
  instance_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plugin_context TO authenticated;
GRANT ALL ON public.plugin_context TO service_role;
ALTER TABLE public.plugin_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pctx_access" ON public.plugin_context FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));

CREATE TABLE public.plugin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pact_project_status ON public.plugin_actions(project_id, status);
GRANT SELECT, INSERT ON public.plugin_actions TO authenticated;
GRANT ALL ON public.plugin_actions TO service_role;
ALTER TABLE public.plugin_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pact_access" ON public.plugin_actions FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "pact_insert" ON public.plugin_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_access_project(project_id, auth.uid()));

CREATE TABLE public.studio_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  file_path TEXT,
  error_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_serr_user ON public.studio_errors(user_id);
GRANT SELECT ON public.studio_errors TO authenticated;
GRANT ALL ON public.studio_errors TO service_role;
ALTER TABLE public.studio_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "serr_read_own" ON public.studio_errors FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ctx_user ON public.credit_transactions(user_id, created_at DESC);
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ctx_read_own" ON public.credit_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_payment_id TEXT UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL,
  credits_added INT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pay_user ON public.payments(user_id, created_at DESC);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay_read_own" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  credits INT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  paypal_transaction_id TEXT NOT NULL,
  paypal_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_preq_status ON public.payment_requests(status, created_at DESC);
GRANT SELECT, INSERT ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preq_read_own" ON public.payment_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "preq_insert_own" ON public.payment_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "preq_admin_update" ON public.payment_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  credits_used INT DEFAULT 0,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gen_user ON public.generations(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.generations TO authenticated;
GRANT ALL ON public.generations TO service_role;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gen_read_own" ON public.generations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "gen_insert_own" ON public.generations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_conversations TO authenticated;
GRANT ALL ON public.agent_conversations TO service_role;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "convo_own" ON public.agent_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  actions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_convo ON public.agent_messages(conversation_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.agent_messages TO authenticated;
GRANT ALL ON public.agent_messages TO service_role;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_access" ON public.agent_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.agent_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agent_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.spend_credits_atomic(_amount INT)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _cur BIGINT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF public.is_admin(_uid) THEN RETURN; END IF;
  UPDATE public.profiles SET credits = credits - _amount, updated_at = now()
   WHERE id = _uid AND credits >= _amount RETURNING credits INTO _cur;
  IF _cur IS NULL THEN RAISE EXCEPTION 'insufficient credits'; END IF;
  INSERT INTO public.credit_transactions(user_id, amount, reason) VALUES (_uid, -_amount, 'spend');
END $$;
GRANT EXECUTE ON FUNCTION public.spend_credits_atomic(INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_credits(_amount INT, _reason TEXT)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF public.is_admin(_uid) THEN RETURN; END IF;
  UPDATE public.profiles SET credits = credits + _amount, updated_at = now() WHERE id = _uid;
  INSERT INTO public.credit_transactions(user_id, amount, reason) VALUES (_uid, _amount, COALESCE(_reason,'refund'));
END $$;
GRANT EXECUTE ON FUNCTION public.refund_credits(INT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_credits_service(_user_id UUID, _amount INT, _reason TEXT)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET credits = credits + _amount, updated_at = now() WHERE id = _user_id;
  INSERT INTO public.credit_transactions(user_id, amount, reason) VALUES (_user_id, _amount, COALESCE(_reason,'grant'));
END $$;
REVOKE ALL ON FUNCTION public.grant_credits_service(UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_credits_service(UUID, INT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_adjust_credits(_user_id UUID, _amount INT, _reason TEXT)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET credits = credits + _amount, updated_at = now() WHERE id = _user_id;
  INSERT INTO public.credit_transactions(user_id, amount, reason) VALUES (_user_id, _amount, COALESCE(_reason,'admin adjust'));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(UUID, INT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_payment(_request_id UUID)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO r FROM public.payment_requests WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found or not pending'; END IF;
  UPDATE public.profiles SET credits = credits + r.credits, updated_at = now() WHERE id = r.user_id;
  INSERT INTO public.credit_transactions(user_id, amount, reason) VALUES (r.user_id, r.credits, 'paypal pack ' || r.pack_id);
  UPDATE public.payment_requests SET status = 'approved', updated_at = now() WHERE id = _request_id;
  INSERT INTO public.payments(user_id, provider, provider_payment_id, amount, status, credits_added, raw)
    VALUES (r.user_id, 'paypal_manual', r.paypal_transaction_id, r.amount, 'completed', r.credits,
            jsonb_build_object('pack_id', r.pack_id, 'note', r.paypal_note))
    ON CONFLICT (provider_payment_id) DO NOTHING;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_payment(_request_id UUID, _reason TEXT)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payment_requests SET status = 'rejected', paypal_note = COALESCE(paypal_note,'') || E'\nrejected: ' || COALESCE(_reason,''), updated_at = now()
   WHERE id = _request_id AND status = 'pending';
END $$;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_owner BOOLEAN := lower(NEW.email) = 'bobkinloch5@gmail.com';
BEGIN
  INSERT INTO public.profiles(id, email, display_name, credits)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    CASE WHEN _is_owner THEN 999999999 ELSE 50 END
  ) ON CONFLICT (id) DO NOTHING;
  IF _is_owner THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
    INSERT INTO public.credit_transactions(user_id, amount, reason) VALUES (NEW.id, 50, 'free starter credits');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
DECLARE _uid UUID;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = 'bobkinloch5@gmail.com' LIMIT 1;
  IF _uid IS NOT NULL THEN
    INSERT INTO public.profiles(id,email,credits) VALUES (_uid,'bobkinloch5@gmail.com',999999999)
      ON CONFLICT (id) DO UPDATE SET credits = 999999999;
    INSERT INTO public.user_roles(user_id, role) VALUES (_uid, 'owner') ON CONFLICT DO NOTHING;
  END IF;
END $$;
