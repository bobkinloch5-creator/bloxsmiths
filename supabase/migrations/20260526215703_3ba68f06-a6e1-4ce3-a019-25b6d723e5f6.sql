
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

CREATE UNIQUE INDEX promotion_submissions_user_url_pending_idx
  ON public.promotion_submissions(user_id, url)
  WHERE status = 'pending';

GRANT SELECT, INSERT ON public.promotion_submissions TO authenticated;
GRANT ALL ON public.promotion_submissions TO service_role;

ALTER TABLE public.promotion_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own promo submissions"
  ON public.promotion_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "users read own promo submissions"
  ON public.promotion_submissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins read all promo submissions"
  ON public.promotion_submissions FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admins update promo submissions"
  ON public.promotion_submissions FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_approve_promotion(_submission_id uuid, _credits integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _s public.promotion_submissions;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _credits IS NULL OR _credits <= 0 OR _credits > 500 THEN RAISE EXCEPTION 'invalid_credits'; END IF;
  SELECT * INTO _s FROM public.promotion_submissions WHERE id = _submission_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found or already processed'; END IF;
  PERFORM public.grant_credits_service(_s.user_id, _credits, 'promotion_reward');
  UPDATE public.promotion_submissions
    SET status = 'approved', credits_awarded = _credits, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _submission_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_promotion(_submission_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.promotion_submissions
    SET status = 'rejected', reject_reason = _reason, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _submission_id AND status = 'pending';
END $$;
