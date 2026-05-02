-- ============================================================
-- PHASE 6 STEP 1: Canonical Entity Resolution Layer
-- ============================================================

-- Helper: short prefixed ID generator (pub_<prefix>_<base36 random>)
CREATE OR REPLACE FUNCTION public.gen_pub_id(prefix text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  bytes bytea;
  out_id text := '';
  i int;
  v int;
  alphabet text := '0123456789abcdefghijklmnopqrstuvwxyz';
BEGIN
  bytes := gen_random_bytes(8);
  FOR i IN 0..7 LOOP
    v := get_byte(bytes, i);
    out_id := out_id || substr(alphabet, (v % 36) + 1, 1);
  END LOOP;
  RETURN 'pub_' || prefix || '_' || out_id;
END;
$$;

-- Normalization helper for search/dedup
CREATE OR REPLACE FUNCTION public.normalize_entity_name(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(coalesce(s,''), '[^a-z0-9]+', ' ', 'gi'))
$$;

-- ------------------------------------------------------------
-- artists
-- ------------------------------------------------------------
CREATE TABLE public.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_artist_id text NOT NULL UNIQUE DEFAULT public.gen_pub_id('art'),
  name text NOT NULL,
  normalized_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  country text,
  image_url text,
  primary_genre text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_doc tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_artists_normalized ON public.artists (normalized_name);
CREATE INDEX idx_artists_aliases ON public.artists USING GIN (aliases);
CREATE INDEX idx_artists_search_doc ON public.artists USING GIN (search_doc);

CREATE OR REPLACE FUNCTION public.artists_search_doc_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.normalized_name := public.normalize_entity_name(NEW.name);
  NEW.search_doc :=
    setweight(to_tsvector('simple', coalesce(NEW.name,'')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(NEW.aliases,'{}'::text[]), ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.country,'')), 'D');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_artists_search_doc
BEFORE INSERT OR UPDATE ON public.artists
FOR EACH ROW EXECUTE FUNCTION public.artists_search_doc_trigger();

-- ------------------------------------------------------------
-- albums
-- ------------------------------------------------------------
CREATE TABLE public.albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_album_id text NOT NULL UNIQUE DEFAULT public.gen_pub_id('alb'),
  title text NOT NULL,
  normalized_title text NOT NULL,
  primary_artist_id uuid REFERENCES public.artists(id) ON DELETE SET NULL,
  primary_artist_name text,
  upc text,
  release_date date,
  cover_url text,
  label text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_doc tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_albums_normalized ON public.albums (normalized_title);
CREATE INDEX idx_albums_upc ON public.albums (upc);
CREATE INDEX idx_albums_search_doc ON public.albums USING GIN (search_doc);

CREATE OR REPLACE FUNCTION public.albums_search_doc_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.normalized_title := public.normalize_entity_name(NEW.title);
  NEW.search_doc :=
    setweight(to_tsvector('simple', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.primary_artist_name,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.upc,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.label,'')), 'D');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_albums_search_doc
BEFORE INSERT OR UPDATE ON public.albums
FOR EACH ROW EXECUTE FUNCTION public.albums_search_doc_trigger();

-- ------------------------------------------------------------
-- tracks
-- ------------------------------------------------------------
CREATE TABLE public.tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_track_id text NOT NULL UNIQUE DEFAULT public.gen_pub_id('trk'),
  title text NOT NULL,
  normalized_title text NOT NULL,
  primary_artist_id uuid REFERENCES public.artists(id) ON DELETE SET NULL,
  primary_artist_name text,
  isrc text,
  duration_ms integer,
  release_date date,
  album_id uuid REFERENCES public.albums(id) ON DELETE SET NULL,
  cover_url text,
  language text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_doc tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracks_normalized ON public.tracks (normalized_title);
CREATE INDEX idx_tracks_isrc ON public.tracks (isrc);
CREATE INDEX idx_tracks_artist ON public.tracks (primary_artist_id);
CREATE INDEX idx_tracks_search_doc ON public.tracks USING GIN (search_doc);

CREATE OR REPLACE FUNCTION public.tracks_search_doc_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.normalized_title := public.normalize_entity_name(NEW.title);
  NEW.search_doc :=
    setweight(to_tsvector('simple', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.primary_artist_name,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.isrc,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.language,'')), 'D');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_tracks_search_doc
BEFORE INSERT OR UPDATE ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.tracks_search_doc_trigger();

-- ------------------------------------------------------------
-- external_ids: maps any canonical entity to platform identifiers
-- ------------------------------------------------------------
CREATE TYPE public.entity_type AS ENUM ('artist', 'track', 'album');

