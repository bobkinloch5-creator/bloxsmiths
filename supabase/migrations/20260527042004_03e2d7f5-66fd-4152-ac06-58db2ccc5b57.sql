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
  credits integer NOT NULL DEFAULT 10,
  discord_claimed boolean NOT NULL DEFAULT false,
  referral_code text UNIQUE,
  referred_by uuid,
  manual_sync_only boolean NOT NULL DEFAULT false,
  banned boolean NOT NULL DEFAULT false,
  ban_reason text,
  banned_at timestamptz,
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
  ai_rules text,
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
  USING (auth.uid() = user_id OR EXISTS(SELECT 1 FROM public.project_collaborators c WHERE c.project_id = projects.id AND c.user_id = auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "users insert own projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owners update projects" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owners delete projects" ON public.projects FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "members read collaborators" ON public.project_collaborators FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()) OR public.is_admin(auth.uid()));
CREATE POLICY "owners manage collaborators" ON public.project_collaborators FOR ALL TO authenticated
  USING (public.is_project_owner(project_id, auth.uid())) WITH CHECK (public.is_project_owner(project_id, auth.uid()));

CREATE POLICY "collab members can read each other profiles" ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.projects p LEFT JOIN public.project_collaborators pc ON pc.project_id = p.id
    WHERE (p.user_id = auth.uid() OR pc.user_id = auth.uid()) AND profiles.id IN (p.user_id, pc.user_id))
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

CREATE TABLE public.plugin_tokens (
  user_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_tokens TO authenticated;
GRANT ALL ON public.plugin_tokens TO service_role;
ALTER TABLE public.plugin_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own plugin token" ON public.plugin_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users upsert own plugin token" ON public.plugin_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own plugin token" ON public.plugin_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own plugin token" ON public.plugin_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

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
CREATE POLICY "users insert own plugin conns" ON public.plugin_connections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own plugin conns" ON public.plugin_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);

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
CREATE POLICY "members insert plugin_context" ON public.plugin_context FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "members update plugin_context" ON public.plugin_context FOR UPDATE TO authenticated USING (public.can_access_project(project_id, auth.uid())) WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "members delete plugin_context" ON public.plugin_context FOR DELETE TO authenticated USING (public.is_project_owner(project_id, auth.uid()));

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
CREATE POLICY "users insert own errors" ON public.studio_errors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_conversations TO authenticated;
GRANT ALL ON public.agent_conversations TO service_role;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project members read convos" ON public.agent_conversations FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "project members insert convos" ON public.agent_conversations FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "project members update convos" ON public.agent_conversations FOR UPDATE TO authenticated USING (public.can_access_project(project_id, auth.uid())) WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "project owners delete convos" ON public.agent_conversations FOR DELETE TO authenticated USING (public.is_project_owner(project_id, auth.uid()));

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
CREATE POLICY "project members read agent msgs" ON public.agent_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.agent_conversations c WHERE c.id = agent_messages.conversation_id AND public.can_access_project(c.project_id, auth.uid())));
CREATE POLICY "project members insert agent msgs" ON public.agent_messages FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.agent_conversations c WHERE c.id = agent_messages.conversation_id AND public.can_access_project(c.project_id, auth.uid())));
CREATE POLICY "project members delete agent msgs" ON public.agent_messages FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.agent_conversations c WHERE c.id = agent_messages.conversation_id AND public.can_access_project(c.project_id, auth.uid())));

CREATE TABLE public.project_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_chat_messages_project_idx ON public.project_chat_messages(project_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.project_chat_messages TO authenticated;
GRANT ALL ON public.project_chat_messages TO service_role;
ALTER TABLE public.project_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project members read team chat" ON public.project_chat_messages FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "project members post team chat" ON public.project_chat_messages FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "authors delete own team chat" ON public.project_chat_messages FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_project_owner(project_id, auth.uid()));

CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  credits integer NOT NULL CHECK (credits > 0),
  max_redemptions integer,
  redemption_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage promo codes" ON public.promo_codes FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  credits integer NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promo_id, user_id)
);
GRANT SELECT, INSERT ON public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own redemptions" ON public.promo_redemptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all redemptions" ON public.promo_redemptions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE TABLE public.daily_credit_claims (
  user_id uuid NOT NULL,
  claim_date date NOT NULL,
  credits integer NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, claim_date)
);
GRANT SELECT, INSERT ON public.daily_credit_claims TO authenticated;
GRANT ALL ON public.daily_credit_claims TO service_role;
ALTER TABLE public.daily_credit_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own daily claims" ON public.daily_credit_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.ai_usage_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_usage_user_time ON public.ai_usage_events(user_id, created_at DESC);
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own usage" ON public.ai_usage_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.user_mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  auth_header text,
  enabled boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  tool_count integer,
  tools_cache jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_mcp_servers TO authenticated;
