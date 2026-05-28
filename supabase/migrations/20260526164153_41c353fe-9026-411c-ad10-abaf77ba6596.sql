
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','owner')) $$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  bio text,
  specialization text DEFAULT 'General Builder',
  credits integer NOT NULL DEFAULT 25,
  plugin_token_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "admins read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  game_type text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_collaborators TO authenticated;
GRANT ALL ON public.project_collaborators TO service_role;
ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id)
      OR EXISTS(SELECT 1 FROM public.project_collaborators c WHERE c.project_id = _project_id AND c.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.user_id = _user_id);
$$;

CREATE POLICY "owners and collabs read projects" ON public.projects FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS(SELECT 1 FROM public.project_collaborators c WHERE c.project_id = id AND c.user_id = auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "users insert own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owners update projects" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owners delete projects" ON public.projects FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "members read collaborators" ON public.project_collaborators FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "owners manage collaborators" ON public.project_collaborators FOR ALL TO authenticated
  USING (public.is_project_owner(project_id, auth.uid())) WITH CHECK (public.is_project_owner(project_id, auth.uid()));

-- Now safe to add cross-table policy on profiles
CREATE POLICY "collab members can read each other profiles" ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS(
    SELECT 1 FROM public.projects p
    LEFT JOIN public.project_collaborators pc ON pc.project_id = p.id
    WHERE (p.user_id = auth.uid() OR pc.user_id = auth.uid())
      AND profiles.id IN (p.user_id, pc.user_id)
  )
);

CREATE TABLE public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  file_type text NOT NULL,
  service_location text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO authenticated;
GRANT ALL ON public.project_files TO service_role;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read files" ON public.project_files FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "members write files" ON public.project_files FOR ALL TO authenticated USING (public.can_access_project(project_id, auth.uid())) WITH CHECK (public.can_access_project(project_id, auth.uid()));

CREATE TABLE public.plugin_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_connected_at timestamptz,
  studio_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_connections TO authenticated;
GRANT ALL ON public.plugin_connections TO service_role;
ALTER TABLE public.plugin_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own plugin conns" ON public.plugin_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.plugin_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context jsonb NOT NULL,
  instance_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_context TO authenticated;
GRANT ALL ON public.plugin_context TO service_role;
ALTER TABLE public.plugin_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read plugin_context" ON public.plugin_context FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()));

CREATE TABLE public.plugin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  delivered_at timestamptz,
  executed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plugin_actions_proj_status_idx ON public.plugin_actions(project_id, status, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_actions TO authenticated;
GRANT ALL ON public.plugin_actions TO service_role;
ALTER TABLE public.plugin_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read actions" ON public.plugin_actions FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "members insert actions" ON public.plugin_actions FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());

CREATE TABLE public.studio_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  file_path text,
  error_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_errors TO authenticated;
GRANT ALL ON public.studio_errors TO service_role;
ALTER TABLE public.studio_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own errors" ON public.studio_errors FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  credits_used integer NOT NULL DEFAULT 0,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generations TO authenticated;
GRANT ALL ON public.generations TO service_role;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own generations" ON public.generations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own generations" ON public.generations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read all generations" ON public.generations FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  balance integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own credit txs" ON public.credit_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all credit txs" ON public.credit_transactions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_payment_id text UNIQUE,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  credits_added integer NOT NULL DEFAULT 0,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all payments" ON public.payments FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id text NOT NULL,
  credits integer NOT NULL,
  amount numeric(10,2) NOT NULL,
  paypal_transaction_id text NOT NULL,
  paypal_note text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_requests TO authenticated;
GRANT ALL ON public.payment_requests TO service_role;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own pay req" ON public.payment_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own pay req" ON public.payment_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read all pay req" ON public.payment_requests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins update pay req" ON public.payment_requests FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT 'Chat',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_conversations TO authenticated;
GRANT ALL ON public.agent_conversations TO service_role;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own convos" ON public.agent_conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users write own convos" ON public.agent_conversations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  actions jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_messages TO authenticated;
GRANT ALL ON public.agent_messages TO service_role;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own msgs" ON public.agent_messages FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.agent_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);
CREATE POLICY "users write own msgs" ON public.agent_messages FOR ALL TO authenticated USING (
  EXISTS(SELECT 1 FROM public.agent_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
) WITH CHECK (
  EXISTS(SELECT 1 FROM public.agent_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
);

-- Credit RPCs
CREATE OR REPLACE FUNCTION public.spend_credits_atomic(_amount integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _new int; _is_owner boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT public.has_role(_uid, 'owner') INTO _is_owner;
  IF _is_owner THEN RETURN 999999; END IF;
  UPDATE public.profiles SET credits = credits - _amount, updated_at = now()
    WHERE id = _uid AND credits >= _amount RETURNING credits INTO _new;
  IF _new IS NULL THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_uid, -_amount, _new, 'ai_spend');
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.refund_credits(_amount integer, _reason text DEFAULT 'refund')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _new int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF public.has_role(_uid, 'owner') THEN RETURN 999999; END IF;
  UPDATE public.profiles SET credits = credits + _amount, updated_at = now() WHERE id = _uid RETURNING credits INTO _new;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_uid, _amount, _new, _reason);
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.grant_credits_service(_user_id uuid, _amount integer, _reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _new int;
BEGIN
  UPDATE public.profiles SET credits = credits + _amount, updated_at = now() WHERE id = _user_id RETURNING credits INTO _new;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_user_id, _amount, COALESCE(_new,0), _reason);
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.admin_adjust_credits(_user_id uuid, _amount integer, _reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _new int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles SET credits = GREATEST(0, credits + _amount), updated_at = now() WHERE id = _user_id RETURNING credits INTO _new;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_user_id, _amount, COALESCE(_new,0), _reason);
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.admin_approve_payment(_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pr public.payment_requests;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO _pr FROM public.payment_requests WHERE id = _request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found or already processed'; END IF;
  PERFORM public.grant_credits_service(_pr.user_id, _pr.credits, 'PayPal '|| _pr.pack_id ||' approved');
  UPDATE public.payment_requests SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _request_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_payment(_request_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.payment_requests SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = _reason
    WHERE id = _request_id AND status = 'pending';
END $$;

-- New user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_owner boolean;
BEGIN
  _is_owner := lower(NEW.email) = 'bobkinloch5@gmail.com';
  INSERT INTO public.profiles(id, email, display_name, avatar_url, credits)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
      NEW.raw_user_meta_data->>'avatar_url',
      CASE WHEN _is_owner THEN 999999 ELSE 25 END
    );
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF _is_owner THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason)
    VALUES (NEW.id, CASE WHEN _is_owner THEN 999999 ELSE 25 END, CASE WHEN _is_owner THEN 999999 ELSE 25 END, 'starter');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_projects BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_project_files BEFORE UPDATE ON public.project_files FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_plugin_context BEFORE UPDATE ON public.plugin_context FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
