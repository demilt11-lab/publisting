---
name: Phase 1 Industry-Dominant Systems
description: Trend forecasting, deal pipeline AI scoring, and dynamic catalog valuation engines
type: feature
---

## System 1: Predictive Trend Forecasting
- Tables: `artist_trending_metrics`, `trend_predictions`
- Edge function: `trend-forecasting` — velocity calculation, breakout probability, exponential smoothing forecast
- UI: `TrendingBadge` (compact/full), `VelocitySparkline`, `BreakoutAlert`, `TrendForecastPanel`
- Breakout formula: velocity(0.35) + regional(0.25) + social(0.20) + genre_shift(0.10) + volume(0.10)

## System 2: Smart Pipeline with AI Deal Scoring
- Tables: `pipeline_activities`, `deal_likelihood_scores`
- Edge function: `deal-scoring` — response rate, fit score, momentum, recency, engagement, pipeline stage
- Formula: response_rate(0.25) + fit_score(0.20) + momentum(0.20) + recency(0.15) + engagement(0.10) + stage(0.10) * 100
- UI: `DealScoreBadge`, `SuggestedActionCard`, `ActivityTimeline`, email templates
- Integrated into WatchlistView board cards

## System 3: Dynamic Catalog Valuation
- Tables: `catalog_valuations`, `market_multiples` (seeded with 15 real-world transactions)
- Edge function: `catalog-valuation` — DCF, Market Multiple, Monte Carlo (10K simulations)
- UI: `CatalogValuationDashboard` with scenario sliders, confidence bands, song contribution breakdown, risk metrics
- Integrated into CatalogAnalysis page below 3-Year Forecast
