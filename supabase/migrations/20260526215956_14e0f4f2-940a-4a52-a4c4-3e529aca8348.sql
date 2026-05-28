ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_set_ban(_user_id uuid, _banned boolean, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF public.has_role(_user_id, 'owner') THEN RAISE EXCEPTION 'cannot ban owner'; END IF;
  UPDATE public.profiles
    SET banned = _banned,
        ban_reason = CASE WHEN _banned THEN _reason ELSE NULL END,
        banned_at = CASE WHEN _banned THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id uuid, _role app_role, _grant boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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