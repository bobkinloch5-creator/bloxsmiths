
-- BUILD PLANS
CREATE TABLE public.build_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  prompt text NOT NULL,
  plan jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_build_plans_project ON public.build_plans(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_plans TO authenticated;
GRANT ALL ON public.build_plans TO service_role;
ALTER TABLE public.build_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read plans" ON public.build_plans FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "members insert plans" ON public.build_plans FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "members update plans" ON public.build_plans FOR UPDATE TO authenticated USING (public.can_access_project(project_id, auth.uid())) WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "owners delete plans" ON public.build_plans FOR DELETE TO authenticated USING (public.is_project_owner(project_id, auth.uid()));

-- PROJECT TASKS
CREATE TABLE public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  plan_id uuid,
  user_id uuid NOT NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'feature',
  status text NOT NULL DEFAULT 'todo',
  payload jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_tasks_project ON public.project_tasks(project_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT ALL ON public.project_tasks TO service_role;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read tasks" ON public.project_tasks FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "members insert tasks" ON public.project_tasks FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "members update tasks" ON public.project_tasks FOR UPDATE TO authenticated USING (public.can_access_project(project_id, auth.uid())) WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "members delete tasks" ON public.project_tasks FOR DELETE TO authenticated USING (public.can_access_project(project_id, auth.uid()));

-- TEMPLATES (public catalog)
CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  thumbnail_url text,
  credits_cost integer NOT NULL DEFAULT 0,
  difficulty text NOT NULL DEFAULT 'beginner',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  build_spec jsonb NOT NULL,
  install_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_templates_category ON public.templates(category, active);
GRANT SELECT ON public.templates TO authenticated, anon;
GRANT ALL ON public.templates TO service_role;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads active templates" ON public.templates FOR SELECT TO authenticated, anon USING (active = true);
CREATE POLICY "admins manage templates" ON public.templates FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- TEMPLATE INSTALLS
CREATE TABLE public.template_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  credits_charged integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_template_installs_user ON public.template_installs(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.template_installs TO authenticated;
GRANT ALL ON public.template_installs TO service_role;
ALTER TABLE public.template_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own installs" ON public.template_installs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own installs" ON public.template_installs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- PROJECT SCANS (AI Game Doctor)
CREATE TABLE public.project_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  report jsonb NOT NULL,
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_scans_project ON public.project_scans(project_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.project_scans TO authenticated;
GRANT ALL ON public.project_scans TO service_role;
ALTER TABLE public.project_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read scans" ON public.project_scans FOR SELECT TO authenticated USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "members insert scans" ON public.project_scans FOR INSERT TO authenticated WITH CHECK (public.can_access_project(project_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "owners delete scans" ON public.project_scans FOR DELETE TO authenticated USING (public.is_project_owner(project_id, auth.uid()));

-- Updated-at triggers
CREATE TRIGGER trg_build_plans_touch BEFORE UPDATE ON public.build_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_project_tasks_touch BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_templates_touch BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
