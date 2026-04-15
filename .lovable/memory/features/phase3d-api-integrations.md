---
name: Phase 3D API Integrations
description: Soundcharts, Catalog Comps, Touring Data, and PRO lookup enhancements
type: feature
---

## Implemented Integrations

### 1. ASCAP/BMI PRO Lookup (Enhanced)
- Existing `pro-lookup` edge function already handles ASCAP ACE and BMI repertoire searches
- Added `pro_affiliation` and `territory_coverage` columns to `people` table
- PRO badges (ASCAP/BMI/SESAC/SOCAN/PRS/GEMA/APRA/JASRAC/SACEM) already styled in CreditCard

### 2. Soundcharts API
- Edge function: `soundcharts-enrich`
- Secret: `SOUNDCHARTS_API_KEY` (format: `appId:apiKey`)
- Fetches: monthly listeners, 7d delta, playlist tracking, chart positions, Instagram followers
- Cached in `soundcharts_cache` table (24h TTL)
- UI: `SoundchartsPanel` component showing 3-metric grid + top playlists + chart positions

### 3. Catalog Comparables (Royalty Exchange)
- Edge function: `catalog-comps`
- Table: `catalog_comparables` (sale_date, catalog_name, sale_price, annual_revenue, multiple, genre, song_count)
- Returns market stats: avg/median multiple, genre breakdown
- CatalogValuationDashboard enhanced with "Similar catalog sold for $X at Xx multiple" messaging

### 4. Bandsintown Touring Data
- Edge function: `touring-data`
- Secret: `BANDSINTOWN_API_KEY`
- Table: `artist_tour_data` (upcoming_shows_count, avg_venue_capacity, touring_regions, on_tour flag)
- UI: `TouringActivityBadge` component (compact badge on CreditCard for artist role)
- 24h cache on tour data queries

### API Helper
- `src/lib/api/integrationEngines.ts` - Client-side wrappers for all 3 new edge functions
