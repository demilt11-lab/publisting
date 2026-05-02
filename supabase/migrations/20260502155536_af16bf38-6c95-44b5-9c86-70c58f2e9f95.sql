-- 1. Provider match runs: full audit of provider lookups
CREATE TABLE IF NOT EXISTS public.provider_match_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refresh_log_id uuid REFERENCES public.entity_refresh_log(id) ON DELETE SET NULL,
  provider text NOT NULL,
  entity_type text NOT NULL,
  pub_entity_id text NOT NULL,
  query_used text,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  chosen jsonb,
  rejected jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflict_reasons text[] NOT NULL DEFAULT '{}',
  confidence_contribution numeric,
  status text NOT NULL DEFAULT 'ok',
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pmr_entity ON public.provider_match_runs(entity_type, pub_entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmr_provider ON public.provider_match_runs(provider, created_at DESC);
ALTER TABLE public.provider_match_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pmr_read_signed_in" ON public.provider_match_runs;
CREATE POLICY "pmr_read_signed_in" ON public.provider_match_runs FOR SELECT TO authenticated USING (true);

-- 2. Ranking weights: tunable scoring config
CREATE TABLE IF NOT EXISTS public.ranking_weights (
  id text PRIMARY KEY,
  weight_confidence numeric NOT NULL DEFAULT 0.55,
  weight_popularity numeric NOT NULL DEFAULT 0.10,
  weight_activity numeric NOT NULL DEFAULT 0.10,
  weight_coverage numeric NOT NULL DEFAULT 0.15,
  weight_trust numeric NOT NULL DEFAULT 0.10,
  conflict_penalty numeric NOT NULL DEFAULT 0.10,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.ranking_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rw_read_signed_in" ON public.ranking_weights;
CREATE POLICY "rw_read_signed_in" ON public.ranking_weights FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rw_write_signed_in" ON public.ranking_weights;
CREATE POLICY "rw_write_signed_in" ON public.ranking_weights FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.ranking_weights (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- 3. Extend search_events with telemetry fields
ALTER TABLE public.search_events
  ADD COLUMN IF NOT EXISTS query_normalized text,
  ADD COLUMN IF NOT EXISTS suggestions_shown jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reformulated_from uuid REFERENCES public.search_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zero_result boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_used text;
CREATE INDEX IF NOT EXISTS idx_search_events_zero ON public.search_events(zero_result, created_at DESC) WHERE zero_result;
CREATE INDEX IF NOT EXISTS idx_search_events_fallback ON public.search_events(fallback_used, created_at DESC) WHERE fallback_used;

-- 4. Extend entity_refresh_log with retry workflow
ALTER TABLE public.entity_refresh_log
  ADD COLUMN IF NOT EXISTS queued_for_retry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempted_by uuid;
CREATE INDEX IF NOT EXISTS idx_erl_source_status ON public.entity_refresh_log(source, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_erl_retry ON public.entity_refresh_log(queued_for_retry, status) WHERE queued_for_retry;

-- 5. Provider health snapshots
CREATE TABLE IF NOT EXISTS public.provider_health_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL DEFAULT now(),
  total_runs integer NOT NULL DEFAULT 0,
  ok_runs integer NOT NULL DEFAULT 0,
  partial_runs integer NOT NULL DEFAULT 0,
  error_runs integer NOT NULL DEFAULT 0,
  avg_latency_ms integer,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phs_provider ON public.provider_health_snapshot(provider, created_at DESC);
ALTER TABLE public.provider_health_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "phs_read_signed_in" ON public.provider_health_snapshot;
CREATE POLICY "phs_read_signed_in" ON public.provider_health_snapshot FOR SELECT TO authenticated USING (true);

-- 6. View: live provider health (last 24h) computed on demand
CREATE OR REPLACE VIEW public.provider_health_live AS
SELECT
  source AS provider,
  COUNT(*)::int AS total_runs_24h,
  COUNT(*) FILTER (WHERE status='ok')::int AS ok_runs_24h,
  COUNT(*) FILTER (WHERE status='partial')::int AS partial_runs_24h,
  COUNT(*) FILTER (WHERE status='error')::int AS error_runs_24h,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status='ok')::numeric / NULLIF(COUNT(*),0)
  , 1) AS success_pct_24h,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::int AS avg_latency_ms,
  MAX(completed_at) FILTER (WHERE status='ok') AS last_success_at,
  MAX(completed_at) FILTER (WHERE status='error') AS last_error_at
FROM public.entity_refresh_log
WHERE started_at > now() - interval '24 hours'
  AND source IS NOT NULL
GROUP BY source;

-- 7. RPC: ranked search WITH per-row score breakdown for QA tooling
CREATE OR REPLACE FUNCTION public.pub_search_rank_debug(
  _q text, _type text DEFAULT NULL,
  _platform text DEFAULT NULL, _region text DEFAULT NULL,
  _limit int DEFAULT 20
)
RETURNS TABLE(
  entity_type text, pub_entity_id text, display_name text, subtitle text,
  matched_on text, base_confidence numeric, popularity_score numeric,
  activity_score numeric, coverage_score numeric, trust_score numeric,
  source_count int, externals jsonb,
  weighted_confidence numeric, weighted_popularity numeric,
  weighted_activity numeric, weighted_coverage numeric, weighted_trust numeric,
  rank numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _norm text;
  _ts tsquery;
  w record;
BEGIN
  SELECT * INTO w FROM public.ranking_weights WHERE id='default';
  _norm := public.normalize_entity_name(_q);
  BEGIN
    _ts := to_tsquery('simple', regexp_replace(trim(coalesce(_norm,'')), '\s+', ':* & ', 'g') || ':*');
  EXCEPTION WHEN OTHERS THEN
    _ts := plainto_tsquery('simple', coalesce(_q,''));
  END;

  RETURN QUERY
  WITH base AS (
    SELECT sd.*,
      CASE
        WHEN sd.normalized_name = _norm THEN 'name_exact'
        WHEN sd.normalized_name LIKE _norm || '%' THEN 'name_prefix'
        WHEN sd.aliases @> ARRAY[_norm] THEN 'alias_exact'
        WHEN EXISTS (SELECT 1 FROM jsonb_each_text(sd.externals) kv WHERE kv.value = _q OR kv.value = _norm) THEN 'external_exact'
        WHEN _q = ANY(sd.platform_urls) THEN 'url_exact'
        ELSE 'fuzzy'
      END AS matched_on,
      (CASE
        WHEN sd.normalized_name = _norm THEN 1.0
        WHEN sd.normalized_name LIKE _norm || '%' THEN 0.85
        WHEN sd.aliases @> ARRAY[_norm] THEN 0.92
        WHEN EXISTS (SELECT 1 FROM jsonb_each_text(sd.externals) kv WHERE kv.value = _q OR kv.value = _norm) THEN 0.97
        WHEN _q = ANY(sd.platform_urls) THEN 0.96
        ELSE GREATEST(0.05, ts_rank(sd.searchable_text, _ts))::numeric
      END)::numeric AS conf,
      (SELECT count(*) FROM jsonb_object_keys(sd.externals))::int AS sc
    FROM public.search_documents sd
    WHERE
      (_type IS NULL OR sd.entity_type = _type)
      AND (
        sd.normalized_name = _norm
        OR sd.normalized_name LIKE _norm || '%'
        OR sd.aliases @> ARRAY[_norm]
        OR sd.searchable_text @@ _ts
        OR EXISTS (SELECT 1 FROM jsonb_each_text(sd.externals) kv WHERE kv.value = _q OR kv.value = _norm)
        OR _q = ANY(sd.platform_urls)
      )
      AND (_platform IS NULL OR sd.externals ? _platform)
      AND (_region IS NULL OR sd.region_tags @> ARRAY[_region])
  )
  SELECT
    b.entity_type, b.pub_entity_id, b.display_name, b.subtitle, b.matched_on,
    round(b.conf,3) AS base_confidence,
    round(LEAST(1.0::numeric, b.popularity_score),3),
    round(LEAST(1.0::numeric, b.activity_score),3),
    round(LEAST(1.0::numeric, b.coverage_score),3),
    round(LEAST(1.0::numeric, b.trust_score),3),
    COALESCE(b.sc,0),
    b.externals,
    round(b.conf * w.weight_confidence, 4),
    round(LEAST(1.0::numeric, b.popularity_score) * w.weight_popularity, 4),
    round(LEAST(1.0::numeric, b.activity_score) * w.weight_activity, 4),
    round(LEAST(1.0::numeric, b.coverage_score) * w.weight_coverage, 4),
    round(LEAST(1.0::numeric, b.trust_score) * w.weight_trust, 4),
    round(
      (b.conf * w.weight_confidence) +
      (LEAST(1.0::numeric, b.popularity_score) * w.weight_popularity) +
      (LEAST(1.0::numeric, b.activity_score)   * w.weight_activity) +
      (LEAST(1.0::numeric, b.coverage_score)   * w.weight_coverage) +
      (LEAST(1.0::numeric, b.trust_score)      * w.weight_trust)
    , 4) AS rank
  FROM base b CROSS JOIN (SELECT * FROM public.ranking_weights WHERE id='default') w
  ORDER BY rank DESC NULLS LAST
  LIMIT _limit;
END $$;

GRANT SELECT ON public.provider_health_live TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.pub_search_rank_debug(text, text, text, text, int) TO authenticated;