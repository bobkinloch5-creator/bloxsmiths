
CREATE TABLE IF NOT EXISTS public.blocked_email_domains (
  domain text PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_email_domains TO authenticated;
GRANT ALL ON public.blocked_email_domains TO service_role;

ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage blocked domains"
ON public.blocked_email_domains FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.blocked_email_domains(domain, reason) VALUES
  ('mailinator.com','disposable'),
  ('tempmail.com','disposable'),
  ('temp-mail.org','disposable'),
  ('temp-mail.io','disposable'),
  ('guerrillamail.com','disposable'),
  ('guerrillamail.net','disposable'),
  ('guerrillamail.org','disposable'),
  ('sharklasers.com','disposable'),
  ('10minutemail.com','disposable'),
  ('10minutemail.net','disposable'),
  ('yopmail.com','disposable'),
  ('throwawaymail.com','disposable'),
  ('getnada.com','disposable'),
  ('maildrop.cc','disposable'),
  ('dispostable.com','disposable'),
  ('fakeinbox.com','disposable'),
  ('trashmail.com','disposable'),
  ('mintemail.com','disposable'),
  ('mohmal.com','disposable'),
  ('inboxbear.com','disposable'),
  ('emailondeck.com','disposable'),
  ('mailnesia.com','disposable'),
  ('mytemp.email','disposable'),
  ('moakt.com','disposable'),
  ('tutanota-temp.com','disposable'),
  ('luxusmail.org','disposable'),
  ('spambog.com','disposable'),
  ('dropmail.me','disposable'),
  ('mailcatch.com','disposable'),
  ('mail.tm','disposable'),
  ('mailpoof.com','disposable'),
  ('emailtemporanea.net','disposable'),
  ('33mail.com','disposable'),
  ('anonbox.net','disposable'),
  ('byom.de','disposable'),
  ('discard.email','disposable'),
  ('mailsac.com','disposable'),
  ('mintmail.com','disposable')
ON CONFLICT (domain) DO NOTHING;

-- Block signups from blocked domains via the existing handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _is_owner boolean; _ref text; _starter int := 150; _domain text;
BEGIN
  _domain := lower(split_part(NEW.email, '@', 2));
  IF EXISTS (SELECT 1 FROM public.blocked_email_domains WHERE domain = _domain) THEN
    RAISE EXCEPTION 'email_domain_not_allowed' USING HINT = 'Please use a real, non-disposable email address.';
  END IF;

  _is_owner := lower(NEW.email) = 'bobkinloch5@gmail.com';
  _ref := lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  INSERT INTO public.profiles(id, email, display_name, avatar_url, credits, referral_code)
    VALUES (NEW.id, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
      NEW.raw_user_meta_data->>'avatar_url',
      CASE WHEN _is_owner THEN 999999 ELSE _starter END,
      _ref);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF _is_owner THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason)
    VALUES (NEW.id, CASE WHEN _is_owner THEN 999999 ELSE _starter END, CASE WHEN _is_owner THEN 999999 ELSE _starter END, 'starter');
  RETURN NEW;
END $function$;
