CREATE TABLE public.soundcharts_song_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  song_title text NOT NULL,
  song_artist text,
  isrc text,
  soundcharts_song_uuid text,
  spotify_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  playlists jsonb NOT NULL DEFAULT '[]'::jsonb,
  charts jsonb NOT NULL DEFAULT '[]'::jsonb,
  airplay jsonb NOT NULL DEFAULT '{}'::jsonb,
  playlist_count integer NOT NULL DEFAULT 0,
  chart_count integer NOT NULL DEFAULT 0,
  airplay_spins integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.soundcharts_song_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own soundcharts song data" ON public.soundcharts_song_data
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own soundcharts song data" ON public.soundcharts_song_data
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own soundcharts song data" ON public.soundcharts_song_data
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete own soundcharts song data" ON public.soundcharts_song_data
FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_soundcharts_song_data_user_song
  ON public.soundcharts_song_data(user_id, lower(song_title), lower(coalesce(song_artist, '')));
CREATE INDEX idx_soundcharts_song_data_isrc
  ON public.soundcharts_song_data(user_id, isrc) WHERE isrc IS NOT NULL;

CREATE TRIGGER update_soundcharts_song_data_updated_at
BEFORE UPDATE ON public.soundcharts_song_data
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();