GRANT ALL ON public.user_mcp_servers TO service_role;
ALTER TABLE public.user_mcp_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own mcp servers" ON public.user_mcp_servers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.mcp_tokens (
  user_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  label text,
  last_used_at timestamptz,
  last_attempt_at timestamptz,
  last_attempt_ok boolean,
  last_attempt_error text,
  attempt_count_24h integer NOT NULL DEFAULT 0,
  last_client text,
  last_user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcp_tokens_token_hash_idx ON public.mcp_tokens(token_hash);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_tokens TO authenticated;
GRANT ALL ON public.mcp_tokens TO service_role;
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own mcp token" ON public.mcp_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users upsert own mcp token" ON public.mcp_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own mcp token" ON public.mcp_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own mcp token" ON public.mcp_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.mcp_anon_attempts (
  user_id uuid PRIMARY KEY,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
GRANT SELECT ON public.mcp_anon_attempts TO authenticated;
GRANT ALL ON public.mcp_anon_attempts TO service_role;
ALTER TABLE public.mcp_anon_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own anon attempts" ON public.mcp_anon_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.promotion_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('tiktok','youtube','other')),
  url text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  credits_awarded integer NOT NULL DEFAULT 0,
  reject_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX promotion_submissions_user_url_pending_idx ON public.promotion_submissions(user_id, url) WHERE status = 'pending';
GRANT SELECT, INSERT ON public.promotion_submissions TO authenticated;
GRANT ALL ON public.promotion_submissions TO service_role;
ALTER TABLE public.promotion_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own promo submissions" ON public.promotion_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "users read own promo submissions" ON public.promotion_submissions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all promo submissions" ON public.promotion_submissions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins update promo submissions" ON public.promotion_submissions FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.user_provider_keys (
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai','anthropic','google','groq')),
  api_key text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_provider_keys TO authenticated;
GRANT ALL ON public.user_provider_keys TO service_role;
ALTER TABLE public.user_provider_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own provider keys" ON public.user_provider_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own provider keys" ON public.user_provider_keys FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own provider keys" ON public.user_provider_keys FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own provider keys" ON public.user_provider_keys FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.project_ai_settings (
  project_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'mcp' CHECK (mode IN ('mcp','api_key')),
  provider text CHECK (provider IN ('openai','anthropic','google','groq')),
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ai_settings TO authenticated;
GRANT ALL ON public.project_ai_settings TO service_role;
ALTER TABLE public.project_ai_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read project ai settings" ON public.project_ai_settings FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "owners insert project ai settings" ON public.project_ai_settings FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "owners update project ai settings" ON public.project_ai_settings FOR UPDATE TO authenticated USING (public.is_project_owner(project_id, auth.uid())) WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY "owners delete project ai settings" ON public.project_ai_settings FOR DELETE TO authenticated USING (public.is_project_owner(project_id, auth.uid()));

CREATE TABLE public.oauth_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text,
  code_challenge_method text,
  scope text,
  resource text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oauth_codes_expires_idx ON public.oauth_codes(expires_at);
GRANT ALL ON public.oauth_codes TO service_role;
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_access_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz
);
CREATE INDEX oauth_access_tokens_user_idx ON public.oauth_access_tokens(user_id);
GRANT ALL ON public.oauth_access_tokens TO service_role;
ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_projects BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_project_files BEFORE UPDATE ON public.project_files FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_plugin_context BEFORE UPDATE ON public.plugin_context FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_agent_conversations_updated_at BEFORE UPDATE ON public.agent_conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_user_mcp_servers BEFORE UPDATE ON public.user_mcp_servers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER mcp_tokens_touch_updated_at BEFORE UPDATE ON public.mcp_tokens FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_user_provider_keys BEFORE UPDATE ON public.user_provider_keys FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_project_ai_settings BEFORE UPDATE ON public.project_ai_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

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

CREATE OR REPLACE FUNCTION public.redeem_promo_code(_code text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _p public.promo_codes; _new int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _p FROM public.promo_codes WHERE lower(code) = lower(trim(_code)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF NOT _p.active THEN RAISE EXCEPTION 'inactive_code'; END IF;
  IF _p.expires_at IS NOT NULL AND _p.expires_at < now() THEN RAISE EXCEPTION 'expired_code'; END IF;
  IF _p.max_redemptions IS NOT NULL AND _p.redemption_count >= _p.max_redemptions THEN RAISE EXCEPTION 'limit_reached'; END IF;
  IF EXISTS (SELECT 1 FROM public.promo_redemptions WHERE promo_id = _p.id AND user_id = _uid) THEN
    RAISE EXCEPTION 'already_redeemed';
  END IF;
  INSERT INTO public.promo_redemptions(promo_id, user_id, credits) VALUES (_p.id, _uid, _p.credits);
  UPDATE public.promo_codes SET redemption_count = redemption_count + 1 WHERE id = _p.id;
  UPDATE public.profiles SET credits = credits + _p.credits, updated_at = now() WHERE id = _uid RETURNING credits INTO _new;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_uid, _p.credits, _new, 'promo:'||_p.code);
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.claim_daily_credits()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _today date := (now() at time zone 'utc')::date; _amt int := 10; _new int; _confirmed timestamptz; _created timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT email_confirmed_at, created_at INTO _confirmed, _created FROM auth.users WHERE id = _uid;
  IF _confirmed IS NULL THEN RAISE EXCEPTION 'email_not_confirmed'; END IF;
  IF _created > now() - interval '5 minutes' THEN RAISE EXCEPTION 'account_too_new'; END IF;
  IF EXISTS (SELECT 1 FROM public.daily_credit_claims WHERE user_id = _uid AND claim_date = _today) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed_today');
  END IF;
  INSERT INTO public.daily_credit_claims(user_id, claim_date, credits) VALUES (_uid, _today, _amt);
  UPDATE public.profiles SET credits = credits + _amt, updated_at = now() WHERE id = _uid RETURNING credits INTO _new;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_uid, _amt, _new, 'daily_claim');
  RETURN jsonb_build_object('claimed', true, 'credits', _new, 'amount', _amt);
END $$;

CREATE OR REPLACE FUNCTION public.claim_discord_credits()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _new int; _amt int := 5; _already boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT discord_claimed INTO _already FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _already THEN RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed'); END IF;
  UPDATE public.profiles SET credits = credits + _amt, discord_claimed = true, updated_at = now() WHERE id = _uid RETURNING credits INTO _new;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_uid, _amt, _new, 'discord_join');
  RETURN jsonb_build_object('claimed', true, 'credits', _new, 'amount', _amt);
