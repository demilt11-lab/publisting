
-- ============================================================
-- Phase 7: canonical entity intelligence backend foundation
-- ============================================================

-- 1. Extend existing core tables additively ------------------
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS genres text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS popularity_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS artist_pub_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS popularity_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;

ALTER TABLE public.albums
  ADD COLUMN IF NOT EXISTS artist_pub_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS isni text,
  ADD COLUMN IF NOT EXISTS popularity_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;

-- track_credits: denormalize pub IDs + source_count
ALTER TABLE public.track_credits
  ADD COLUMN IF NOT EXISTS pub_track_id text,
  ADD COLUMN IF NOT EXISTS pub_creator_id text,
  ADD COLUMN IF NOT EXISTS source_count integer NOT NULL DEFAULT 1;

-- backfill once
UPDATE public.track_credits tc
SET pub_track_id = t.pub_track_id, pub_creator_id = c.pub_creator_id
FROM public.tracks t, public.creators c
WHERE tc.track_id = t.id AND tc.creator_id = c.id
  AND (tc.pub_track_id IS NULL OR tc.pub_creator_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_track_credits_pub_track ON public.track_credits(pub_track_id);
CREATE INDEX IF NOT EXISTS idx_track_credits_pub_creator ON public.track_credits(pub_creator_id);

-- keep them in sync
CREATE OR REPLACE FUNCTION public.trg_track_credits_fill_pub_ids()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pub_track_id IS NULL THEN
    SELECT pub_track_id INTO NEW.pub_track_id FROM public.tracks WHERE id = NEW.track_id;
  END IF;
  IF NEW.pub_creator_id IS NULL THEN
    SELECT pub_creator_id INTO NEW.pub_creator_id FROM public.creators WHERE id = NEW.creator_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_track_credits_fill_pub_ids ON public.track_credits;
CREATE TRIGGER trg_track_credits_fill_pub_ids
  BEFORE INSERT OR UPDATE ON public.track_credits
  FOR EACH ROW EXECUTE FUNCTION public.trg_track_credits_fill_pub_ids();

-- 2. Relationship tables -------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_creator_pub_id text NOT NULL,
  target_creator_pub_id text NOT NULL,
  relationship_type text NOT NULL DEFAULT 'collaborator',
  weight numeric NOT NULL DEFAULT 1,
  first_seen date,
  last_seen date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_creator_pub_id, target_creator_pub_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS idx_creator_rel_source ON public.creator_relationships(source_creator_pub_id);
CREATE INDEX IF NOT EXISTS idx_creator_rel_target ON public.creator_relationships(target_creator_pub_id);

CREATE TABLE IF NOT EXISTS public.artist_creator_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_artist_id text NOT NULL,
  pub_creator_id text NOT NULL,
  relationship_type text NOT NULL DEFAULT 'collaborator',
  weight numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pub_artist_id, pub_creator_id, relationship_type)
);
CREATE INDEX IF NOT EXISTS idx_acl_artist ON public.artist_creator_links(pub_artist_id);
CREATE INDEX IF NOT EXISTS idx_acl_creator ON public.artist_creator_links(pub_creator_id);

-- 3. URL/external-id helper table ----------------------------
CREATE TABLE IF NOT EXISTS public.platform_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  pub_entity_id text NOT NULL,
  platform text NOT NULL,
  url text NOT NULL UNIQUE,
  normalized_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_urls_norm ON public.platform_urls(normalized_url);
CREATE INDEX IF NOT EXISTS idx_platform_urls_entity ON public.platform_urls(entity_type, pub_entity_id);

