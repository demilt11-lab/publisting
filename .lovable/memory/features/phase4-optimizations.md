---
name: Phase 4 Critical Optimizations
description: Progressive loading, scenario analysis, ML feedback loop, CSV bulk import, data freshness badges
type: feature
---

## Progressive Data Loading
- `EnrichmentProgress` component shows 4-phase enrichment status (Credits → PRO → Shares → Social)
- Displayed in SongProfilePanel header during background enrichment
- Auto-hides when all phases complete

## Data Freshness Badges
- `DataFreshnessBadge` component shows age of cached data with color coding
- Green: <24h, Amber: >3 days, Red: expired cache
- Click-to-refresh on expired data

## Scenario Analysis
- `ScenarioAnalysisPanel` in CatalogValuationDashboard
- Bear/Base/Bull case comparison with percentage deltas
- Sensitivity analysis with interactive sliders for growth, discount, and multiple
- Visual bar chart showing value impact across parameter ranges

## ML Feedback Loop
- Thumbs up/down on recommendations now updates `ml_user_profiles.genre_weights` and `region_weights`
- Weight adjustments: +0.15 for thumbs_up, -0.1 for thumbs_down
- Clamped to [0, 1] range

## CSV Bulk Import
- `CsvBulkImport` component with 3-step flow: upload → column mapping → processing
- Auto-detects columns (artist, title, ISRC, Spotify URL)
- Max 100 rows, 1.2s delay between lookups for rate limiting
- Export results as CSV with BOM encoding
