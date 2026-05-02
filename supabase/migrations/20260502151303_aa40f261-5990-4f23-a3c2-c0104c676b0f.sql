
-- 1) Extend lookup_alerts with canonical pub_* anchors
ALTER TABLE public.lookup_alerts
  ADD COLUMN IF NOT EXISTS pub_artist_id text,
  ADD COLUMN IF NOT EXISTS pub_track_id text,
  ADD COLUMN IF NOT EXISTS pub_creator_id text,
  ADD COLUMN IF NOT EXISTS entity_uuid uuid,
  ADD COLUMN IF NOT EXISTS entity_type text;

CREATE INDEX IF NOT EXISTS idx_lookup_alerts_pub_artist ON public.lookup_alerts(pub_artist_id) WHERE pub_artist_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lookup_alerts_pub_track  ON public.lookup_alerts(pub_track_id)  WHERE pub_track_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lookup_alerts_pub_creator ON public.lookup_alerts(pub_creator_id) WHERE pub_creator_id IS NOT NULL;

-- 2) Per-user subscriptions on canonical entities
CREATE TABLE IF NOT EXISTS public.pub_alert_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('artist','track','creator')),
  entity_id uuid NOT NULL,
  pub_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);

ALTER TABLE public.pub_alert_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own pub subs"
  ON public.pub_alert_subscriptions FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users insert own pub subs"
  ON public.pub_alert_subscriptions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "users delete own pub subs"
  ON public.pub_alert_subscriptions FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- 3) Helper: emit an entity alert (fans out to all subscribers of that entity)
CREATE OR REPLACE FUNCTION public.emit_pub_entity_alert(
  _entity_type text, _entity_id uuid, _kind text, _severity text,
  _title text, _body text, _payload jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pub_artist text; _pub_track text; _pub_creator text;
  _sub RECORD;
BEGIN
  IF _entity_type = 'artist' THEN
    SELECT pub_artist_id INTO _pub_artist FROM public.artists WHERE id = _entity_id;
  ELSIF _entity_type = 'track' THEN
    SELECT pub_track_id INTO _pub_track FROM public.tracks WHERE id = _entity_id;
  ELSIF _entity_type = 'creator' THEN
    SELECT pub_creator_id INTO _pub_creator FROM public.creators WHERE id = _entity_id;
  END IF;

  -- Fan out: one row per subscriber. If none, write a single shared row (user_id NULL) so it shows in global feed.
  IF EXISTS (SELECT 1 FROM public.pub_alert_subscriptions WHERE entity_type = _entity_type AND entity_id = _entity_id) THEN
    FOR _sub IN
      SELECT user_id FROM public.pub_alert_subscriptions WHERE entity_type = _entity_type AND entity_id = _entity_id
    LOOP
      INSERT INTO public.lookup_alerts (
        user_id, kind, severity, title, body,
        pub_artist_id, pub_track_id, pub_creator_id, entity_uuid, entity_type, payload
      ) VALUES (
        _sub.user_id, _kind, _severity, _title, _body,
        _pub_artist, _pub_track, _pub_creator, _entity_id, _entity_type, COALESCE(_payload, '{}'::jsonb)
      );
    END LOOP;
  ELSE
    INSERT INTO public.lookup_alerts (
      user_id, kind, severity, title, body,
      pub_artist_id, pub_track_id, pub_creator_id, entity_uuid, entity_type, payload
    ) VALUES (
      NULL, _kind, _severity, _title, _body,
      _pub_artist, _pub_track, _pub_creator, _entity_id, _entity_type, COALESCE(_payload, '{}'::jsonb)
    );
  END IF;
END $$;

-- 4) Trigger: external_ids INSERT → new platform link alert
CREATE OR REPLACE FUNCTION public.trg_pub_alert_external_ids() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _label text;
BEGIN
  IF NEW.entity_type NOT IN ('artist','track','creator') THEN RETURN NEW; END IF;
  _label := initcap(NEW.platform);
  PERFORM public.emit_pub_entity_alert(
    NEW.entity_type, NEW.entity_id,
    'pub_new_platform_link', 'info',
    'New ' || _label || ' link',
    'A new ' || _label || ' identifier was linked to this entity.',
    jsonb_build_object('platform', NEW.platform, 'external_id', NEW.external_id, 'url', NEW.url)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pub_alert_external_ids_ins ON public.external_ids;
CREATE TRIGGER pub_alert_external_ids_ins
AFTER INSERT ON public.external_ids
FOR EACH ROW EXECUTE FUNCTION public.trg_pub_alert_external_ids();

-- 5) Trigger: track_credits INSERT → new credit alert (for both track and creator)
CREATE OR REPLACE FUNCTION public.trg_pub_alert_track_credits() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _track_title text; _creator_name text;
BEGIN
  SELECT title INTO _track_title FROM public.tracks WHERE id = NEW.track_id;
  SELECT name  INTO _creator_name FROM public.creators WHERE id = NEW.creator_id;

  IF NEW.track_id IS NOT NULL THEN
    PERFORM public.emit_pub_entity_alert(
      'track', NEW.track_id,
      'pub_new_credit', 'info',
      'New credit on ' || COALESCE(_track_title, 'track'),
      COALESCE(_creator_name, 'A creator') || ' was credited as ' || COALESCE(NEW.role, 'contributor'),
      jsonb_build_object('role', NEW.role, 'creator_name', _creator_name, 'share', NEW.share)
    );
  END IF;
  IF NEW.creator_id IS NOT NULL THEN
    PERFORM public.emit_pub_entity_alert(
      'creator', NEW.creator_id,
      'pub_new_credit', 'info',
      'New credit for ' || COALESCE(_creator_name, 'creator'),
      COALESCE(_creator_name, 'They') || ' was credited on ' || COALESCE(_track_title, 'a new track'),
      jsonb_build_object('role', NEW.role, 'track_title', _track_title, 'share', NEW.share)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pub_alert_track_credits_ins ON public.track_credits;
CREATE TRIGGER pub_alert_track_credits_ins
AFTER INSERT ON public.track_credits
FOR EACH ROW EXECUTE FUNCTION public.trg_pub_alert_track_credits();

-- 6) Trigger: chart_history INSERT (top 50 only) → chart movement
CREATE OR REPLACE FUNCTION public.trg_pub_alert_chart_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.rank IS NULL OR NEW.rank > 50 THEN RETURN NEW; END IF;
  IF NEW.entity_type NOT IN ('artist','track') THEN RETURN NEW; END IF;
  PERFORM public.emit_pub_entity_alert(
    NEW.entity_type, NEW.entity_id,
    'pub_chart_movement',
    CASE WHEN NEW.rank <= 10 THEN 'high' ELSE 'info' END,
    'Chart placement #' || NEW.rank::text,
    'Hit #' || NEW.rank::text || ' on ' || COALESCE(NEW.platform, 'a chart') ||
      CASE WHEN NEW.country IS NOT NULL THEN ' (' || NEW.country || ')' ELSE '' END,
    jsonb_build_object('platform', NEW.platform, 'rank', NEW.rank, 'country', NEW.country, 'chart_type', NEW.chart_type)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pub_alert_chart_history_ins ON public.chart_history;
CREATE TRIGGER pub_alert_chart_history_ins
AFTER INSERT ON public.chart_history
FOR EACH ROW EXECUTE FUNCTION public.trg_pub_alert_chart_history();
