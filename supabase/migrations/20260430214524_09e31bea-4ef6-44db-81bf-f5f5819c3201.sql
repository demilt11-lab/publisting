-- Tracked editorial playlists for daily polling
CREATE TABLE IF NOT EXISTS public.tracked_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'spotify',
  playlist_id text NOT NULL,
  playlist_name text NOT NULL,
  owner_name text,
  region text NOT NULL DEFAULT 'global',
  enabled boolean NOT NULL DEFAULT true,
  last_polled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, playlist_id)
);

ALTER TABLE public.tracked_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth reads tracked playlists" ON public.tracked_playlists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth writes tracked playlists" ON public.tracked_playlists
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates tracked playlists" ON public.tracked_playlists
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth deletes tracked playlists" ON public.tracked_playlists
  FOR DELETE TO authenticated USING (true);

-- Seed a few well-known Spotify editorial playlists (Today's Top Hits, RapCaviar, Pop Rising, Hot Country, Viva Latino)
INSERT INTO public.tracked_playlists (platform, playlist_id, playlist_name, owner_name, region) VALUES
  ('spotify', '37i9dQZF1DXcBWIGoYBM5M', 'Today''s Top Hits', 'Spotify', 'global'),
  ('spotify', '37i9dQZF1DX0XUsuxWHRQd', 'RapCaviar', 'Spotify', 'us'),
  ('spotify', '37i9dQZF1DWUa8ZRTfalHk', 'Pop Rising', 'Spotify', 'us'),
  ('spotify', '37i9dQZF1DX1lVhptIYRda', 'Hot Country', 'Spotify', 'us'),
  ('spotify', '37i9dQZF1DX10zKzsJ2jva', 'Viva Latino', 'Spotify', 'global')
ON CONFLICT (platform, playlist_id) DO NOTHING;