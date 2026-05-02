-- ============================================================
-- Phase 8: Governance, canonical expansion, external API layer
-- ============================================================

-- 1) ROLES (admin gate replacement) ----------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

DROP POLICY IF EXISTS "Self can read own roles" ON public.user_roles;
CREATE POLICY "Self can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2) AUDIT LOG ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gov_audit_action ON public.governance_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_audit_target ON public.governance_audit_log(target_type, target_id, created_at DESC);
ALTER TABLE public.governance_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin reads audit" ON public.governance_audit_log;
CREATE POLICY "Admin reads audit" ON public.governance_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
DROP POLICY IF EXISTS "Service inserts audit" ON public.governance_audit_log;
CREATE POLICY "Service inserts audit" ON public.governance_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.gov_audit(
  _action text, _target_type text, _target_id text,
  _before jsonb DEFAULT NULL, _after jsonb DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.governance_audit_log(actor_user_id, action, target_type, target_id, before_state, after_state, metadata)
  VALUES (auth.uid(), _action, _target_type, _target_id, _before, _after, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- 3) ENTITY REDIRECTS, MERGE & SPLIT ACTIONS ------------------
CREATE TABLE IF NOT EXISTS public.entity_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  old_pub_id text NOT NULL,
  new_pub_id text NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, old_pub_id)
);
CREATE INDEX IF NOT EXISTS idx_redirects_new ON public.entity_redirects(entity_type, new_pub_id);
ALTER TABLE public.entity_redirects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth reads redirects" ON public.entity_redirects;
CREATE POLICY "Auth reads redirects" ON public.entity_redirects
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin writes redirects" ON public.entity_redirects;
CREATE POLICY "Admin writes redirects" ON public.entity_redirects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.entity_merge_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  source_pub_id text NOT NULL,
  target_pub_id text NOT NULL,
  reason text,
  reassigned jsonb NOT NULL DEFAULT '{}'::jsonb,
  reversible boolean NOT NULL DEFAULT true,
  reversed_at timestamptz,
  reversed_by uuid,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merge_actions_target ON public.entity_merge_actions(entity_type, target_pub_id, created_at DESC);
ALTER TABLE public.entity_merge_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin reads merges" ON public.entity_merge_actions;
CREATE POLICY "Admin reads merges" ON public.entity_merge_actions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
DROP POLICY IF EXISTS "Admin writes merges" ON public.entity_merge_actions;
CREATE POLICY "Admin writes merges" ON public.entity_merge_actions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.entity_split_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  original_pub_id text NOT NULL,
  new_pub_id text NOT NULL,
  reason text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entity_split_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin rw splits" ON public.entity_split_actions;