END $$;

CREATE OR REPLACE FUNCTION public.apply_referral(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _referrer uuid; _existing uuid; _amt int := 10; _new_self int; _norm text := lower(trim(_code));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _norm IS NULL OR _norm = '' THEN RAISE EXCEPTION 'invalid_code'; END IF;
  SELECT referred_by INTO _existing FROM public.profiles WHERE id = _uid;
  IF _existing IS NOT NULL THEN RETURN jsonb_build_object('applied', false, 'reason', 'already_referred'); END IF;
  SELECT id INTO _referrer FROM public.profiles WHERE lower(referral_code) = _norm;
  IF _referrer IS NULL THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF _referrer = _uid THEN RAISE EXCEPTION 'self_referral'; END IF;
  UPDATE public.profiles SET referred_by = _referrer, credits = credits + _amt, updated_at = now() WHERE id = _uid RETURNING credits INTO _new_self;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_uid, _amt, _new_self, 'referral_bonus_referee');
  PERFORM public.grant_credits_service(_referrer, _amt, 'referral_bonus_referrer');
  RETURN jsonb_build_object('applied', true, 'credits', _new_self, 'amount', _amt);
END $$;

CREATE OR REPLACE FUNCTION public.get_ai_usage()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _5h_used int; _7d_used int; _5h_limit int := 25; _7d_limit int := 200; _next_5h timestamptz; _next_7d timestamptz; _is_owner boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT public.has_role(_uid,'owner') INTO _is_owner;
  IF _is_owner THEN RETURN jsonb_build_object('owner', true, 'limit_5h', _5h_limit, 'used_5h', 0, 'limit_7d', _7d_limit, 'used_7d', 0); END IF;
  SELECT COUNT(*), MIN(created_at) + interval '5 hours' INTO _5h_used, _next_5h FROM public.ai_usage_events WHERE user_id = _uid AND created_at > now() - interval '5 hours';
  SELECT COUNT(*), MIN(created_at) + interval '7 days' INTO _7d_used, _next_7d FROM public.ai_usage_events WHERE user_id = _uid AND created_at > now() - interval '7 days';
  RETURN jsonb_build_object('owner', false, 'limit_5h', _5h_limit, 'used_5h', COALESCE(_5h_used,0), 'reset_5h', _next_5h, 'limit_7d', _7d_limit, 'used_7d', COALESCE(_7d_used,0), 'reset_7d', _next_7d);
