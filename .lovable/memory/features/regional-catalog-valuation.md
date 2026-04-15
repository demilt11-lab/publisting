---
name: Region-Specific Catalog Valuation
description: Catalog valuation uses region-aware streaming rates, market multiples, and discount rates to prevent overvaluation of non-US catalogs
type: feature
---
- `src/utils/regionalRates.ts` provides region-specific streaming rates, market multiples, and discount rates for US, UK, Canada, India, Brazil, Africa, LatAm, Global
- CatalogValuationDashboard auto-detects dominant region from song data and adjusts slider defaults accordingly
- India: Spotify $0.0015/stream, YouTube $0.0002/view, 10x multiple, 18% discount rate
- US: Spotify $0.004/stream, YouTube $0.0007/view, 18x multiple, 11% discount rate
- Edge function (`catalog-valuation`) mirrors regional rates server-side; falls back to regional defaults when DB rates unavailable
- ScenarioAnalysisPanel uses region-aware rates for bear/base/bull case calculations
- Region selector in valuation settings panel with auto-detected badge and tooltip
- `getMedianMultiple` default changed from 18 to 12 (Global) to prevent inflation bias
