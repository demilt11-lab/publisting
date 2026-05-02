---
name: Phase 6 — Entity Resolution & Smart Search
description: Canonical pub_artist_id / pub_track_id / pub_album_id system with FTS search, time-series chart/playlist history, and source provenance trust layer.
type: feature
---

## Canonical IDs (Step 1)
- Tables `artists`, `tracks`, `albums` each issue a stable prefixed ID via `gen_pub_id()`:
  - `pub_art_<8base36>` for artists
  - `pub_trk_<8base36>` for tracks
  - `pub_alb_<8base36>` for albums
- `external_ids` maps any canonical entity to platform IDs: spotify, apple, deezer, isrc, upc, musicbrainz, genius, youtube, soundcloud, tidal, amazon. Unique on `(entity_type, platform, external_id)`.
- `field_provenance` records which source confirmed which field (the trust layer).
- Existing tables `watchlist_items`, `outreach_records`, `outreach_dismissals`, `favorites`, `search_history` got nullable `pub_track_id` / `pub_artist_id` columns. Existing rows untouched — anchor-as-you-go pattern, text-based fallback still works.

## Edge functions
- `entity-resolver` — accepts `{ entity_type, name|title, primary_artist_name, isrc, upc, external_ids[], provenance[] }`, finds-or-creates the canonical row, upserts external_ids and provenance, returns `pub_id` + `uuid`. Match precedence: external_ids → ISRC/UPC → normalized name+artist → create.
- `entity-search` — Postgres FTS over `artists/tracks/albums.search_doc` (tsvector + GIN), parses URL/ISRC/UPC/text inputs, returns `best_match` + `alternates` + `confidence` + `source_coverage`.

## Smart search (Step 2)
- Postgres FTS only (no Meilisearch). Indexes: `idx_*_search_doc` GIN.
- `search_doc` weights: name/title (A), aliases or artist (B), ISRC/UPC (C), country/lang/label (D).
- URL parsing covers Spotify/Apple/Deezer/YouTube. ISRC = `^[A-Z]{2}[A-Z0-9]{3}\d{7}$`. UPC = 12–13 digits.

## Time-series (Step 4)
- `chart_history(entity_type, entity_id, platform, chart_type, country, rank, date)` — unique per day.
- `playlist_history(entity_type, entity_id, platform, playlist_id, position, followers, date)` — unique per day.
- Existing `chart-history-poller` edge function should be extended to write into these tables keyed by canonical entity IDs in the next phase.

## RLS
- All canonical tables: signed-in users can READ; only service-role (edge functions) can WRITE. This is a shared knowledge graph.

## Client surfaces
- `src/lib/api/entityResolver.ts` — `resolveEntities()`, `resolveOne()`.
- `src/lib/api/entitySearch.ts` — `searchEntities()`.
- `src/lib/api/chartTimeSeries.ts` — `fetchChartHistory()`, `fetchPlaylistHistory()`, `fetchFieldProvenance()`.
- `src/hooks/useEntitySearch.ts` — React hook.
- `src/components/entity/EntityResultCard.tsx`, `EntitySearchPanel.tsx`, `EntityTrendChart.tsx`.
- `src/pages/EntityHub.tsx` at `/entity-hub`.

## Deferred to next phases
- Step 3 metadata refactor: existing `multiSourceLookup.ts` stays as-is. To migrate, call `resolveOne()` at the end of each lookup, then write `field_provenance` rows for confirmed fields. Don't rip out the current logic — augment it.
- Re-anchoring `watchlist_items` / `outreach_records` to `pub_track_id` from existing UI write paths (columns exist but are not yet populated by the writers).
- Step 5 (refresh-token API) explicitly deferred — Supabase Auth already provides this for in-app use.

## Naming
- Internal ID prefix is `pub_` per user decision (not `qoda_` from the spec — Qoda was renamed to Publisting).