-- 4. Metrics / history extras --------------------------------
CREATE TABLE IF NOT EXISTS public.entity_stats_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  pub_entity_id text NOT NULL,
  platform text NOT NULL,
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  as_of_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, pub_entity_id, platform, metric_name, as_of_date)
);
CREATE INDEX IF NOT EXISTS idx_stats_entity_date
  ON public.entity_stats_daily(entity_type, pub_entity_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_stats_metric
  ON public.entity_stats_daily(metric_name, as_of_date DESC);

CREATE TABLE IF NOT EXISTS public.airplay_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_track_id text NOT NULL,
  territory text,
  station text,
  spins integer NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_airplay_track ON public.airplay_history(pub_track_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_airplay_territory ON public.airplay_history(territory, captured_at DESC);

-- 5. Provenance / refresh log --------------------------------
CREATE TABLE IF NOT EXISTS public.entity_refresh_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  pub_entity_id text NOT NULL,
  refresh_reason text,
  source text,
  status text NOT NULL DEFAULT 'queued',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_refresh_log_entity
  ON public.entity_refresh_log(entity_type, pub_entity_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_log_status
  ON public.entity_refresh_log(status, started_at DESC);

-- field_provenance: extend with conflict_state + jsonb values for richer storage
ALTER TABLE public.field_provenance
  ADD COLUMN IF NOT EXISTS source_value jsonb,
  ADD COLUMN IF NOT EXISTS normalized_value jsonb,
  ADD COLUMN IF NOT EXISTS conflict_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS pub_entity_id text;

CREATE INDEX IF NOT EXISTS idx_field_prov_pub
  ON public.field_provenance(pub_entity_id, field_name);

-- 6. Search / saved queries ----------------------------------
CREATE TABLE IF NOT EXISTS public.saved_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  query_json jsonb NOT NULL,
  query_hash text NOT NULL,
  is_subscribed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_queries_user ON public.saved_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_hash ON public.saved_queries(query_hash);

CREATE TABLE IF NOT EXISTS public.saved_query_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_query_id uuid NOT NULL REFERENCES public.saved_queries(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  result_count integer NOT NULL DEFAULT 0,
  diff_count integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  added jsonb NOT NULL DEFAULT '[]'::jsonb,
  removed jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_sqr_query ON public.saved_query_runs(saved_query_id, run_at DESC);

CREATE TABLE IF NOT EXISTS public.search_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  query text,
  query_type text,
  entity_type text,
  pub_entity_id text,
  clicked_rank integer,
  matched_on text,
  result_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_events_user ON public.search_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_pub ON public.search_events(pub_entity_id);

-- 7. API auth tables -----------------------------------------
CREATE TABLE IF NOT EXISTS public.api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  scopes text[] NOT NULL DEFAULT ARRAY['read'],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_clients_user ON public.api_clients(user_id);

CREATE TABLE IF NOT EXISTS public.api_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_client ON public.api_refresh_tokens(client_id);

-- 8. search_documents + ranking RPC --------------------------
CREATE TABLE IF NOT EXISTS public.search_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  pub_entity_id text NOT NULL,
  display_name text NOT NULL,
  subtitle text,
  normalized_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  searchable_text tsvector,
  externals jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform_urls text[] NOT NULL DEFAULT '{}',
  popularity_score numeric NOT NULL DEFAULT 0,
  activity_score numeric NOT NULL DEFAULT 0,
  coverage_score numeric NOT NULL DEFAULT 0,
  trust_score numeric NOT NULL DEFAULT 0,
  region_tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, pub_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_searchdocs_norm ON public.search_documents(normalized_name);
CREATE INDEX IF NOT EXISTS idx_searchdocs_aliases ON public.search_documents USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_searchdocs_text ON public.search_documents USING GIN(searchable_text);
CREATE INDEX IF NOT EXISTS idx_searchdocs_pub ON public.search_documents(entity_type, pub_entity_id);
CREATE INDEX IF NOT EXISTS idx_searchdocs_externals ON public.search_documents USING GIN(externals);
CREATE INDEX IF NOT EXISTS idx_searchdocs_pop ON public.search_documents(popularity_score DESC);

-- helper: refresh a single entity's search document
CREATE OR REPLACE FUNCTION public.pub_refresh_search_document(
  _entity_type text, _pub_entity_id text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _display text; _subtitle text; _norm text; _aliases text[]; _externals jsonb; _urls text[]; _coverage int; _entity_uuid uuid; _country text; _genres text[]; _region text[];
BEGIN
  IF _entity_type = 'artist' THEN
    SELECT id, name, normalized_name, aliases, country, genres
      INTO _entity_uuid, _display, _norm, _aliases, _country, _genres
      FROM public.artists WHERE pub_artist_id = _pub_entity_id;
    _subtitle := COALESCE(NULLIF(array_to_string(_genres, ', '), ''), 'Artist') ||
                 CASE WHEN _country IS NOT NULL THEN ' · ' || _country ELSE '' END;
    _region := CASE WHEN _country IS NOT NULL THEN ARRAY[_country] ELSE '{}'::text[] END;
  ELSIF _entity_type = 'track' THEN
    SELECT id, title, normalized_title, ARRAY[]::text[], NULL, primary_artist_name
      INTO _entity_uuid, _display, _norm, _aliases, _country, _subtitle
      FROM public.tracks WHERE pub_track_id = _pub_entity_id;
    _region := '{}'::text[];
  ELSIF _entity_type = 'album' THEN
    SELECT id, title, normalized_title, ARRAY[]::text[], NULL, primary_artist_name
      INTO _entity_uuid, _display, _norm, _aliases, _country, _subtitle
      FROM public.albums WHERE pub_album_id = _pub_entity_id;
    _region := '{}'::text[];
  ELSIF _entity_type = 'creator' THEN
    SELECT id, name, normalized_name, aliases, country,
           COALESCE(NULLIF(primary_role, ''), 'creator') ||
             CASE WHEN country IS NOT NULL THEN ' · ' || country ELSE '' END
      INTO _entity_uuid, _display, _norm, _aliases, _country, _subtitle
      FROM public.creators WHERE pub_creator_id = _pub_entity_id;
    _region := CASE WHEN _country IS NOT NULL THEN ARRAY[_country] ELSE '{}'::text[] END;
  ELSE
    RETURN;
  END IF;

  IF _entity_uuid IS NULL THEN RETURN; END IF;

  SELECT COALESCE(jsonb_object_agg(platform, external_id), '{}'::jsonb),
         COALESCE(array_agg(DISTINCT url) FILTER (WHERE url IS NOT NULL), '{}'::text[]),
         COUNT(DISTINCT platform)
    INTO _externals, _urls, _coverage
    FROM public.external_ids
   WHERE entity_type::text = _entity_type AND entity_id = _entity_uuid;

  INSERT INTO public.search_documents (
    entity_type, pub_entity_id, display_name, subtitle,
    normalized_name, aliases, searchable_text, externals, platform_urls,
    coverage_score, trust_score, region_tags, updated_at
  ) VALUES (
    _entity_type, _pub_entity_id, _display, _subtitle,
    COALESCE(_norm,''), COALESCE(_aliases,'{}'),
    setweight(to_tsvector('simple', COALESCE(_display,'')), 'A') ||
      setweight(to_tsvector('simple', array_to_string(COALESCE(_aliases,'{}'),' ')), 'B') ||
      setweight(to_tsvector('simple', COALESCE(_subtitle,'')), 'C'),
    COALESCE(_externals,'{}'::jsonb), COALESCE(_urls,'{}'),
    LEAST(1.0, COALESCE(_coverage,0)::numeric / 4.0),
    LEAST(1.0, COALESCE(_coverage,0)::numeric / 4.0),
    COALESCE(_region,'{}'), now()
  )
  ON CONFLICT (entity_type, pub_entity_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      subtitle = EXCLUDED.subtitle,
      normalized_name = EXCLUDED.normalized_name,
      aliases = EXCLUDED.aliases,
      searchable_text = EXCLUDED.searchable_text,
      externals = EXCLUDED.externals,
      platform_urls = EXCLUDED.platform_urls,
      coverage_score = EXCLUDED.coverage_score,
      trust_score = EXCLUDED.trust_score,
      region_tags = EXCLUDED.region_tags,
      updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.pub_rebuild_search_documents()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; r record;
BEGIN
  FOR r IN SELECT pub_artist_id AS pid FROM public.artists LOOP
    PERFORM public.pub_refresh_search_document('artist', r.pid); n := n + 1;
  END LOOP;
  FOR r IN SELECT pub_track_id AS pid FROM public.tracks LOOP
    PERFORM public.pub_refresh_search_document('track', r.pid); n := n + 1;
  END LOOP;
  FOR r IN SELECT pub_album_id AS pid FROM public.albums LOOP
    PERFORM public.pub_refresh_search_document('album', r.pid); n := n + 1;
  END LOOP;
  FOR r IN SELECT pub_creator_id AS pid FROM public.creators LOOP
    PERFORM public.pub_refresh_search_document('creator', r.pid); n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Weighted ranking RPC
CREATE OR REPLACE FUNCTION public.pub_search_rank(
  _q text,
  _type text DEFAULT NULL,
  _platform text DEFAULT NULL,
  _region text DEFAULT NULL,
  _limit int DEFAULT 20,
  _offset int DEFAULT 0
) RETURNS TABLE (
  entity_type text,
  pub_entity_id text,
  display_name text,
  subtitle text,
  matched_on text,
  confidence numeric,
  trust_score numeric,
  source_count integer,
  externals jsonb,
  platform_urls text[],
  rank numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _norm text; _ts tsquery;
BEGIN
  _norm := public.normalize_entity_name(_q);
  -- build a prefix tsquery: each token gets a `:*`
  BEGIN
    _ts := to_tsquery('simple',
      regexp_replace(trim(coalesce(_norm,'')), '\s+', ':* & ', 'g') || ':*');
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
        WHEN EXISTS (
          SELECT 1 FROM jsonb_each_text(sd.externals) kv
           WHERE kv.value = _q OR kv.value = _norm
        ) THEN 'external_exact'
        WHEN _q = ANY(sd.platform_urls) THEN 'url_exact'
        ELSE 'fuzzy'
      END AS matched_on,
      CASE
        WHEN sd.normalized_name = _norm THEN 1.0
        WHEN sd.normalized_name LIKE _norm || '%' THEN 0.85
        WHEN sd.aliases @> ARRAY[_norm] THEN 0.92
        WHEN EXISTS (
          SELECT 1 FROM jsonb_each_text(sd.externals) kv
           WHERE kv.value = _q OR kv.value = _norm
        ) THEN 0.97
        WHEN _q = ANY(sd.platform_urls) THEN 0.96
        ELSE GREATEST(0.05, ts_rank(sd.searchable_text, _ts))
      END AS conf,
      array_length(akeys(hstore(jsonb_each_text(sd.externals))), 1) AS sc
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
    round(b.conf::numeric, 3) AS confidence,
    b.trust_score,
    COALESCE(b.sc,0) AS source_count,
    b.externals, b.platform_urls,
    round(
      (b.conf * 0.55) +
      (b.popularity_score * 0.10) +
      (b.activity_score * 0.10) +
      (b.coverage_score * 0.15) +
      (b.trust_score * 0.10)
    , 4) AS rank
  FROM base b
  ORDER BY rank DESC NULLS LAST, b.popularity_score DESC NULLS LAST
  LIMIT _limit OFFSET _offset;
END $$;

-- We referenced `hstore`/`akeys` shorthand by accident — replace with a safer count.
-- Wrap it: redefine with a simpler source_count expression.
CREATE OR REPLACE FUNCTION public.pub_search_rank(
  _q text,
  _type text DEFAULT NULL,
  _platform text DEFAULT NULL,
  _region text DEFAULT NULL,
  _limit int DEFAULT 20,
  _offset int DEFAULT 0
) RETURNS TABLE (
  entity_type text,
  pub_entity_id text,
  display_name text,
  subtitle text,
  matched_on text,
  confidence numeric,
  trust_score numeric,
  source_count integer,
  externals jsonb,
  platform_urls text[],
  rank numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _norm text; _ts tsquery;
BEGIN
  _norm := public.normalize_entity_name(_q);
  BEGIN
    _ts := to_tsquery('simple',
      regexp_replace(trim(coalesce(_norm,'')), '\s+', ':* & ', 'g') || ':*');
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
      CASE
        WHEN sd.normalized_name = _norm THEN 1.0
        WHEN sd.normalized_name LIKE _norm || '%' THEN 0.85
        WHEN sd.aliases @> ARRAY[_norm] THEN 0.92
        WHEN EXISTS (SELECT 1 FROM jsonb_each_text(sd.externals) kv WHERE kv.value = _q OR kv.value = _norm) THEN 0.97
        WHEN _q = ANY(sd.platform_urls) THEN 0.96
        ELSE GREATEST(0.05, ts_rank(sd.searchable_text, _ts))
      END AS conf,
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
    round(b.conf::numeric, 3) AS confidence,
    b.trust_score,
    COALESCE(b.sc, 0) AS source_count,
    b.externals, b.platform_urls,
    round(
      (b.conf * 0.55) +
      (LEAST(1.0, b.popularity_score) * 0.10) +
      (LEAST(1.0, b.activity_score)   * 0.10) +
      (LEAST(1.0, b.coverage_score)   * 0.15) +
      (LEAST(1.0, b.trust_score)      * 0.10)
    , 4) AS rank
  FROM base b
  ORDER BY rank DESC NULLS LAST, b.popularity_score DESC NULLS LAST
  LIMIT _limit OFFSET _offset;
END $$;

-- 9. RLS policies --------------------------------------------
ALTER TABLE public.creator_relationships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_creator_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_urls          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_stats_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airplay_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_refresh_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_queries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_query_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_refresh_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_documents       ENABLE ROW LEVEL SECURITY;

-- read-only for authenticated, all canonical/metric/search tables
DO $$ BEGIN
  CREATE POLICY "auth read creator_relationships"  ON public.creator_relationships  FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth read artist_creator_links"   ON public.artist_creator_links   FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth read platform_urls"          ON public.platform_urls          FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth read entity_stats_daily"     ON public.entity_stats_daily     FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth read airplay_history"        ON public.airplay_history        FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth read entity_refresh_log"     ON public.entity_refresh_log     FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth read search_documents"       ON public.search_documents       FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- saved queries: per-user
DO $$ BEGIN
  CREATE POLICY "saved_queries owner"     ON public.saved_queries     FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sqr owner read"          ON public.saved_query_runs  FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.saved_queries q WHERE q.id = saved_query_id AND q.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- search events: anyone signed in can write their own; users can read their own
DO $$ BEGIN
  CREATE POLICY "search_events insert own" ON public.search_events FOR INSERT TO authenticated
    WITH CHECK (user_id IS NULL OR user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "search_events read own"   ON public.search_events FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR user_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- api clients/tokens: per-user
DO $$ BEGIN
  CREATE POLICY "api_clients owner"  ON public.api_clients  FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "api_refresh_tokens owner" ON public.api_refresh_tokens FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.api_clients c WHERE c.id = client_id AND c.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.api_clients c WHERE c.id = client_id AND c.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
