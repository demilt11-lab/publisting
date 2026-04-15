---
name: Streaming Rate Database
description: Country-specific per-stream rates for Spotify/YouTube stored in streaming_rates table, updated quarterly
type: feature
---
- `streaming_rates` table stores per-stream payout rates by platform and country with quarterly versioning
- `streaming_rate_audit` table logs all rate changes
- Q2 2026 data populated for 60+ countries across Spotify and YouTube
- Default tier rates: T1 ($0.00350), T2 ($0.00180), T3 ($0.00095) for unlisted countries
- `src/lib/api/streamingRates.ts` provides `fetchActiveRates()`, `getRateForCountry()`, `getBlendedRate()`, `getRegionalPublishingRates()`
- `src/hooks/useStreamingRates.ts` React hook with 1-hour in-memory cache
- CatalogAnalysis page uses DB-backed rates via `buildRegionalMetrics()` merger
- `publishingRevenue.ts` updated with performance royalty split (15%) and `RateOverrides` parameter
- Admin dashboard at `/admin/streaming-rates` shows all rates with filtering
- Publishing revenue formula: mechanical + performance (15% of platform payout)
- US default rates: Spotify $0.00437/stream, YouTube $0.00182/view
