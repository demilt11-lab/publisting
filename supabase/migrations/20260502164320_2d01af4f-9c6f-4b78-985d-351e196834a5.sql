
-- entity_view_events: per-user views per entity, used to surface "Track this?" and auto-pin
CREATE TABLE IF NOT EXISTS public.entity_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('artist','track','creator','album','playlist','publisher','label','work')),
  pub_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entity_view_events_user_recent_idx
  ON public.entity_view_events(user_id, entity_type, pub_id, created_at DESC);
ALTER TABLE public.entity_view_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own views" ON public.entity_view_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users see own views" ON public.entity_view_events FOR SELECT USING (auth.uid() = user_id);

-- saved_query_templates: built-in starter searches
CREATE TABLE IF NOT EXISTS public.saved_query_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saved_query_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads templates" ON public.saved_query_templates FOR SELECT USING (true);
CREATE POLICY "admin manages templates" ON public.saved_query_templates FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- user_template_subscriptions: opt-in per user
CREATE TABLE IF NOT EXISTS public.user_template_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.saved_query_templates(id) ON DELETE CASCADE,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, template_id)
);
ALTER TABLE public.user_template_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own template subs" ON public.user_template_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- digest_runs: persist daily digest summaries
CREATE TABLE IF NOT EXISTS public.digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cadence text NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily','weekly')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  alert_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cadence, period_start)
);
ALTER TABLE public.digest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own digests" ON public.digest_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service inserts digests" ON public.digest_runs FOR INSERT TO service_role WITH CHECK (true);

-- RPC: record a view, returns counts + suggestion flags
CREATE OR REPLACE FUNCTION public.pub_record_view(
  _entity_type text, _pub_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _count int; _already_pinned boolean;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  INSERT INTO public.entity_view_events(user_id, entity_type, pub_id) VALUES (_uid, _entity_type, _pub_id);
  SELECT count(*) INTO _count
    FROM public.entity_view_events
    WHERE user_id = _uid AND entity_type = _entity_type AND pub_id = _pub_id
      AND created_at > now() - interval '30 days';
  SELECT EXISTS (
    SELECT 1 FROM public.pinned_entities
    WHERE user_id = _uid AND entity_type = _entity_type AND pub_id = _pub_id
  ) INTO _already_pinned;
  -- Auto-pin at 5 views
  IF _count >= 5 AND NOT _already_pinned THEN
    INSERT INTO public.pinned_entities(user_id, entity_type, pub_id, source, label)
    VALUES (_uid, _entity_type, _pub_id, 'manual', NULL)
    ON CONFLICT (user_id, entity_type, pub_id) DO NOTHING;
    _already_pinned := true;
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'view_count', _count,
    'suggest', _count >= 3 AND NOT _already_pinned,
    'auto_pinned', _count >= 5,
    'pinned', _already_pinned
  );
END $$;

-- RPC: ensure default alert subscription exists for a pinned entity
CREATE OR REPLACE FUNCTION public.pub_apply_default_subscriptions(
  _entity_type text, _pub_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _entity_uuid uuid; _existing uuid;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  IF _entity_type NOT IN ('artist','track','creator') THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;
  IF _entity_type = 'artist' THEN SELECT id INTO _entity_uuid FROM public.artists WHERE pub_artist_id = _pub_id;
  ELSIF _entity_type = 'track' THEN SELECT id INTO _entity_uuid FROM public.tracks WHERE pub_track_id = _pub_id;
  ELSE SELECT id INTO _entity_uuid FROM public.creators WHERE pub_creator_id = _pub_id;
  END IF;
  IF _entity_uuid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'entity_not_found'); END IF;
  SELECT id INTO _existing FROM public.pub_alert_subscriptions
    WHERE user_id = _uid AND entity_type = _entity_type AND entity_id = _entity_uuid;
  IF _existing IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  INSERT INTO public.pub_alert_subscriptions(user_id, entity_type, entity_id, pub_id)
    VALUES (_uid, _entity_type, _entity_uuid, _pub_id);
  RETURN jsonb_build_object('ok', true, 'subscribed', true);
END $$;

-- Improve auto-pin-on-watchlist trigger to also auto-subscribe
CREATE OR REPLACE FUNCTION public.trg_autopin_on_watchlist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _entity_uuid uuid;
BEGIN
  IF NEW.user_id IS NULL OR NEW.pub_creator_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.pinned_entities(user_id, entity_type, pub_id, source, label)
  VALUES (NEW.user_id, 'creator', NEW.pub_creator_id, 'watchlist', NEW.person_name)
  ON CONFLICT (user_id, entity_type, pub_id) DO NOTHING;
  SELECT id INTO _entity_uuid FROM public.creators WHERE pub_creator_id = NEW.pub_creator_id;
  IF _entity_uuid IS NOT NULL THEN
    INSERT INTO public.pub_alert_subscriptions(user_id, entity_type, entity_id, pub_id)
    VALUES (NEW.user_id, 'creator', _entity_uuid, NEW.pub_creator_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- Seed built-in templates
INSERT INTO public.saved_query_templates (slug, title, description, query, category) VALUES
  ('unsigned-writers', 'Unsigned writers', 'Writers with no confirmed publisher', '{"entity_type":"creator","role":"writer","signed":false}'::jsonb, 'discovery'),
  ('unsigned-producers', 'Unsigned producers', 'Producers with no confirmed publisher/label', '{"entity_type":"creator","role":"producer","signed":false}'::jsonb, 'discovery'),
  ('multi-source-creators', 'Creators with 3+ sources', 'High-confidence creators verified across multiple data providers', '{"entity_type":"creator","min_sources":3}'::jsonb, 'quality'),
  ('tracks-missing-credits', 'Tracks missing credits', 'Tracks with no writer or producer credits yet', '{"entity_type":"track","missing_credits":true}'::jsonb, 'gaps'),
  ('rising-collaborators', 'Rising collaborators', 'Collaborators linked to your tracked entities with new credits', '{"entity_type":"creator","linked_to_pinned":true,"window_days":30}'::jsonb, 'movement'),
  ('confidence-changes', 'Confidence/provenance changes', 'Entities whose data confidence or trust state recently changed', '{"signal":"confidence_change","window_days":14}'::jsonb, 'integrity')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, query = EXCLUDED.query, category = EXCLUDED.category, updated_at = now();
