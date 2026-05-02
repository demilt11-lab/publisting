CREATE TABLE IF NOT EXISTS public.creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_creator_id TEXT UNIQUE NOT NULL DEFAULT public.gen_pub_id('crt'),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  primary_role TEXT NOT NULL DEFAULT 'writer' CHECK (primary_role IN ('writer','producer','composer','mixed')),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  country TEXT,
  ipi TEXT,
  pro TEXT,
  image_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_doc tsvector,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creators_norm ON public.creators(normalized_name);
CREATE INDEX IF NOT EXISTS idx_creators_search_doc ON public.creators USING gin(search_doc);
CREATE INDEX IF NOT EXISTS idx_creators_ipi ON public.creators(ipi) WHERE ipi IS NOT NULL;

CREATE OR REPLACE FUNCTION public.creators_search_doc_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_name := public.normalize_entity_name(NEW.name);
  NEW.search_doc :=
    setweight(to_tsvector('simple', coalesce(NEW.name,'')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(coalesce(NEW.aliases,'{}'::text[]), ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.ipi,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.pro,'')), 'D');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_creators_search_doc ON public.creators;
CREATE TRIGGER trg_creators_search_doc BEFORE INSERT OR UPDATE ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.creators_search_doc_trigger();

ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creators readable by authenticated" ON public.creators;
CREATE POLICY "creators readable by authenticated"
  ON public.creators FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.track_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('writer','producer','composer','featured','performer','arranger','mixer','engineer')),
  source TEXT,
  confidence NUMERIC NOT NULL DEFAULT 1.0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_id, creator_id, role)
);
CREATE INDEX IF NOT EXISTS idx_track_credits_track ON public.track_credits(track_id);
CREATE INDEX IF NOT EXISTS idx_track_credits_creator ON public.track_credits(creator_id);
CREATE INDEX IF NOT EXISTS idx_track_credits_role ON public.track_credits(role);

ALTER TABLE public.track_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "track_credits readable by authenticated" ON public.track_credits;
CREATE POLICY "track_credits readable by authenticated"
  ON public.track_credits FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.entity_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  pub_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('artist','track','album','creator')),
  body TEXT NOT NULL,
  author_id UUID NOT NULL,
  mentions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entity_notes_lookup ON public.entity_notes(team_id, entity_type, pub_id);

ALTER TABLE public.entity_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team members can read entity notes" ON public.entity_notes;
CREATE POLICY "team members can read entity notes"
  ON public.entity_notes FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));
DROP POLICY IF EXISTS "team members can insert entity notes" ON public.entity_notes;
CREATE POLICY "team members can insert entity notes"
  ON public.entity_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), team_id) AND author_id = auth.uid());
DROP POLICY IF EXISTS "authors can update their entity notes" ON public.entity_notes;
CREATE POLICY "authors can update their entity notes"
  ON public.entity_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND public.is_team_member(auth.uid(), team_id));
DROP POLICY IF EXISTS "authors can delete their entity notes" ON public.entity_notes;
CREATE POLICY "authors can delete their entity notes"
  ON public.entity_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND public.is_team_member(auth.uid(), team_id));

DROP TRIGGER IF EXISTS trg_entity_notes_updated ON public.entity_notes;
CREATE TRIGGER trg_entity_notes_updated BEFORE UPDATE ON public.entity_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.favorites ADD COLUMN IF NOT EXISTS pub_creator_id TEXT;
ALTER TABLE public.watchlist_entries ADD COLUMN IF NOT EXISTS pub_creator_id TEXT;
ALTER TABLE public.team_favorites ADD COLUMN IF NOT EXISTS pub_creator_id TEXT;
CREATE INDEX IF NOT EXISTS idx_favorites_pub_creator ON public.favorites(pub_creator_id) WHERE pub_creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_watchlist_pub_creator ON public.watchlist_entries(pub_creator_id) WHERE pub_creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_favorites_pub_creator ON public.team_favorites(pub_creator_id) WHERE pub_creator_id IS NOT NULL;