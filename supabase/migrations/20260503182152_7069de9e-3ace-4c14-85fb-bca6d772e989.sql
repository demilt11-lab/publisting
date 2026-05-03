
-- 1. user_search_logs
CREATE TABLE public.user_search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  query_text text NOT NULL,
  result_count integer NOT NULL DEFAULT 0,
  clicked_entity_id text,
  clicked_entity_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_search_logs_created ON public.user_search_logs (created_at DESC);
CREATE INDEX idx_user_search_logs_user ON public.user_search_logs (user_id, created_at DESC);
CREATE INDEX idx_user_search_logs_query ON public.user_search_logs (lower(query_text));
ALTER TABLE public.user_search_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own search logs" ON public.user_search_logs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Admins read all search logs" ON public.user_search_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can insert search logs" ON public.user_search_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- 2. user_rate_limits (per-user, per-action, per-minute counters)
CREATE TABLE public.user_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action, window_start)
);
CREATE INDEX idx_user_rate_limits_window ON public.user_rate_limits (action, window_start);
ALTER TABLE public.user_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own rate limits" ON public.user_rate_limits FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Admins read all rate limits" ON public.user_rate_limits FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
-- writes only via SECURITY DEFINER function

CREATE OR REPLACE FUNCTION public.user_rate_limit_check(
  _action text,
  _limit integer DEFAULT 100,
  _window_minutes integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _win timestamptz := date_trunc('minute', now());
  _cutoff timestamptz := now() - make_interval(mins => _window_minutes);
  _total integer;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

  -- Bump current minute window
  INSERT INTO public.user_rate_limits(user_id, action, window_start, count)
  VALUES (_uid, _action, _win, 1)
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET count = user_rate_limits.count + 1, updated_at = now();

  -- Sum across the rolling window
  SELECT COALESCE(SUM(count), 0) INTO _total
  FROM public.user_rate_limits
  WHERE user_id = _uid AND action = _action AND window_start >= _cutoff;

  IF _total > _limit THEN
    -- Roll back the increment so the over-limit call doesn't pollute future windows
    UPDATE public.user_rate_limits
       SET count = GREATEST(0, count - 1), updated_at = now()
     WHERE user_id = _uid AND action = _action AND window_start = _win;

    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limited',
      'count', _total - 1,
      'limit', _limit,
      'window_minutes', _window_minutes,
      'reset_in_seconds', GREATEST(60, EXTRACT(EPOCH FROM (
        (SELECT MIN(window_start) FROM public.user_rate_limits
          WHERE user_id = _uid AND action = _action AND window_start >= _cutoff)
        + make_interval(mins => _window_minutes) - now()
      ))::int)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'count', _total, 'limit', _limit,
    'window_minutes', _window_minutes
  );
END;
$$;

-- Cleanup function for old rate-limit windows
CREATE OR REPLACE FUNCTION public.user_rate_limits_cleanup() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  DELETE FROM public.user_rate_limits WHERE window_start < now() - interval '2 hours';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

-- 3. Extend outreach_records with contact tracking
DO $$ BEGIN
  CREATE TYPE public.outreach_contact_status AS ENUM (
    'not_contacted', 'contacted', 'responded', 'passed', 'interested'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.outreach_records
  ADD COLUMN IF NOT EXISTS last_contact_date timestamptz,
  ADD COLUMN IF NOT EXISTS contact_status public.outreach_contact_status NOT NULL DEFAULT 'not_contacted',
  ADD COLUMN IF NOT EXISTS next_follow_up_date date,
  ADD COLUMN IF NOT EXISTS communication_notes text;

CREATE INDEX IF NOT EXISTS idx_outreach_records_followup
  ON public.outreach_records (team_id, next_follow_up_date)
  WHERE next_follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_records_contact_status
  ON public.outreach_records (team_id, contact_status);
