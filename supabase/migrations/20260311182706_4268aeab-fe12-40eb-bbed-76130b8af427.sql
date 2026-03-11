
-- Grant necessary privileges on team tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.team_invites TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_favorites TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist_entries TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.watchlist_entry_sources TO anon, authenticated;
GRANT SELECT, INSERT ON public.watchlist_activity TO anon, authenticated;
