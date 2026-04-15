---
name: Phase 2 - Competitive Intelligence & Collaboration
description: Competitor signing tracker, team activity feed with realtime, search presets, bulk operations
type: feature
---
## Competitive Intelligence
- `competitor_signings` table tracks competitor deals with artist name, competitor, genre, deal date, value range, news source
- Team-scoped with RLS via `is_team_member`
- Dashboard view shows competitor stats (signing count, genres, velocity)
- Overlap alerts when watchlist artists get signed by competitors
- UI: CompetitorIntelPanel with dashboard/signings toggle views

## Team Activity Feed
- `team_activity_feed` table with realtime subscription via `supabase_realtime`
- Tracks searches, watchlist adds, pipeline moves, notes, mentions
- @mention system with `mentions uuid[]` column and GIN index
- `useTeamActivityFeed` hook with live subscription
- TeamActivityFeed component with compact mode

## Search Presets
- `saved_search_presets` table storing filter combinations
- Supports shared presets via `is_shared` + `team_id`
- Usage tracking with `usage_count` and `last_used_at`
- SearchPresetsBar integrated into AdvancedToolsPanel
- Save current filters, apply presets, delete presets

## Integration Points
- CompetitorIntelPanel + TeamActivityFeed in WatchlistView (team mode only)
- SearchPresetsBar in AdvancedToolsPanel alongside filter controls
