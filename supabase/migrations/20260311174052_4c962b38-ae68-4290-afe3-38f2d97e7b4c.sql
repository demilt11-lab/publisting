
CREATE TABLE public.data_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  song_title TEXT NOT NULL,
  song_artist TEXT NOT NULL,
  person_name TEXT,
  module TEXT,
  issue_types TEXT[] NOT NULL DEFAULT '{}',
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.data_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert issues"
  ON public.data_issues FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own issues"
  ON public.data_issues FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
