CREATE OR REPLACE FUNCTION public.claim_daily_credits()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() at time zone 'utc')::date;
  _amt int := 10;
  _new int;
  _confirmed timestamptz;
  _created timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Require a confirmed email (blocks throwaway/unverified accounts from farming)
  SELECT email_confirmed_at, created_at INTO _confirmed, _created
  FROM auth.users WHERE id = _uid;
  IF _confirmed IS NULL THEN
    RAISE EXCEPTION 'email_not_confirmed';
  END IF;

  -- Require the account to exist for at least 5 minutes (slows scripted signup farms)
  IF _created > now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'account_too_new';
  END IF;

  -- Idempotent: PK on (user_id, claim_date) is the real lock
  IF EXISTS (SELECT 1 FROM public.daily_credit_claims WHERE user_id = _uid AND claim_date = _today) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed_today');
  END IF;

  INSERT INTO public.daily_credit_claims(user_id, claim_date, credits) VALUES (_uid, _today, _amt);
  UPDATE public.profiles SET credits = credits + _amt, updated_at = now() WHERE id = _uid RETURNING credits INTO _new;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_uid, _amt, _new, 'daily_claim');
  RETURN jsonb_build_object('claimed', true, 'credits', _new, 'amount', _amt);
END $function$;