-- Discord claim + referral system

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discord_claimed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid;

-- Backfill referral codes for existing users
UPDATE public.profiles
SET referral_code = lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))
WHERE referral_code IS NULL;

-- Claim 5 credits for joining Discord (once per account)
CREATE OR REPLACE FUNCTION public.claim_discord_credits()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _new int; _amt int := 5; _already boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT discord_claimed INTO _already FROM public.profiles WHERE id = _uid FOR UPDATE;
  IF _already THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  END IF;
  UPDATE public.profiles
    SET credits = credits + _amt, discord_claimed = true, updated_at = now()
    WHERE id = _uid
    RETURNING credits INTO _new;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason)
    VALUES (_uid, _amt, _new, 'discord_join');
  RETURN jsonb_build_object('claimed', true, 'credits', _new, 'amount', _amt);
END $$;

-- Apply a referral code once per new user; grants 10 credits to both parties
CREATE OR REPLACE FUNCTION public.apply_referral(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _referrer uuid;
  _existing uuid;
  _amt int := 10;
  _new_self int;
  _norm text := lower(trim(_code));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _norm IS NULL OR _norm = '' THEN RAISE EXCEPTION 'invalid_code'; END IF;

  SELECT referred_by INTO _existing FROM public.profiles WHERE id = _uid;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'already_referred');
  END IF;

  SELECT id INTO _referrer FROM public.profiles WHERE lower(referral_code) = _norm;
  IF _referrer IS NULL THEN RAISE EXCEPTION 'invalid_code'; END IF;
  IF _referrer = _uid THEN RAISE EXCEPTION 'self_referral'; END IF;

  UPDATE public.profiles
    SET referred_by = _referrer, credits = credits + _amt, updated_at = now()
    WHERE id = _uid
    RETURNING credits INTO _new_self;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason)
    VALUES (_uid, _amt, _new_self, 'referral_bonus_referee');

  PERFORM public.grant_credits_service(_referrer, _amt, 'referral_bonus_referrer');

  RETURN jsonb_build_object('applied', true, 'credits', _new_self, 'amount', _amt);
END $$;

-- Update new-user trigger to assign a referral_code on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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