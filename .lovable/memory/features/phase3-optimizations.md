---
name: Phase 3 Optimizations
description: Predictive trend forecasting upgrades, catalog valuation enhancements, lookalike search, deal rooms
type: feature
---

## Trend Forecasting Upgrades
- **Playlist velocity**: Estimated playlist adds/week from popularity trends, factored into breakout probability
- **Genre momentum score**: Artist growth vs genre baseline (10% default), expressed as multiplier (e.g., 2.5x)
- **Follower velocity**: Tracked per platform (Instagram, TikTok) via people record, stored as JSONB
- All three new signals stored in `artist_trending_metrics` columns and factored into breakout probability formula

## Catalog Valuation Enhancements
- **Decay modeling**: Exponential decay `e^(-rate * age)` applied to annual revenue, floored at 30% of original
- **Concentration risk**: Herfindahl index across song values, plus top-3 share percentage warning at >70%
- **Geographic diversification**: Country-level Herfindahl inverse (higher = more global reach)
- **Copyright expiry impact**: Discount factor for copyrights with <20 years remaining
- New columns in `catalog_valuations`: decay_factor, concentration_risk, geographic_score, copyright_expiry_impact

## Lookalike Artist Search
- Audio feature similarity (danceability, energy, valence, acousticness, tempo, instrumentalness)
- Genre overlap scoring, career stage matching (popularity bands), region matching
- Results stored in `lookalike_searches` table with source features and filters
- Component: `LookalikeSearchPanel.tsx`

## Deal Rooms
- Per-deal collaboration space with versioned notes timeline
- Stored in `deal_rooms` table (unique per entry_id + team_id)
- Notes history as JSONB array with author, timestamp, text
- Component: `DealRoomPanel.tsx`
