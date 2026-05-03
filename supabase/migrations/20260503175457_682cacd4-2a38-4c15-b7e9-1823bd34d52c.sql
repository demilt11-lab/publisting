
-- search_result_quality
CREATE TABLE IF NOT EXISTS public.search_result_quality (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  completeness_score INTEGER NOT NULL DEFAULT 0 CHECK (completeness_score BETWEEN 0 AND 100),
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  validation_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_srq_entity ON public.search_result_quality(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_srq_validated ON public.search_result_quality(last_validated_at DESC);
CREATE INDEX IF NOT EXISTS idx_srq_completeness ON public.search_result_quality(completeness_score);
ALTER TABLE public.search_result_quality ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "srq_read_authenticated" ON public.search_result_quality;
CREATE POLICY "srq_read_authenticated" ON public.search_result_quality FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS set_srq_updated_at ON public.search_result_quality;
CREATE TRIGGER set_srq_updated_at BEFORE UPDATE ON public.search_result_quality
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- potential_duplicates
CREATE TABLE IF NOT EXISTS public.potential_duplicates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id_1 TEXT NOT NULL,
  entity_id_2 TEXT NOT NULL,
  similarity_score NUMERIC(4,3) NOT NULL CHECK (similarity_score BETWEEN 0 AND 1),
  match_reason TEXT,
  merge_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (merge_status IN ('pending','merged','ignored','auto_merged')),
  merged_into TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id_1, entity_id_2)
);
CREATE INDEX IF NOT EXISTS idx_pd_status ON public.potential_duplicates(merge_status);
CREATE INDEX IF NOT EXISTS idx_pd_e1 ON public.potential_duplicates(entity_type, entity_id_1);
CREATE INDEX IF NOT EXISTS idx_pd_e2 ON public.potential_duplicates(entity_type, entity_id_2);
ALTER TABLE public.potential_duplicates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pd_read_authenticated" ON public.potential_duplicates;
CREATE POLICY "pd_read_authenticated" ON public.potential_duplicates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pd_admin_update" ON public.potential_duplicates;
CREATE POLICY "pd_admin_update" ON public.potential_duplicates
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS set_pd_updated_at ON public.potential_duplicates;
CREATE TRIGGER set_pd_updated_at BEFORE UPDATE ON public.potential_duplicates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- data_source_confirmations
CREATE TABLE IF NOT EXISTS public.data_source_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  spotify_value JSONB,
  soundcharts_value JSONB,
  genius_value JSONB,
  consensus_value JSONB,
  confidence_level INTEGER NOT NULL DEFAULT 0 CHECK (confidence_level BETWEEN 0 AND 100),
  agreement_label TEXT,
  sources_present TEXT[] NOT NULL DEFAULT '{}',
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field_name)
);
CREATE INDEX IF NOT EXISTS idx_dsc_entity ON public.data_source_confirmations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dsc_field ON public.data_source_confirmations(field_name);
ALTER TABLE public.data_source_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dsc_read_authenticated" ON public.data_source_confirmations;
CREATE POLICY "dsc_read_authenticated" ON public.data_source_confirmations FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS set_dsc_updated_at ON public.data_source_confirmations;
CREATE TRIGGER set_dsc_updated_at BEFORE UPDATE ON public.data_source_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend existing soundcharts_cache with endpoint metadata + fetched_at
ALTER TABLE public.soundcharts_cache ADD COLUMN IF NOT EXISTS endpoint TEXT;
ALTER TABLE public.soundcharts_cache ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.soundcharts_cache ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.soundcharts_cache ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_sc_cache_endpoint ON public.soundcharts_cache(endpoint);

-- genius_cache
CREATE TABLE IF NOT EXISTS public.genius_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  entity_id TEXT,
  entity_type TEXT,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '6 hours')
);
CREATE INDEX IF NOT EXISTS idx_genius_cache_expires ON public.genius_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_genius_cache_endpoint ON public.genius_cache(endpoint);
ALTER TABLE public.genius_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "genius_cache_read_authenticated" ON public.genius_cache;
CREATE POLICY "genius_cache_read_authenticated" ON public.genius_cache FOR SELECT TO authenticated USING (true);

-- normalize_entity_key
CREATE OR REPLACE FUNCTION public.normalize_entity_key(_title TEXT, _artist TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    lower(
      regexp_replace(
        regexp_replace(
          coalesce(_title,'') || '|' || coalesce(_artist,''),
          '\s*[\(\[]?\s*(feat\.?|ft\.?|featuring|with)\s+[^\)\]\|]+[\)\]]?', '', 'gi'
        ),
        '[^a-z0-9|]+', '', 'gi'
      )
    )
$$;
