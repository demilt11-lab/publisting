-- pinned_entities: per-user dashboard pins (the "tracked entities" widget)
CREATE TABLE IF NOT EXISTS public.pinned_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('artist','track','creator','album','playlist','publisher','label','work')),
  pub_id text NOT NULL,
  label text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','alert','watchlist','seeded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, pub_id)
);
CREATE INDEX IF NOT EXISTS pinned_entities_user_idx ON public.pinned_entities(user_id, created_at DESC);

ALTER TABLE public.pinned_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own pins" ON public.pinned_entities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own pins" ON public.pinned_entities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own pins" ON public.pinned_entities FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "users update own pins" ON public.pinned_entities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "service can insert any pin" ON public.pinned_entities FOR INSERT TO service_role WITH CHECK (true);

-- Auto-pin trigger when a user subscribes to alerts
CREATE OR REPLACE FUNCTION public.trg_autopin_on_subscribe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL OR NEW.pub_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.pinned_entities(user_id, entity_type, pub_id, source)
  VALUES (NEW.user_id, NEW.entity_type, NEW.pub_id, 'alert')
  ON CONFLICT (user_id, entity_type, pub_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS autopin_on_subscribe ON public.pub_alert_subscriptions;
CREATE TRIGGER autopin_on_subscribe
AFTER INSERT ON public.pub_alert_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trg_autopin_on_subscribe();

-- Auto-pin trigger when a user adds a watchlist entry
CREATE OR REPLACE FUNCTION public.trg_autopin_on_watchlist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL OR NEW.pub_creator_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.pinned_entities(user_id, entity_type, pub_id, source, label)
  VALUES (NEW.user_id, 'creator', NEW.pub_creator_id, 'watchlist', NEW.person_name)
  ON CONFLICT (user_id, entity_type, pub_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS autopin_on_watchlist ON public.watchlist_entries;
CREATE TRIGGER autopin_on_watchlist
AFTER INSERT ON public.watchlist_entries
FOR EACH ROW EXECUTE FUNCTION public.trg_autopin_on_watchlist();

-- Helper: seed pins from recent searches (called on first-load if user has none)
CREATE OR REPLACE FUNCTION public.pub_seed_pins_from_recent(_user_id uuid, _limit int DEFAULT 5)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int := 0; r record;
BEGIN
  IF _user_id IS NULL THEN RETURN 0; END IF;
  -- Use the most recently-touched canonical entities the user has interacted with
  -- via outreach_records or explicit recent lookups (best-effort).
  FOR r IN
    SELECT DISTINCT ON (entity_type, pub_id) entity_type, pub_id, display_name
    FROM (
      SELECT 'artist'::text  AS entity_type, pub_artist_id  AS pub_id, NULL::text AS display_name, created_at
        FROM public.outreach_records WHERE created_by = _user_id AND pub_artist_id IS NOT NULL
      UNION ALL
      SELECT 'track'::text,  pub_track_id,  NULL, created_at
        FROM public.outreach_records WHERE created_by = _user_id AND pub_track_id IS NOT NULL
    ) src
    ORDER BY entity_type, pub_id, created_at DESC
    LIMIT _limit
  LOOP
    INSERT INTO public.pinned_entities(user_id, entity_type, pub_id, source, label)
    VALUES (_user_id, r.entity_type, r.pub_id, 'seeded', r.display_name)
    ON CONFLICT (user_id, entity_type, pub_id) DO NOTHING;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

-- Provider overrides: admin corrections for incorrect mappings
CREATE TABLE IF NOT EXISTS public.provider_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  pub_id text NOT NULL,
  platform text NOT NULL,
  action text NOT NULL CHECK (action IN ('prefer_id','suppress_id','trust_source','distrust_source','canonical_field')),
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_overrides_entity_idx ON public.provider_overrides(entity_type, pub_id);

ALTER TABLE public.provider_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage overrides" ON public.provider_overrides
  FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "anyone may read overrides" ON public.provider_overrides FOR SELECT USING (true);

-- Search benchmark queries + runs
CREATE TABLE IF NOT EXISTS public.search_benchmark_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  entity_type text,
  expected_pub_id text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (query, entity_type)
);
CREATE TABLE IF NOT EXISTS public.search_benchmark_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id uuid REFERENCES public.search_benchmark_queries(id) ON DELETE CASCADE,
  ranked_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_pub_id text,
  top_match_correct boolean,
  rank_of_expected int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.search_benchmark_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_benchmark_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage benchmark queries" ON public.search_benchmark_queries
  FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage benchmark runs" ON public.search_benchmark_runs
  FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "anyone may read benchmarks" ON public.search_benchmark_queries FOR SELECT USING (true);
CREATE POLICY "anyone may read benchmark runs" ON public.search_benchmark_runs FOR SELECT USING (true);