CREATE POLICY "Admin rw splits" ON public.entity_split_actions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Merge RPC: reassigns external_ids, track_credits, entity_notes, pub_alert_subscriptions,
-- watchlist_entries (creators), outreach_records (artists/tracks)
CREATE OR REPLACE FUNCTION public.pub_merge_entities(
  _entity_type text, _source_pub_id text, _target_pub_id text, _reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _src_uuid uuid; _tgt_uuid uuid;
  _moved jsonb := '{}'::jsonb;
  _n int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  IF _source_pub_id = _target_pub_id THEN
    RAISE EXCEPTION 'source and target are identical';
  END IF;

  -- Resolve uuids per entity type
  IF _entity_type = 'artist' THEN
    SELECT id INTO _src_uuid FROM public.artists WHERE pub_artist_id = _source_pub_id;
    SELECT id INTO _tgt_uuid FROM public.artists WHERE pub_artist_id = _target_pub_id;
  ELSIF _entity_type = 'track' THEN
    SELECT id INTO _src_uuid FROM public.tracks WHERE pub_track_id = _source_pub_id;
    SELECT id INTO _tgt_uuid FROM public.tracks WHERE pub_track_id = _target_pub_id;
  ELSIF _entity_type = 'album' THEN
    SELECT id INTO _src_uuid FROM public.albums WHERE pub_album_id = _source_pub_id;
    SELECT id INTO _tgt_uuid FROM public.albums WHERE pub_album_id = _target_pub_id;
  ELSIF _entity_type = 'creator' THEN
    SELECT id INTO _src_uuid FROM public.creators WHERE pub_creator_id = _source_pub_id;
    SELECT id INTO _tgt_uuid FROM public.creators WHERE pub_creator_id = _target_pub_id;
  END IF;
  IF _src_uuid IS NULL OR _tgt_uuid IS NULL THEN
    RAISE EXCEPTION 'unknown source or target entity';
  END IF;

  -- external_ids: move all on conflict ignore
  UPDATE public.external_ids SET entity_id = _tgt_uuid
   WHERE entity_type::text = _entity_type AND entity_id = _src_uuid
     AND NOT EXISTS (
       SELECT 1 FROM public.external_ids x2
        WHERE x2.entity_type = public.external_ids.entity_type
          AND x2.entity_id = _tgt_uuid
          AND x2.platform = public.external_ids.platform
          AND x2.external_id = public.external_ids.external_id
     );
  GET DIAGNOSTICS _n = ROW_COUNT;
  _moved := jsonb_set(_moved, '{external_ids}', to_jsonb(_n));
  DELETE FROM public.external_ids WHERE entity_type::text = _entity_type AND entity_id = _src_uuid;

  -- entity_notes
  UPDATE public.entity_notes SET pub_id = _target_pub_id
   WHERE entity_type = _entity_type AND pub_id = _source_pub_id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  _moved := jsonb_set(_moved, '{notes}', to_jsonb(_n));

  -- subscriptions
  UPDATE public.pub_alert_subscriptions SET entity_id = _tgt_uuid, pub_id = _target_pub_id
   WHERE entity_type = _entity_type AND entity_id = _src_uuid;
  GET DIAGNOSTICS _n = ROW_COUNT;
  _moved := jsonb_set(_moved, '{subscriptions}', to_jsonb(_n));

  -- track_credits
  IF _entity_type = 'track' THEN
    UPDATE public.track_credits SET track_id = _tgt_uuid, pub_track_id = _target_pub_id WHERE track_id = _src_uuid;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _moved := jsonb_set(_moved, '{credits}', to_jsonb(_n));
  ELSIF _entity_type = 'creator' THEN
    UPDATE public.track_credits SET creator_id = _tgt_uuid, pub_creator_id = _target_pub_id WHERE creator_id = _src_uuid;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _moved := jsonb_set(_moved, '{credits}', to_jsonb(_n));

    -- watchlist_entries map by pub_creator_id
    UPDATE public.watchlist_entries SET pub_creator_id = _target_pub_id
      WHERE pub_creator_id = _source_pub_id;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _moved := jsonb_set(_moved, '{watchlist}', to_jsonb(_n));
  END IF;

  -- outreach references
  IF _entity_type = 'artist' THEN
    UPDATE public.outreach_records SET pub_artist_id = _target_pub_id WHERE pub_artist_id = _source_pub_id;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _moved := jsonb_set(_moved, '{outreach}', to_jsonb(_n));
  ELSIF _entity_type = 'track' THEN
    UPDATE public.outreach_records SET pub_track_id = _target_pub_id WHERE pub_track_id = _source_pub_id;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _moved := jsonb_set(_moved, '{outreach}', to_jsonb(_n));
  END IF;

  -- search_documents: drop source, refresh target
  DELETE FROM public.search_documents WHERE entity_type = _entity_type AND pub_entity_id = _source_pub_id;
  PERFORM public.pub_refresh_search_document(_entity_type, _target_pub_id);

  -- Delete the source entity row
  IF _entity_type = 'artist' THEN DELETE FROM public.artists WHERE id = _src_uuid;
  ELSIF _entity_type = 'track' THEN DELETE FROM public.tracks WHERE id = _src_uuid;
  ELSIF _entity_type = 'album' THEN DELETE FROM public.albums WHERE id = _src_uuid;
  ELSIF _entity_type = 'creator' THEN DELETE FROM public.creators WHERE id = _src_uuid;
  END IF;

  -- Redirect + audit
  INSERT INTO public.entity_redirects(entity_type, old_pub_id, new_pub_id, reason, created_by)
  VALUES (_entity_type, _source_pub_id, _target_pub_id, _reason, auth.uid())
  ON CONFLICT (entity_type, old_pub_id) DO UPDATE SET new_pub_id = EXCLUDED.new_pub_id;

  INSERT INTO public.entity_merge_actions(entity_type, source_pub_id, target_pub_id, reason, reassigned, performed_by)
  VALUES (_entity_type, _source_pub_id, _target_pub_id, _reason, _moved, auth.uid());

  PERFORM public.gov_audit('entity_merge', _entity_type, _target_pub_id,
    jsonb_build_object('source', _source_pub_id),
    jsonb_build_object('target', _target_pub_id, 'moved', _moved),
    jsonb_build_object('reason', _reason));

  RETURN _moved;
END $$;

-- Split: undo a merge by restoring rows referenced by the redirect.
-- Lightweight v1: drop the redirect, log the split, leave manual reassignment to operator.
CREATE OR REPLACE FUNCTION public.pub_split_entity(
  _entity_type text, _old_pub_id text, _reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _redir record; _moved jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  SELECT * INTO _redir FROM public.entity_redirects
    WHERE entity_type = _entity_type AND old_pub_id = _old_pub_id;
  IF _redir IS NULL THEN
    RAISE EXCEPTION 'no redirect to reverse';
  END IF;

  -- mark merge_action reversed if exists
  UPDATE public.entity_merge_actions SET reversed_at = now(), reversed_by = auth.uid()
   WHERE entity_type = _entity_type AND source_pub_id = _old_pub_id AND target_pub_id = _redir.new_pub_id
     AND reversed_at IS NULL;

  DELETE FROM public.entity_redirects WHERE id = _redir.id;
  INSERT INTO public.entity_split_actions(entity_type, original_pub_id, new_pub_id, reason, performed_by)
  VALUES (_entity_type, _redir.new_pub_id, _old_pub_id, _reason, auth.uid());

  PERFORM public.gov_audit('entity_split', _entity_type, _old_pub_id,
    jsonb_build_object('was_merged_into', _redir.new_pub_id), NULL,
    jsonb_build_object('reason', _reason));
  RETURN jsonb_build_object('split', true, 'restored_pub_id', _old_pub_id);
END $$;

-- 4) RELEVANCE LABELS ----------------------------------------
CREATE TABLE IF NOT EXISTS public.search_relevance_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  query_normalized text,
  entity_type text,
  pub_entity_id text,
  expected_pub_entity_id text,
  label text NOT NULL CHECK (label IN ('correct','incorrect','duplicate','weak','missing')),
  notes text,
  rank_position int,
  score_breakdown jsonb,
  labeled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_relevance_query ON public.search_relevance_labels(query_normalized, label);
CREATE INDEX IF NOT EXISTS idx_relevance_entity ON public.search_relevance_labels(entity_type, pub_entity_id);
ALTER TABLE public.search_relevance_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth reads labels" ON public.search_relevance_labels;
CREATE POLICY "Auth reads labels" ON public.search_relevance_labels
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth writes own labels" ON public.search_relevance_labels;
CREATE POLICY "Auth writes own labels" ON public.search_relevance_labels
  FOR INSERT TO authenticated WITH CHECK (labeled_by = auth.uid());
DROP POLICY IF EXISTS "Author/admin update labels" ON public.search_relevance_labels;
CREATE POLICY "Author/admin update labels" ON public.search_relevance_labels
  FOR UPDATE TO authenticated
  USING (labeled_by = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (labeled_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Author/admin delete labels" ON public.search_relevance_labels;
CREATE POLICY "Author/admin delete labels" ON public.search_relevance_labels
  FOR DELETE TO authenticated
  USING (labeled_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- 5) BULK ACTION RUNS -----------------------------------------
CREATE TABLE IF NOT EXISTS public.bulk_action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  target_count int NOT NULL DEFAULT 0,
  succeeded int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bulk_runs_actor ON public.bulk_action_runs(actor_user_id, created_at DESC);
ALTER TABLE public.bulk_action_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Self read bulk runs" ON public.bulk_action_runs;
CREATE POLICY "Self read bulk runs" ON public.bulk_action_runs
  FOR SELECT TO authenticated USING (actor_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Auth insert bulk runs" ON public.bulk_action_runs;
CREATE POLICY "Auth insert bulk runs" ON public.bulk_action_runs
  FOR INSERT TO authenticated WITH CHECK (actor_user_id = auth.uid());

-- 6) CHANGE SUMMARIES -----------------------------------------
CREATE TABLE IF NOT EXISTS public.change_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL,           -- 'alert' | 'saved_query_diff' | 'refresh'
  source_id text,                       -- referenced row id
  entity_type text,
  pub_entity_id text,
  field text,
  old_value jsonb,
  new_value jsonb,
  provider text,
  confidence numeric,
  importance numeric,                  -- 0..1
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_change_entity ON public.change_summaries(entity_type, pub_entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_source ON public.change_summaries(source_kind, source_id);
ALTER TABLE public.change_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth reads change_summaries" ON public.change_summaries;
CREATE POLICY "Auth reads change_summaries" ON public.change_summaries
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth writes change_summaries" ON public.change_summaries;
CREATE POLICY "Auth writes change_summaries" ON public.change_summaries
  FOR INSERT TO authenticated WITH CHECK (true);

-- 7) API CONSUMER LAYER ---------------------------------------
ALTER TABLE public.api_clients
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS quota_per_day int NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS api_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.api_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.api_clients(id) ON DELETE SET NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code int,
  latency_ms int,
  user_agent text,
  ip text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_log_client ON public.api_request_log(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_log_path ON public.api_request_log(path, created_at DESC);
ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner reads api logs" ON public.api_request_log;
CREATE POLICY "Owner reads api logs" ON public.api_request_log
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR
    EXISTS(SELECT 1 FROM public.api_clients c WHERE c.id = api_request_log.client_id AND c.user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.api_quota_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.api_clients(id) ON DELETE CASCADE,
  window_kind text NOT NULL CHECK (window_kind IN ('minute','day')),
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0,
  UNIQUE (client_id, window_kind, window_start)
);
CREATE INDEX IF NOT EXISTS idx_api_quota_lookup ON public.api_quota_counters(client_id, window_kind, window_start DESC);
ALTER TABLE public.api_quota_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner reads quota" ON public.api_quota_counters;
CREATE POLICY "Owner reads quota" ON public.api_quota_counters
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR
    EXISTS(SELECT 1 FROM public.api_clients c WHERE c.id = api_quota_counters.client_id AND c.user_id = auth.uid())
  );

-- Best-effort rate-limit + quota function called from edge functions
CREATE OR REPLACE FUNCTION public.api_check_and_increment(_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client record; _minute_start timestamptz; _day_start timestamptz;
  _minute_count int; _day_count int;
BEGIN
  SELECT * INTO _client FROM public.api_clients WHERE id = _client_id AND is_active = true;
  IF _client IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'client_inactive');
  END IF;
  _minute_start := date_trunc('minute', now());
  _day_start := date_trunc('day', now());

  INSERT INTO public.api_quota_counters(client_id, window_kind, window_start, count)
    VALUES (_client_id, 'minute', _minute_start, 1)
    ON CONFLICT (client_id, window_kind, window_start)
    DO UPDATE SET count = api_quota_counters.count + 1
    RETURNING count INTO _minute_count;

  INSERT INTO public.api_quota_counters(client_id, window_kind, window_start, count)
    VALUES (_client_id, 'day', _day_start, 1)
    ON CONFLICT (client_id, window_kind, window_start)
    DO UPDATE SET count = api_quota_counters.count + 1
    RETURNING count INTO _day_count;

  IF _minute_count > _client.rate_limit_per_minute THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limit', 'minute_count', _minute_count);
  END IF;
  IF _day_count > _client.quota_per_day THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_exceeded', 'day_count', _day_count);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'minute_count', _minute_count, 'day_count', _day_count);
END $$;

-- 8) CANONICAL ENTITIES: playlists, publishers, labels, works
CREATE TABLE IF NOT EXISTS public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_playlist_id text UNIQUE NOT NULL DEFAULT public.gen_pub_id('pl'),
  name text NOT NULL,
  normalized_name text,
  curator text,
  platform text,
  description text,
  followers int,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth reads playlists" ON public.playlists;
CREATE POLICY "Auth reads playlists" ON public.playlists FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth writes playlists" ON public.playlists;
CREATE POLICY "Auth writes playlists" ON public.playlists FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Auth updates playlists" ON public.playlists;
CREATE POLICY "Auth updates playlists" ON public.playlists FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_publisher_id text UNIQUE NOT NULL DEFAULT public.gen_pub_id('pub'),
  name text NOT NULL,
  normalized_name text,
  parent_company text,
  country text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth reads publishers" ON public.publishers;
CREATE POLICY "Auth reads publishers" ON public.publishers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth writes publishers" ON public.publishers;
CREATE POLICY "Auth writes publishers" ON public.publishers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Auth updates publishers" ON public.publishers;
CREATE POLICY "Auth updates publishers" ON public.publishers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_label_id text UNIQUE NOT NULL DEFAULT public.gen_pub_id('lbl'),
  name text NOT NULL,
  normalized_name text,
  parent_company text,
  is_major boolean,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth reads labels" ON public.labels;
CREATE POLICY "Auth reads labels" ON public.labels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth writes labels" ON public.labels;
CREATE POLICY "Auth writes labels" ON public.labels FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Auth updates labels" ON public.labels;
CREATE POLICY "Auth updates labels" ON public.labels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_work_id text UNIQUE NOT NULL DEFAULT public.gen_pub_id('wrk'),
  title text NOT NULL,
  normalized_title text,
  iswc text,
  primary_writer_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_works_iswc ON public.works(iswc);
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth reads works" ON public.works;
CREATE POLICY "Auth reads works" ON public.works FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth writes works" ON public.works;
CREATE POLICY "Auth writes works" ON public.works FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Auth updates works" ON public.works;
CREATE POLICY "Auth updates works" ON public.works FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- updated_at triggers
DROP TRIGGER IF EXISTS playlists_updated ON public.playlists;
CREATE TRIGGER playlists_updated BEFORE UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS publishers_updated ON public.publishers;
CREATE TRIGGER publishers_updated BEFORE UPDATE ON public.publishers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS labels_updated ON public.labels;
CREATE TRIGGER labels_updated BEFORE UPDATE ON public.labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS works_updated ON public.works;
CREATE TRIGGER works_updated BEFORE UPDATE ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend pub_refresh_search_document for new types
CREATE OR REPLACE FUNCTION public.pub_refresh_search_document(_entity_type text, _pub_entity_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _display text; _subtitle text; _norm text; _aliases text[];
  _externals jsonb; _urls text[]; _coverage int; _entity_uuid uuid;
  _country text; _genres text[]; _region text[];
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
           COALESCE(NULLIF(primary_role,''), 'creator') ||
             CASE WHEN country IS NOT NULL THEN ' · ' || country ELSE '' END
      INTO _entity_uuid, _display, _norm, _aliases, _country, _subtitle
      FROM public.creators WHERE pub_creator_id = _pub_entity_id;
    _region := CASE WHEN _country IS NOT NULL THEN ARRAY[_country] ELSE '{}'::text[] END;
  ELSIF _entity_type = 'playlist' THEN
    SELECT id, name, normalized_name, ARRAY[]::text[], NULL, COALESCE(curator, platform)
      INTO _entity_uuid, _display, _norm, _aliases, _country, _subtitle
      FROM public.playlists WHERE pub_playlist_id = _pub_entity_id;
    _region := '{}'::text[];
  ELSIF _entity_type = 'publisher' THEN
    SELECT id, name, normalized_name, ARRAY[]::text[], country, COALESCE(parent_company, 'Publisher')
      INTO _entity_uuid, _display, _norm, _aliases, _country, _subtitle
      FROM public.publishers WHERE pub_publisher_id = _pub_entity_id;
    _region := CASE WHEN _country IS NOT NULL THEN ARRAY[_country] ELSE '{}'::text[] END;
  ELSIF _entity_type = 'label' THEN
    SELECT id, name, normalized_name, ARRAY[]::text[], NULL, COALESCE(parent_company, CASE WHEN is_major THEN 'Major label' ELSE 'Indie label' END)
      INTO _entity_uuid, _display, _norm, _aliases, _country, _subtitle
      FROM public.labels WHERE pub_label_id = _pub_entity_id;
    _region := '{}'::text[];
  ELSIF _entity_type = 'work' THEN
    SELECT id, title, normalized_title, ARRAY[]::text[], NULL, COALESCE(primary_writer_name, iswc)
      INTO _entity_uuid, _display, _norm, _aliases, _country, _subtitle
      FROM public.works WHERE pub_work_id = _pub_entity_id;
    _region := '{}'::text[];
  ELSE
    RETURN;
  END IF;

  IF _entity_uuid IS NULL THEN RETURN; END IF;

  -- Only fetch externals for types that participate in external_ids enum
  IF _entity_type IN ('artist','track','album','creator') THEN
    SELECT COALESCE(jsonb_object_agg(platform, external_id), '{}'::jsonb),
           COALESCE(array_agg(DISTINCT url) FILTER (WHERE url IS NOT NULL), '{}'::text[]),
           COUNT(DISTINCT platform)
      INTO _externals, _urls, _coverage
      FROM public.external_ids
     WHERE entity_type::text = _entity_type AND entity_id = _entity_uuid;
  ELSE
    _externals := '{}'::jsonb; _urls := '{}'::text[]; _coverage := 0;
  END IF;

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

-- Search-doc maintenance triggers for new types
CREATE OR REPLACE FUNCTION public.playlists_search_doc_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_name := public.normalize_entity_name(NEW.name);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS playlists_norm ON public.playlists;
CREATE TRIGGER playlists_norm BEFORE INSERT OR UPDATE ON public.playlists
  FOR EACH ROW EXECUTE FUNCTION public.playlists_search_doc_trigger();

CREATE OR REPLACE FUNCTION public.publishers_norm_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_name := public.normalize_entity_name(NEW.name);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS publishers_norm ON public.publishers;
CREATE TRIGGER publishers_norm BEFORE INSERT OR UPDATE ON public.publishers
  FOR EACH ROW EXECUTE FUNCTION public.publishers_norm_trigger();

CREATE OR REPLACE FUNCTION public.labels_norm_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_name := public.normalize_entity_name(NEW.name);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS labels_norm ON public.labels;
CREATE TRIGGER labels_norm BEFORE INSERT OR UPDATE ON public.labels
  FOR EACH ROW EXECUTE FUNCTION public.labels_norm_trigger();

CREATE OR REPLACE FUNCTION public.works_norm_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_title := public.normalize_entity_name(NEW.title);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS works_norm ON public.works;
CREATE TRIGGER works_norm BEFORE INSERT OR UPDATE ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.works_norm_trigger();