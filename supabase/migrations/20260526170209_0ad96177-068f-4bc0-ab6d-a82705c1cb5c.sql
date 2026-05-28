
-- Promo codes
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
CREATE POLICY "admins manage promo codes" ON public.promo_codes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

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
CREATE POLICY "users read own redemptions" ON public.promo_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "admins read all redemptions" ON public.promo_redemptions FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Daily claim tracking
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
CREATE POLICY "users read own daily claims" ON public.daily_credit_claims FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Redeem promo
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

-- Daily claim (10 credits once per UTC day)
CREATE OR REPLACE FUNCTION public.claim_daily_credits()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _today date := (now() at time zone 'utc')::date; _amt int := 10; _new int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.daily_credit_claims WHERE user_id = _uid AND claim_date = _today) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed_today');
  END IF;
  INSERT INTO public.daily_credit_claims(user_id, claim_date, credits) VALUES (_uid, _today, _amt);
  UPDATE public.profiles SET credits = credits + _amt, updated_at = now() WHERE id = _uid RETURNING credits INTO _new;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason) VALUES (_uid, _amt, _new, 'daily_claim');
  RETURN jsonb_build_object('claimed', true, 'credits', _new, 'amount', _amt);
END $$;

-- Reduce starter to 10
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_owner boolean;
BEGIN
  _is_owner := lower(NEW.email) = 'bobkinloch5@gmail.com';
  INSERT INTO public.profiles(id, email, display_name, avatar_url, credits)
    VALUES (NEW.id, NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
      NEW.raw_user_meta_data->>'avatar_url',
      CASE WHEN _is_owner THEN 999999 ELSE 10 END);
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF _is_owner THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.credit_transactions(user_id, amount, balance, reason)
    VALUES (NEW.id, CASE WHEN _is_owner THEN 999999 ELSE 10 END, CASE WHEN _is_owner THEN 999999 ELSE 10 END, 'starter');
  RETURN NEW;
END $$;
