
-- Canonical Artists
CREATE TABLE public.canonical_artists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  name_lower text NOT NULL,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  country text,
  verified boolean NOT NULL DEFAULT false,
  spotify_artist_id text,
  apple_artist_id text,
  musicbrainz_artist_id text,
  youtube_channel_id text,
  genius_artist_id text,
  discogs_artist_id text,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_canonical_artists_name_lower ON public.canonical_artists (name_lower);
CREATE INDEX idx_canonical_artists_spotify ON public.canonical_artists (spotify_artist_id) WHERE spotify_artist_id IS NOT NULL;
CREATE INDEX idx_canonical_artists_mbid ON public.canonical_artists (musicbrainz_artist_id) WHERE musicbrainz_artist_id IS NOT NULL;

ALTER TABLE public.canonical_artists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read canonical artists" ON public.canonical_artists FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert canonical artists" ON public.canonical_artists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update canonical artists" ON public.canonical_artists FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_canonical_artists_updated
BEFORE UPDATE ON public.canonical_artists
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Canonical Works (compositions)
CREATE TABLE public.canonical_works (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  title_lower text NOT NULL,
  iswc text,
  mlc_song_code text,
  writers jsonb NOT NULL DEFAULT '[]'::jsonb,
  publishers jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_canonical_works_iswc ON public.canonical_works (iswc) WHERE iswc IS NOT NULL;
CREATE INDEX idx_canonical_works_title_lower ON public.canonical_works (title_lower);

ALTER TABLE public.canonical_works ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read canonical works" ON public.canonical_works FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert canonical works" ON public.canonical_works FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update canonical works" ON public.canonical_works FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_canonical_works_updated
BEFORE UPDATE ON public.canonical_works
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Canonical Tracks (recordings)
CREATE TABLE public.canonical_tracks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  title_lower text NOT NULL,
  primary_artist text NOT NULL,
  primary_artist_lower text NOT NULL,
  primary_artist_id uuid REFERENCES public.canonical_artists(id) ON DELETE SET NULL,
  featured_artists jsonb NOT NULL DEFAULT '[]'::jsonb,
  isrc text,
  release_date date,
  release_year int,
  duration_ms int,
  cover_url text,
  spotify_track_id text,
  apple_track_id text,
  musicbrainz_recording_id text,
  youtube_video_id text,
  genius_song_id text,
  deezer_track_id text,
  tidal_track_id text,
  work_id uuid REFERENCES public.canonical_works(id) ON DELETE SET NULL,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_canonical_tracks_isrc ON public.canonical_tracks (isrc) WHERE isrc IS NOT NULL;
CREATE INDEX idx_canonical_tracks_title_artist ON public.canonical_tracks (title_lower, primary_artist_lower);
CREATE INDEX idx_canonical_tracks_spotify ON public.canonical_tracks (spotify_track_id) WHERE spotify_track_id IS NOT NULL;

ALTER TABLE public.canonical_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read canonical tracks" ON public.canonical_tracks FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert canonical tracks" ON public.canonical_tracks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update canonical tracks" ON public.canonical_tracks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_canonical_tracks_updated
BEFORE UPDATE ON public.canonical_tracks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lookup Audit (per-user history)
CREATE TABLE public.lookup_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  query_raw text NOT NULL,
  query_normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_type text NOT NULL DEFAULT 'text',
  best_match_track_id uuid REFERENCES public.canonical_tracks(id) ON DELETE SET NULL,
  best_match jsonb,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_statuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score double precision NOT NULL DEFAULT 0,
  confidence_bucket text NOT NULL DEFAULT 'low',
  why_won jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms int,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lookup_audit_user_created ON public.lookup_audit (user_id, created_at DESC);
CREATE INDEX idx_lookup_audit_track ON public.lookup_audit (best_match_track_id) WHERE best_match_track_id IS NOT NULL;

ALTER TABLE public.lookup_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own lookup audit" ON public.lookup_audit FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own lookup audit" ON public.lookup_audit FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own lookup audit" ON public.lookup_audit FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Lookup Snapshots (track metric history)
CREATE TABLE public.lookup_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id uuid REFERENCES public.canonical_tracks(id) ON DELETE CASCADE,
  track_key text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  spotify_popularity int,
  spotify_stream_count bigint,
  youtube_view_count bigint,
  genius_pageviews bigint,
  shazam_count bigint,
  source_coverage int NOT NULL DEFAULT 0,
  confidence_score double precision NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_lookup_snapshots_track_captured ON public.lookup_snapshots (track_id, captured_at DESC);
CREATE INDEX idx_lookup_snapshots_track_key ON public.lookup_snapshots (track_key, captured_at DESC);

ALTER TABLE public.lookup_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read snapshots" ON public.lookup_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert snapshots" ON public.lookup_snapshots FOR INSERT TO authenticated WITH CHECK (true);

-- Generic source cache for lookup intelligence
CREATE TABLE public.lookup_source_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,
  cache_key text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'success',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_lookup_source_cache_key ON public.lookup_source_cache (source, cache_key);
CREATE INDEX idx_lookup_source_cache_expires ON public.lookup_source_cache (expires_at);

ALTER TABLE public.lookup_source_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read lookup cache" ON public.lookup_source_cache FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert lookup cache" ON public.lookup_source_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update lookup cache" ON public.lookup_source_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete lookup cache" ON public.lookup_source_cache FOR DELETE TO authenticated USING (true);