END $$;

CREATE OR REPLACE FUNCTION public.check_and_record_ai_usage()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _5h int; _7d int; _5h_limit int := 25; _7d_limit int := 200; _is_owner boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT public.has_role(_uid,'owner') INTO _is_owner;
  IF _is_owner THEN RETURN jsonb_build_object('allowed', true, 'owner', true); END IF;
  SELECT COUNT(*) INTO _5h FROM public.ai_usage_events WHERE user_id=_uid AND created_at > now() - interval '5 hours';
  IF _5h >= _5h_limit THEN RAISE EXCEPTION 'rate_limited_5h'; END IF;
  SELECT COUNT(*) INTO _7d FROM public.ai_usage_events WHERE user_id=_uid AND created_at > now() - interval '7 days';
  IF _7d >= _7d_limit THEN RAISE EXCEPTION 'rate_limited_7d'; END IF;
  INSERT INTO public.ai_usage_events(user_id) VALUES (_uid);
  DELETE FROM public.ai_usage_events WHERE created_at < now() - interval '8 days';
  RETURN jsonb_build_object('allowed', true, 'used_5h', _5h+1, 'used_7d', _7d+1, 'limit_5h', _5h_limit, 'limit_7d', _7d_limit);
END $$;

CREATE OR REPLACE FUNCTION public.admin_approve_promotion(_submission_id uuid, _credits integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s public.promotion_submissions;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _credits IS NULL OR _credits <= 0 OR _credits > 500 THEN RAISE EXCEPTION 'invalid_credits'; END IF;
  SELECT * INTO _s FROM public.promotion_submissions WHERE id = _submission_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found or already processed'; END IF;
  PERFORM public.grant_credits_service(_s.user_id, _credits, 'promotion_reward');
  UPDATE public.promotion_submissions SET status = 'approved', credits_awarded = _credits, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _submission_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_promotion(_submission_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.promotion_submissions SET status = 'rejected', reject_reason = _reason, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _submission_id AND status = 'pending';
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_ban(_user_id uuid, _banned boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.has_role(_user_id, 'owner') THEN RAISE EXCEPTION 'cannot ban owner'; END IF;
  UPDATE public.profiles SET banned = _banned, ban_reason = CASE WHEN _banned THEN _reason ELSE NULL END, banned_at = CASE WHEN _banned THEN now() ELSE NULL END, updated_at = now() WHERE id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _role = 'owner' THEN RAISE EXCEPTION 'owner role cannot be changed here'; END IF;
  IF public.has_role(_user_id, 'owner') AND NOT _grant THEN RAISE EXCEPTION 'cannot demote owner'; END IF;
  IF _grant THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, _role) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_owner boolean; _ref text;
BEGIN
  _is_owner := lower(NEW.email) = 'bobkinloch5@gmail.com';
  _ref := lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  INSERT INTO public.profiles(id, email, display_name, avatar_url, credits, referral_code)
    VALUES (NEW.id, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
      NEW.raw_user_meta_data->>'avatar_url',
      CASE WHEN _is_owner THEN 999999 ELSE 10 END,
      _ref);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF _is_owner THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason)
    VALUES (NEW.id, CASE WHEN _is_owner THEN 999999 ELSE 10 END, CASE WHEN _is_owner THEN 999999 ELSE 10 END, 'starter');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.grant_credits_service(uuid, integer, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_credits_service(uuid, integer, text) TO service_role;

ALTER TABLE public.agent_messages REPLICA IDENTITY FULL;
ALTER TABLE public.project_chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_ai_settings;