-- Showcase fields on projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS showcase_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS showcase_title text,
  ADD COLUMN IF NOT EXISTS showcase_description text,
  ADD COLUMN IF NOT EXISTS showcase_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS showcase_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS showcase_likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS showcase_remix_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_projects_showcase_published
  ON public.projects(showcase_published, showcase_published_at DESC)
  WHERE showcase_published = true;

-- Public read policy for showcased projects
DROP POLICY IF EXISTS "public reads showcased projects" ON public.projects;
CREATE POLICY "public reads showcased projects"
  ON public.projects FOR SELECT
  TO anon, authenticated
  USING (showcase_published = true);

GRANT SELECT ON public.projects TO anon;

-- Likes table
CREATE TABLE IF NOT EXISTS public.showcase_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

GRANT SELECT ON public.showcase_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.showcase_likes TO authenticated;
GRANT ALL ON public.showcase_likes TO service_role;

ALTER TABLE public.showcase_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads likes" ON public.showcase_likes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "users like own" ON public.showcase_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users unlike own" ON public.showcase_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Maintain count
CREATE OR REPLACE FUNCTION public.tg_showcase_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.projects SET showcase_likes_count = showcase_likes_count + 1 WHERE id = NEW.project_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.projects SET showcase_likes_count = GREATEST(0, showcase_likes_count - 1) WHERE id = OLD.project_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_showcase_likes_count ON public.showcase_likes;
CREATE TRIGGER trg_showcase_likes_count
AFTER INSERT OR DELETE ON public.showcase_likes
FOR EACH ROW EXECUTE FUNCTION public.tg_showcase_likes_count();

-- Remix tracking: nullable forked_from on projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS forked_from_project_id uuid;

-- Remix function: clone showcased project for current user
CREATE OR REPLACE FUNCTION public.remix_showcase_project(_source_id uuid, _new_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _src public.projects;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _src FROM public.projects WHERE id = _source_id AND showcase_published = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'project_not_found_or_not_public'; END IF;

  INSERT INTO public.projects (user_id, name, description, game_type, ai_rules, status, forked_from_project_id)
  VALUES (_uid, COALESCE(_new_name, _src.name || ' (Remix)'), _src.description, _src.game_type, _src.ai_rules, 'draft', _src.id)
  RETURNING id INTO _new_id;

  INSERT INTO public.project_files (project_id, path, file_type, service_location, content)
  SELECT _new_id, path, file_type, service_location, content
  FROM public.project_files WHERE project_id = _source_id;

  UPDATE public.projects SET showcase_remix_count = showcase_remix_count + 1 WHERE id = _source_id;

  RETURN _new_id;
END $$;