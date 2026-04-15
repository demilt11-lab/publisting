---
name: Phase 3 Power Features
description: Multiple valuation models, trend detection, pitch deck generator, missing data imputation, fuzzy search & aliases
type: feature
---

## 1. Multiple Valuation Models (ValuationModelsComparison.tsx)
- **DCF (Income Approach)**: Existing, from catalog-valuation edge function
- **Market Multiple**: Annual revenue × configurable multiple
- **Risk-Adjusted NPV**: 10-year NPV with pessimistic/realistic/optimistic scenarios (20/60/20 probabilities)
- **Sync Score (0-100)**: Based on genre fit, explicit content, tempo, existing sync placements, catalog diversity
- All 4 displayed side-by-side in CatalogValuationDashboard

## 2. Trend Detection & Velocity (streaming-velocity edge function)
- `streaming_velocity` table tracks daily/weekly stream changes per song
- Detects: viral (>200% WoW), trending (>100%), regional_breakout, playlist_boost, seasonal
- `TrendingBadge.tsx` component for search results
- Catalog-level alerts for viral growth

## 3. Pitch Deck Generator (PitchDeckGenerator.tsx)
- Auto-generates 6-slide investor presentation from catalog data
- PDF via print dialog, PPTX stub for future edge function
- Slides: Title, Executive Summary, Portfolio Composition, Revenue Analysis, Risk Assessment, Investment Highlights

## 4. Missing Data Imputation (estimate-streams edge function)
- ML regression based on: genre baselines, popularity, playlist count, chart positions, follower count, social mentions
- Returns low/mid/high estimate with confidence percentage
- `StreamEstimateBadge.tsx` displays "Est. 5-8M streams (70% confidence)"

## 5. Fuzzy Search & Aliases (ArtistAliasPanel.tsx)
- `artist_aliases` table with person_id, alias_name, alias_type, source
- Soundex phonetic matching for name variations
- Manual alias management UI with add/remove
- Generated column `alias_name_lower` for case-insensitive lookups
