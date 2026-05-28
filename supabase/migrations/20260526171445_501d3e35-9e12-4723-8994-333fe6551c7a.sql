
-- Per-user AI usage tracking for rolling-window rate limits (5h + weekly)
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON public.ai_usage_events(user_id, created_at DESC);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own usage" ON public.ai_usage_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Limits (centralized constants — tweak here to change caps)
-- 5h rolling: 25 AI messages
-- 7d rolling: 200 AI messages
-- Owners are exempt.

CREATE OR REPLACE FUNCTION public.get_ai_usage()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _5h_used int;
  _7d_used int;
  _5h_limit int := 25;
  _7d_limit int := 200;
  _next_5h timestamptz;
  _next_7d timestamptz;
  _is_owner boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT public.has_role(_uid,'owner') INTO _is_owner;
  IF _is_owner THEN
    RETURN jsonb_build_object('owner', true, 'limit_5h', _5h_limit, 'used_5h', 0, 'limit_7d', _7d_limit, 'used_7d', 0);
  END IF;
  SELECT COUNT(*), MIN(created_at) + interval '5 hours'
    INTO _5h_used, _next_5h
    FROM public.ai_usage_events
    WHERE user_id = _uid AND created_at > now() - interval '5 hours';
  SELECT COUNT(*), MIN(created_at) + interval '7 days'
    INTO _7d_used, _next_7d
    FROM public.ai_usage_events
    WHERE user_id = _uid AND created_at > now() - interval '7 days';
  RETURN jsonb_build_object(
    'owner', false,
    'limit_5h', _5h_limit, 'used_5h', COALESCE(_5h_used,0), 'reset_5h', _next_5h,
    'limit_7d', _7d_limit, 'used_7d', COALESCE(_7d_used,0), 'reset_7d', _next_7d
  );
END $$;

CREATE OR REPLACE FUNCTION public.check_and_record_ai_usage()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _5h int; _7d int;
  _5h_limit int := 25; _7d_limit int := 200;
  _is_owner boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT public.has_role(_uid,'owner') INTO _is_owner;
  IF _is_owner THEN
    RETURN jsonb_build_object('allowed', true, 'owner', true);
  END IF;
  SELECT COUNT(*) INTO _5h FROM public.ai_usage_events
    WHERE user_id=_uid AND created_at > now() - interval '5 hours';
  IF _5h >= _5h_limit THEN
    RAISE EXCEPTION 'rate_limited_5h';
  END IF;
  SELECT COUNT(*) INTO _7d FROM public.ai_usage_events
    WHERE user_id=_uid AND created_at > now() - interval '7 days';
  IF _7d >= _7d_limit THEN
    RAISE EXCEPTION 'rate_limited_7d';
  END IF;
  INSERT INTO public.ai_usage_events(user_id) VALUES (_uid);
  -- Best-effort cleanup of rows older than 8 days (keeps table small)
  DELETE FROM public.ai_usage_events WHERE created_at < now() - interval '8 days';
  RETURN jsonb_build_object('allowed', true, 'used_5h', _5h+1, 'used_7d', _7d+1, 'limit_5h', _5h_limit, 'limit_7d', _7d_limit);
END $$;
