CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _is_owner boolean; _ref text;
BEGIN
  _is_owner := lower(NEW.email) = 'bobkinloch5@gmail.com';
  _ref := lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
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
END $function$;