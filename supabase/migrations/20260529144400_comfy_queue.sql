-- ComfyUI configuration and async job queue tables

-- 1. Create comfy_settings table
CREATE TABLE IF NOT EXISTS public.comfy_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  model_choice text NOT NULL DEFAULT 'black-forest-labs/FLUX.1-schnell',
  steps integer NOT NULL DEFAULT 4 CHECK (steps > 0),
  cfg numeric(4,2) NOT NULL DEFAULT 1.0 CHECK (cfg >= 0.0),
  seed bigint NOT NULL DEFAULT -1,
  width integer NOT NULL DEFAULT 1024 CHECK (width > 0),
  height integer NOT NULL DEFAULT 1024 CHECK (height > 0),
  timeout_seconds integer NOT NULL DEFAULT 60 CHECK (timeout_seconds > 0),
  use_local_comfy boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default singleton row if not exists
INSERT INTO public.comfy_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Grant permissions for settings
GRANT SELECT, UPDATE ON public.comfy_settings TO authenticated;
GRANT SELECT ON public.comfy_settings TO anon;
GRANT ALL ON public.comfy_settings TO service_role;

-- Enable RLS on settings
ALTER TABLE public.comfy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comfy settings"
  ON public.comfy_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can update comfy settings"
  ON public.comfy_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- 2. Create comfy_generation_jobs table
CREATE TABLE IF NOT EXISTS public.comfy_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  negative_prompt text,
  type text NOT NULL, -- 'image', 'classic_shirt', 'classic_pants', 'tshirt'
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  credits_cost integer NOT NULL DEFAULT 2 CHECK (credits_cost >= 0),
  output_image_url text,
  error_message text,
  reference_image_url text,
  
  -- snapshot of config used for this run
  model text,
  aspect_ratio text,
  steps integer,
  cfg numeric(4,2),
  seed bigint,
  width integer,
  height integer
);

-- Index for queue performance
CREATE INDEX IF NOT EXISTS idx_comfy_jobs_status_created ON public.comfy_generation_jobs(status, created_at);

-- Grant permissions for jobs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comfy_generation_jobs TO authenticated;
GRANT ALL ON public.comfy_generation_jobs TO service_role;

-- Enable RLS on jobs
ALTER TABLE public.comfy_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own comfy jobs"
  ON public.comfy_generation_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can insert own comfy jobs"
  ON public.comfy_generation_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users and admins can update comfy jobs"
  ON public.comfy_generation_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Automatically trigger touch_updated_at on comfy_generation_jobs
CREATE TRIGGER touch_comfy_generation_jobs
  BEFORE UPDATE ON public.comfy_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Add comfortable realtime publication for real-time listener support
ALTER TABLE public.comfy_generation_jobs REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'comfy_generation_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comfy_generation_jobs;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. Create automatic refund trigger for failed jobs
CREATE OR REPLACE FUNCTION public.tg_refund_failed_comfy_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _current_credits integer;
BEGIN
  IF NEW.status = 'failed' AND OLD.status IN ('pending', 'generating') THEN
    -- Refund the credits to the user's profile
    UPDATE public.profiles
    SET credits = credits + NEW.credits_cost, updated_at = now()
    WHERE id = NEW.user_id
    RETURNING credits INTO _current_credits;
    
    -- Insert transaction log
    INSERT INTO public.credit_transactions (user_id, amount, balance, reason)
    VALUES (
      NEW.user_id,
      NEW.credits_cost,
      COALESCE(_current_credits, 0),
      'refund_failed_job:' || NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_failed_comfy_job ON public.comfy_generation_jobs;
CREATE TRIGGER trg_refund_failed_comfy_job
  AFTER UPDATE ON public.comfy_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_refund_failed_comfy_job();
