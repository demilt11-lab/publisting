-- ===== Phase 3: alerts, charts/playlists history, collaborator edges, review queues =====

-- 1) Alerts feed
CREATE TABLE IF NOT EXISTS public.lookup_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  track_key text,
  track_id uuid REFERENCES public.canonical_tracks(id) ON DELETE SET NULL,
  artist_id uuid REFERENCES public.canonical_artists(id) ON DELETE SET NULL,
  contributor_id uuid REFERENCES public.contributors(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  delivered_via text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lookup_alerts_user_unread ON public.lookup_alerts(user_id, created_at DESC) WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lookup_alerts_track_key ON public.lookup_alerts(track_key);
ALTER TABLE public.lookup_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth reads alerts" ON public.lookup_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth inserts alerts" ON public.lookup_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Owner or unowned updates alert" ON public.lookup_alerts FOR UPDATE TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "Owner deletes alert" ON public.lookup_alerts FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 2) Alert rules (per user)
CREATE TABLE IF NOT EXISTS public.lookup_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  scope_ref text,
  threshold numeric,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lookup_alert_rules_user ON public.lookup_alert_rules(user_id, kind);
ALTER TABLE public.lookup_alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own rules" ON public.lookup_alert_rules FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "User inserts own rules" ON public.lookup_alert_rules FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "User updates own rules" ON public.lookup_alert_rules FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "User deletes own rules" ON public.lookup_alert_rules FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 3) Chart placements history
CREATE TABLE IF NOT EXISTS public.chart_placements_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_name text NOT NULL,
  region text NOT NULL DEFAULT 'global',
  position integer,
  previous_position integer,
  peak_position integer,
  weeks_on_chart integer,
  captured_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  track_key text NOT NULL,
  track_id uuid REFERENCES public.canonical_tracks(id) ON DELETE SET NULL,
  isrc text,
  title text NOT NULL,
  primary_artist text NOT NULL,
  source_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chart_history ON public.chart_placements_history(chart_name, region, captured_on, track_key);
CREATE INDEX IF NOT EXISTS idx_chart_history_track ON public.chart_placements_history(track_key, captured_on DESC);
ALTER TABLE public.chart_placements_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads chart history" ON public.chart_placements_history FOR SELECT USING (true);
CREATE POLICY "Auth writes chart history" ON public.chart_placements_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates chart history" ON public.chart_placements_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 4) Playlist placements history
CREATE TABLE IF NOT EXISTS public.playlist_placements_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  playlist_id text NOT NULL,
  playlist_name text NOT NULL,
  owner_name text,
  follower_count bigint,
  position integer,
  captured_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  track_key text NOT NULL,
  track_id uuid REFERENCES public.canonical_tracks(id) ON DELETE SET NULL,
  isrc text,
  source_url text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_playlist_history ON public.playlist_placements_history(platform, playlist_id, captured_on, track_key);
CREATE INDEX IF NOT EXISTS idx_playlist_history_track ON public.playlist_placements_history(track_key, captured_on DESC);
ALTER TABLE public.playlist_placements_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads playlist history" ON public.playlist_placements_history FOR SELECT USING (true);
CREATE POLICY "Auth writes playlist history" ON public.playlist_placements_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates playlist history" ON public.playlist_placements_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 5) Collaborator edges (graph)
CREATE TABLE IF NOT EXISTS public.collaborator_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_contributor_id uuid REFERENCES public.contributors(id) ON DELETE CASCADE,
  target_contributor_id uuid REFERENCES public.contributors(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  target_name text NOT NULL,
  edge_type text NOT NULL DEFAULT 'co_writer',
  track_count integer NOT NULL DEFAULT 1,
  weight numeric NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_collab_edges ON public.collaborator_edges(source_name, target_name, edge_type);
CREATE INDEX IF NOT EXISTS idx_collab_edges_source ON public.collaborator_edges(source_name);
CREATE INDEX IF NOT EXISTS idx_collab_edges_target ON public.collaborator_edges(target_name);
ALTER TABLE public.collaborator_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads collab edges" ON public.collaborator_edges FOR SELECT USING (true);
CREATE POLICY "Auth writes collab edges" ON public.collaborator_edges FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates collab edges" ON public.collaborator_edges FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 6) Review queue (analyst workflow)
CREATE TABLE IF NOT EXISTS public.review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_audit_id uuid REFERENCES public.lookup_audit(id) ON DELETE SET NULL,
  related_track_key text,
  assigned_to uuid,
  resolved_by uuid,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON public.review_queue(status, kind, severity, created_at DESC);
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth reads review queue" ON public.review_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth inserts review queue" ON public.review_queue FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates review queue" ON public.review_queue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 7) Entity merge proposals
CREATE TABLE IF NOT EXISTS public.entity_merge_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  source_id uuid NOT NULL,
  target_id uuid NOT NULL,
  source_name text,
  target_name text,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  proposed_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merge_status ON public.entity_merge_proposals(status, entity_type, created_at DESC);
ALTER TABLE public.entity_merge_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth reads merge proposals" ON public.entity_merge_proposals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth inserts merge proposals" ON public.entity_merge_proposals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth updates merge proposals" ON public.entity_merge_proposals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- updated_at triggers
CREATE TRIGGER trg_lookup_alert_rules_updated BEFORE UPDATE ON public.lookup_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_review_queue_updated BEFORE UPDATE ON public.review_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();