CREATE TABLE public.external_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type public.entity_type NOT NULL,
  entity_id uuid NOT NULL,
  platform text NOT NULL, -- spotify, apple, deezer, isrc, upc, musicbrainz, genius, youtube, soundcloud, tidal, amazon
  external_id text NOT NULL,
  url text,
  confidence numeric(3,2) NOT NULL DEFAULT 1.0,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, platform, external_id)
);
CREATE INDEX idx_external_ids_entity ON public.external_ids (entity_type, entity_id);
CREATE INDEX idx_external_ids_lookup ON public.external_ids (platform, external_id);

-- ------------------------------------------------------------
-- field_provenance: which source confirmed which field
-- ------------------------------------------------------------
CREATE TABLE public.field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type public.entity_type NOT NULL,
  entity_id uuid NOT NULL,
  field_name text NOT NULL,
  field_value text,
  source text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 1.0,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field_name, source)
);
CREATE INDEX idx_field_prov_entity ON public.field_provenance (entity_type, entity_id);

-- ------------------------------------------------------------
-- chart_history (time series)
-- ------------------------------------------------------------
CREATE TABLE public.chart_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type public.entity_type NOT NULL,
  entity_id uuid NOT NULL,
  platform text NOT NULL,         -- spotify, apple, billboard, shazam
  chart_type text NOT NULL,       -- top50, hot100, viral50, etc
  country text,
  rank integer NOT NULL,
  date date NOT NULL,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, platform, chart_type, country, date)
);
CREATE INDEX idx_chart_history_entity_date ON public.chart_history (entity_type, entity_id, date DESC);
CREATE INDEX idx_chart_history_chart ON public.chart_history (platform, chart_type, date DESC);

-- ------------------------------------------------------------
-- playlist_history (time series)
-- ------------------------------------------------------------
CREATE TABLE public.playlist_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type public.entity_type NOT NULL,
  entity_id uuid NOT NULL,
  platform text NOT NULL,
  playlist_id text NOT NULL,
  playlist_name text,
  position integer,
  followers bigint,
  date date NOT NULL,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, platform, playlist_id, date)
);
CREATE INDEX idx_playlist_history_entity_date ON public.playlist_history (entity_type, entity_id, date DESC);
CREATE INDEX idx_playlist_history_playlist ON public.playlist_history (platform, playlist_id, date DESC);

-- ============================================================
-- RLS: shared knowledge graph
-- - All signed-in users can READ canonical data
-- - Writes are restricted to the service role (edge functions)
-- ============================================================
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read artists" ON public.artists FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read albums" ON public.albums FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read tracks" ON public.tracks FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read external_ids" ON public.external_ids FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read field_provenance" ON public.field_provenance FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read chart_history" ON public.chart_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read playlist_history" ON public.playlist_history FOR SELECT TO authenticated USING (true);
-- (No INSERT/UPDATE/DELETE policies => only service_role bypass can write.)

-- ============================================================
-- Additive anchoring columns on existing user tables
-- (nullable, no backfill, no behavior change for existing reads)
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='watchlist_items') THEN
    ALTER TABLE public.watchlist_items ADD COLUMN IF NOT EXISTS pub_track_id text;
    ALTER TABLE public.watchlist_items ADD COLUMN IF NOT EXISTS pub_artist_id text;
    CREATE INDEX IF NOT EXISTS idx_watchlist_items_pub_track ON public.watchlist_items (pub_track_id);
    CREATE INDEX IF NOT EXISTS idx_watchlist_items_pub_artist ON public.watchlist_items (pub_artist_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='outreach_records') THEN
    ALTER TABLE public.outreach_records ADD COLUMN IF NOT EXISTS pub_track_id text;
    ALTER TABLE public.outreach_records ADD COLUMN IF NOT EXISTS pub_artist_id text;
    CREATE INDEX IF NOT EXISTS idx_outreach_records_pub_track ON public.outreach_records (pub_track_id);
    CREATE INDEX IF NOT EXISTS idx_outreach_records_pub_artist ON public.outreach_records (pub_artist_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='outreach_dismissals') THEN
    ALTER TABLE public.outreach_dismissals ADD COLUMN IF NOT EXISTS pub_track_id text;
    ALTER TABLE public.outreach_dismissals ADD COLUMN IF NOT EXISTS pub_artist_id text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='favorites') THEN
    ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS pub_track_id text;
    ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS pub_artist_id text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='search_history') THEN
    ALTER TABLE public.search_history ADD COLUMN IF NOT EXISTS pub_track_id text;
    ALTER TABLE public.search_history ADD COLUMN IF NOT EXISTS pub_artist_id text;
  END IF;
END $$;