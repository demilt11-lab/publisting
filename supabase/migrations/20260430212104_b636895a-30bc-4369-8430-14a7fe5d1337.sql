
-- ============ CONTRIBUTORS ============
CREATE TABLE IF NOT EXISTS public.contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_lower text NOT NULL,
  primary_role text,
  ipi text,
  isni text,
  pro text,
  musicbrainz_artist_id text,
  spotify_artist_id text,
  apple_artist_id text,
  genius_artist_id text,
  discogs_artist_id text,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contributors_name_lower ON public.contributors(name_lower);
CREATE INDEX IF NOT EXISTS idx_contributors_ipi ON public.contributors(ipi);
ALTER TABLE public.contributors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads contributors" ON public.contributors FOR SELECT USING (true);
CREATE POLICY "Auth inserts contributors" ON public.contributors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates contributors" ON public.contributors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_contributors_upd BEFORE UPDATE ON public.contributors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PUBLISHERS ============
CREATE TABLE IF NOT EXISTS public.publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_lower text NOT NULL,
  parent_publisher_id uuid REFERENCES public.publishers(id) ON DELETE SET NULL,
  admin_publisher_id uuid REFERENCES public.publishers(id) ON DELETE SET NULL,
  ipi text,
  pro text,
  classification text,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_publishers_name_lower ON public.publishers(name_lower);
ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads publishers" ON public.publishers FOR SELECT USING (true);
CREATE POLICY "Auth inserts publishers" ON public.publishers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates publishers" ON public.publishers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_publishers_upd BEFORE UPDATE ON public.publishers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ LABELS ============
CREATE TABLE IF NOT EXISTS public.labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_lower text NOT NULL,
  parent_label_id uuid REFERENCES public.labels(id) ON DELETE SET NULL,
  classification text,
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_labels_name_lower ON public.labels(name_lower);
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads labels" ON public.labels FOR SELECT USING (true);
CREATE POLICY "Auth inserts labels" ON public.labels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates labels" ON public.labels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_labels_upd BEFORE UPDATE ON public.labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TRACK ALIASES ============
CREATE TABLE IF NOT EXISTS public.track_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid REFERENCES public.canonical_tracks(id) ON DELETE CASCADE,
  alias_title text NOT NULL,
  alias_title_lower text NOT NULL,
  alias_type text NOT NULL DEFAULT 'aka',
  source text DEFAULT 'manual',
  confidence double precision DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_track_aliases_lower ON public.track_aliases(alias_title_lower);
CREATE INDEX IF NOT EXISTS idx_track_aliases_track ON public.track_aliases(track_id);
ALTER TABLE public.track_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads track_aliases" ON public.track_aliases FOR SELECT USING (true);
CREATE POLICY "Auth inserts track_aliases" ON public.track_aliases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth deletes track_aliases" ON public.track_aliases FOR DELETE TO authenticated USING (true);

-- ============ ENTITY LINKS (graph edges) ============
CREATE TABLE IF NOT EXISTS public.entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type text NOT NULL,
  from_id uuid NOT NULL,
  to_type text NOT NULL,
  to_id uuid NOT NULL,
  relation text NOT NULL,
  confidence double precision NOT NULL DEFAULT 0.5,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_type, from_id, to_type, to_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_entity_links_from ON public.entity_links(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_to ON public.entity_links(to_type, to_id);
ALTER TABLE public.entity_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads entity_links" ON public.entity_links FOR SELECT USING (true);
CREATE POLICY "Auth inserts entity_links" ON public.entity_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth deletes entity_links" ON public.entity_links FOR DELETE TO authenticated USING (true);

-- ============ SOURCE RECORDS (raw per-source store) ============
CREATE TABLE IF NOT EXISTS public.source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  source text NOT NULL,
  source_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'success'
);
CREATE INDEX IF NOT EXISTS idx_source_records_entity ON public.source_records(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_source_records_source ON public.source_records(source);
ALTER TABLE public.source_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads source_records" ON public.source_records FOR SELECT USING (true);
CREATE POLICY "Auth inserts source_records" ON public.source_records FOR INSERT TO authenticated WITH CHECK (true);

-- ============ SOURCE HEALTH ============
CREATE TABLE IF NOT EXISTS public.source_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  success_count integer NOT NULL DEFAULT 0,
  partial_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  no_data_count integer NOT NULL DEFAULT 0,
  cache_hits integer NOT NULL DEFAULT 0,
  total_latency_ms bigint NOT NULL DEFAULT 0,
  last_error text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, date)
);
CREATE INDEX IF NOT EXISTS idx_source_health_source ON public.source_health(source, date DESC);
ALTER TABLE public.source_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads source_health" ON public.source_health FOR SELECT USING (true);
CREATE POLICY "Auth inserts source_health" ON public.source_health FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates source_health" ON public.source_health FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============ MANUAL MATCH OVERRIDES ============
CREATE TABLE IF NOT EXISTS public.manual_match_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  query_normalized text NOT NULL,
  pinned_track_id uuid REFERENCES public.canonical_tracks(id) ON DELETE CASCADE,
  pinned_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  is_global boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_overrides_query ON public.manual_match_overrides(query_normalized);
CREATE INDEX IF NOT EXISTS idx_overrides_user ON public.manual_match_overrides(user_id);
ALTER TABLE public.manual_match_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own or global overrides" ON public.manual_match_overrides FOR SELECT
  TO authenticated USING (is_global OR auth.uid() = user_id);
CREATE POLICY "Insert own overrides" ON public.manual_match_overrides FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own overrides" ON public.manual_match_overrides FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Delete own overrides" ON public.manual_match_overrides FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_overrides_upd BEFORE UPDATE ON public.manual_match_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TRACKED TRACKS for scheduled snapshots ============
CREATE TABLE IF NOT EXISTS public.lookup_tracked_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid REFERENCES public.canonical_tracks(id) ON DELETE CASCADE,
  track_key text NOT NULL,
  title text NOT NULL,
  artist text NOT NULL,
  added_by uuid,
  active boolean NOT NULL DEFAULT true,
  last_snapshot_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track_key)
);
CREATE INDEX IF NOT EXISTS idx_tracked_active ON public.lookup_tracked_tracks(active, last_snapshot_at);
ALTER TABLE public.lookup_tracked_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads tracked tracks" ON public.lookup_tracked_tracks FOR SELECT USING (true);
CREATE POLICY "Auth inserts tracked tracks" ON public.lookup_tracked_tracks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates tracked tracks" ON public.lookup_tracked_tracks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth deletes tracked tracks" ON public.lookup_tracked_tracks FOR DELETE TO authenticated USING (true);
