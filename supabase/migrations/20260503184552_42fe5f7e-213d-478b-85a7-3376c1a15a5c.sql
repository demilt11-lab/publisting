
CREATE INDEX IF NOT EXISTS idx_artists_normalized_name ON public.artists (normalized_name);
CREATE INDEX IF NOT EXISTS idx_tracks_normalized_title ON public.tracks (normalized_title);
CREATE INDEX IF NOT EXISTS idx_albums_normalized_title ON public.albums (normalized_title);
CREATE INDEX IF NOT EXISTS idx_creators_normalized_name ON public.creators (normalized_name);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_artists_name_trgm ON public.artists USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tracks_title_trgm ON public.tracks USING gin (normalized_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_albums_title_trgm ON public.albums USING gin (normalized_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_creators_name_trgm ON public.creators USING gin (normalized_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tracks_isrc ON public.tracks (isrc) WHERE isrc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_albums_upc ON public.albums (upc) WHERE upc IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tracks_primary_artist_name ON public.tracks (primary_artist_name);
CREATE INDEX IF NOT EXISTS idx_albums_primary_artist_name ON public.albums (primary_artist_name);

CREATE INDEX IF NOT EXISTS idx_external_ids_entity ON public.external_ids (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_external_ids_platform_external ON public.external_ids (platform, external_id);

CREATE INDEX IF NOT EXISTS idx_user_search_logs_created_at ON public.user_search_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_search_logs_user_created ON public.user_search_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_search_logs_clicked_entity ON public.user_search_logs (clicked_entity_id) WHERE clicked_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_rate_limits_user_action ON public.user_rate_limits (user_id, action, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_records_next_follow_up ON public.outreach_records (next_follow_up_date) WHERE next_follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_records_owner_status ON public.outreach_records (owner_id, contact_status);
CREATE INDEX IF NOT EXISTS idx_outreach_records_team ON public.outreach_records (team_id);

CREATE INDEX IF NOT EXISTS idx_chart_history_entity_date ON public.chart_history (entity_type, entity_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_history_entity_date ON public.playlist_history (entity_type, entity_id, date DESC);
