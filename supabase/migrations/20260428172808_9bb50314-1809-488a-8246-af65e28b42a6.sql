-- Verified splits per user/song
CREATE TABLE public.verified_splits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  song_title TEXT NOT NULL,
  song_artist TEXT,
  iswc TEXT,
  work_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- 'mlc' | 'bmi' | 'ascap' | 'manual'
  writers JSONB NOT NULL DEFAULT '[]'::jsonb,
  publishers JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_verified TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_verified_splits_user_song
  ON public.verified_splits (user_id, lower(song_title), lower(coalesce(song_artist, '')));
CREATE INDEX idx_verified_splits_iswc
  ON public.verified_splits (user_id, iswc) WHERE iswc IS NOT NULL;

ALTER TABLE public.verified_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own verified splits"
  ON public.verified_splits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own verified splits"
  ON public.verified_splits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own verified splits"
  ON public.verified_splits FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own verified splits"
  ON public.verified_splits FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_verified_splits_updated_at
  BEFORE UPDATE ON public.verified_splits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-user MLC API credentials
CREATE TABLE public.mlc_credentials (
  user_id UUID NOT NULL PRIMARY KEY,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  auto_lookup_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mlc_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own MLC creds"
  ON public.mlc_credentials FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own MLC creds"
  ON public.mlc_credentials FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own MLC creds"
  ON public.mlc_credentials FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own MLC creds"
  ON public.mlc_credentials FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_mlc_credentials_updated_at
  BEFORE UPDATE ON public.mlc_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();