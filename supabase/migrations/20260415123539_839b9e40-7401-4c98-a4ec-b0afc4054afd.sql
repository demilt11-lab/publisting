
-- People table for normalized artist/writer/producer records
CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_lower text NOT NULL GENERATED ALWAYS AS (lower(trim(name))) STORED,
  role text CHECK (role IN ('artist', 'writer', 'producer', 'mixed')),
  mbid text,
  spotify_id text,
  apple_music_id text,
  youtube_channel_id text,
  tidal_id text,
  amazon_music_id text,
  deezer_id text,
  soundcloud_url text,
  instagram_url text,
  tiktok_url text,
  twitter_url text,
  facebook_url text,
  website_url text,
  last_enriched_at timestamptz,
  enrichment_version int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- People links for overflow/additional platform links with confidence
CREATE TABLE public.people_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text NOT NULL,
  confidence float DEFAULT 1.0,
  source text NOT NULL CHECK (source IN ('musicbrainz', 'odesli', 'spotify_api', 'manual', 'genius', 'discogs')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(person_id, platform, source)
);

-- Indexes
CREATE INDEX idx_people_name_lower ON public.people(name_lower);
CREATE INDEX idx_people_mbid ON public.people(mbid);
CREATE INDEX idx_people_links_person ON public.people_links(person_id);

-- Unique constraint to prevent duplicate people
CREATE UNIQUE INDEX idx_people_name_role ON public.people(name_lower, role);

-- Auto-update updated_at trigger
CREATE TRIGGER update_people_updated_at
  BEFORE UPDATE ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for people
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read people"
  ON public.people FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert people"
  ON public.people FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update people"
  ON public.people FOR UPDATE TO authenticated
  USING (true);

-- RLS for people_links
ALTER TABLE public.people_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read people_links"
  ON public.people_links FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert people_links"
  ON public.people_links FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update people_links"
  ON public.people_links FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete people_links"
  ON public.people_links FOR DELETE TO authenticated
  USING (true);
