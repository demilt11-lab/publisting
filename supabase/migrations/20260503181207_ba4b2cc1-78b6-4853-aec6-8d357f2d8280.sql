
-- 1. API rate limiter: per-service per-minute window counters
CREATE TABLE IF NOT EXISTS public.api_rate_limiter (
  service_name text NOT NULL,
  window_start_time timestamptz NOT NULL,
  requests_made integer NOT NULL DEFAULT 0,
  limit_per_minute integer NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_name, window_start_time)
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limiter_service ON public.api_rate_limiter(service_name, window_start_time DESC);
ALTER TABLE public.api_rate_limiter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rl_admin_read" ON public.api_rate_limiter FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Per-service config (limits & burst)
CREATE TABLE IF NOT EXISTS public.api_service_config (
  service_name text PRIMARY KEY,
  limit_per_minute integer NOT NULL DEFAULT 60,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_service_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rsc_admin_read" ON public.api_service_config FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
INSERT INTO public.api_service_config(service_name, limit_per_minute, notes) VALUES
  ('spotify', 100, 'Spotify Web API client credentials'),
  ('soundcharts', 60, 'Soundcharts API'),
  ('genius', 60, 'Genius API'),
  ('musicbrainz', 50, 'MusicBrainz public API'),
  ('discogs', 60, 'Discogs API'),
  ('hunter', 30, 'Hunter.io')
ON CONFLICT (service_name) DO NOTHING;

-- Atomic check + increment: returns allowed, current count, limit, window_start
CREATE OR REPLACE FUNCTION public.api_rate_limit_check(_service text, _cost integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _win timestamptz := date_trunc('minute', now());
  _limit integer;
  _count integer;
BEGIN
  SELECT limit_per_minute INTO _limit FROM public.api_service_config WHERE service_name = _service;
  IF _limit IS NULL THEN
    INSERT INTO public.api_service_config(service_name, limit_per_minute) VALUES (_service, 60)
      ON CONFLICT DO NOTHING;
    _limit := 60;
  END IF;

  INSERT INTO public.api_rate_limiter(service_name, window_start_time, requests_made, limit_per_minute)
    VALUES (_service, _win, _cost, _limit)
    ON CONFLICT (service_name, window_start_time)
    DO UPDATE SET requests_made = api_rate_limiter.requests_made + _cost,
                  updated_at = now()
  RETURNING requests_made INTO _count;

  IF _count > _limit THEN
    -- Roll back the increment so we don't double-count rejected requests
    UPDATE public.api_rate_limiter
       SET requests_made = GREATEST(0, requests_made - _cost), updated_at = now()
     WHERE service_name = _service AND window_start_time = _win;
    RETURN jsonb_build_object(
      'allowed', false, 'service', _service,
      'count', _count - _cost, 'limit', _limit,
      'window_start', _win, 'reset_in_ms',
      GREATEST(0, EXTRACT(EPOCH FROM (_win + interval '1 minute' - now())) * 1000)::int
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true, 'service', _service,
    'count', _count, 'limit', _limit, 'window_start', _win
  );
END
$$;

-- 2. Pending request queue
CREATE TABLE IF NOT EXISTS public.pending_api_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  edge_function text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','dead')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_pending_api_requests_due ON public.pending_api_requests(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_pending_api_requests_service ON public.pending_api_requests(service_name, status);
ALTER TABLE public.pending_api_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "par_admin_read" ON public.pending_api_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "par_user_insert" ON public.pending_api_requests FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR created_by IS NULL);

-- 3. Query-level cache
CREATE TABLE IF NOT EXISTS public.search_query_cache (
  query_hash text PRIMARY KEY,
  query_text text,
  service_name text,
  results_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ttl_minutes integer NOT NULL DEFAULT 15,
  expires_at timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_search_query_cache_expires ON public.search_query_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_query_cache_service ON public.search_query_cache(service_name);
ALTER TABLE public.search_query_cache ENABLE ROW LEVEL SECURITY;
-- Cache is global non-PII; admins read, anyone authenticated may read for dashboards
CREATE POLICY "sqc_authenticated_read" ON public.search_query_cache FOR SELECT TO authenticated USING (true);

-- 4. API call telemetry for /admin/health (success rate, validation errors)
CREATE TABLE IF NOT EXISTS public.api_call_log (
  id bigserial PRIMARY KEY,
  service_name text NOT NULL,
  endpoint text,
  status_code integer,
  outcome text NOT NULL CHECK (outcome IN ('success','error','rate_limited','retry','fallback','validation_error')),
  duration_ms integer,
  attempt integer NOT NULL DEFAULT 1,
  error_message text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_call_log_recent ON public.api_call_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_call_log_service ON public.api_call_log(service_name, occurred_at DESC);
ALTER TABLE public.api_call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acl_admin_read" ON public.api_call_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Cleanup helper: drop expired cache + old logs (called by cron worker)
CREATE OR REPLACE FUNCTION public.api_infra_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cache int; _logs int; _windows int;
BEGIN
  DELETE FROM public.search_query_cache WHERE expires_at < now();
  GET DIAGNOSTICS _cache = ROW_COUNT;
  DELETE FROM public.api_call_log WHERE occurred_at < now() - interval '7 days';
  GET DIAGNOSTICS _logs = ROW_COUNT;
  DELETE FROM public.api_rate_limiter WHERE window_start_time < now() - interval '1 hour';
  GET DIAGNOSTICS _windows = ROW_COUNT;
  RETURN jsonb_build_object('cache_deleted', _cache, 'logs_deleted', _logs, 'windows_deleted', _windows);
END
$$;
