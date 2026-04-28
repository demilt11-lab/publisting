-- Phase 1 + 2 schema additions for catalog analysis integrations

-- 1) Per-user Spotify credentials (mirrors mlc_credentials pattern)
CREATE TABLE IF NOT EXISTS public.spotify_credentials (
  user_id uuid PRIMARY KEY,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  auto_lookup_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.spotify_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own Spotify creds"   ON public.spotify_credentials FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own Spotify creds" ON public.spotify_credentials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own Spotify creds" ON public.spotify_credentials FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own Spotify creds" ON public.spotify_credentials FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_spotify_credentials_updated_at
BEFORE UPDATE ON public.spotify_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Extend verified_splits with cross-source identifiers
ALTER TABLE public.verified_splits
  ADD COLUMN IF NOT EXISTS spotify_track_id text,
  ADD COLUMN IF NOT EXISTS youtube_canonical_video_id text,
  ADD COLUMN IF NOT EXISTS bmi_work_id text,
  ADD COLUMN IF NOT EXISTS ascap_work_id text,
  ADD COLUMN IF NOT EXISTS cross_check_results jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Song matches table — links a catalog song row to an external source identity
CREATE TABLE IF NOT EXISTS public.song_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  song_title text NOT NULL,
  song_artist text,
  catalog_song_key text,           -- caller-supplied stable key for the catalog row
  source text NOT NULL,            -- 'spotify' | 'youtube' | 'mlc' | 'bmi' | 'ascap'
  external_id text NOT NULL,       -- track id / video id / work id
  confidence double precision NOT NULL DEFAULT 0,
  match_type text NOT NULL,        -- 'isrc' | 'iswc' | 'ipi_title' | 'fuzzy_title_writer' | 'manual'
  matched_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS song_matches_user_song_idx
  ON public.song_matches (user_id, song_title, song_artist);
CREATE INDEX IF NOT EXISTS song_matches_user_source_idx
  ON public.song_matches (user_id, source);

ALTER TABLE public.song_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own song matches"   ON public.song_matches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own song matches" ON public.song_matches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own song matches" ON public.song_matches FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own song matches" ON public.song_matches FOR DELETE TO authenticated USING (auth.uid() = user_id);
