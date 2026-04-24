import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Integration test: simulates a user switching the catalog analysis region
 * selector between US/UK and India and asserts the computed
 * "available to collect" totals follow the expected ordering
 * (US/UK should significantly exceed India for an identical catalog).
 *
 * This guards against regressions where the rate-mapping or
 * collection-rate inversion bug returns.
 */

// Mock the Supabase client — CatalogAnalysis.tsx imports it at module load.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        is: () => ({ order: () => ({ order: () => ({ data: [], error: null }) }) }),
      }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  },
}));

// jsdom shims for modules that touch DOM APIs at import time.
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    // already set in setup.ts but guard for safety
    Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }) });
  }
});

import { analyzeCatalog, buildRegionalMetrics } from '@/pages/CatalogAnalysis';
import { getRegionalPublishingRates, type StreamingRate } from '@/lib/api/streamingRates';

// Fixture: realistic Q2 2026-style rates with India well below US/GB.
function makeRate(
  platform: 'spotify' | 'youtube',
  country_code: string,
  region: string | null,
  rate_per_stream: number
): StreamingRate {
  return {
    id: `${platform}-${country_code}`,
    platform, country_code, region, rate_per_stream,
    currency: 'USD', effective_from: '2026-01-01', effective_to: null,
    quarter: '2026-Q2', source: 'test', verified: true, notes: null,
  };
}

const RATES: StreamingRate[] = [
  makeRate('spotify', 'US', 'north_america', 0.00420),
  makeRate('youtube', 'US', 'north_america', 0.00180),
  makeRate('spotify', 'GB', 'europe', 0.00410),
  makeRate('youtube', 'GB', 'europe', 0.00170),
  makeRate('spotify', 'IN', 'asia', 0.00089),
  makeRate('youtube', 'IN', 'asia', 0.00042),
  // Decoys that would inflate India if blended Asia were used
  makeRate('spotify', 'JP', 'asia', 0.00450),
  makeRate('youtube', 'JP', 'asia', 0.00200),
  makeRate('spotify', 'KR', 'asia', 0.00400),
  makeRate('youtube', 'KR', 'asia', 0.00180),
];

const SAMPLE_CATALOG = [
  { title: 'Track A', artist: 'Artist X', spotifyStreams: 10_000_000, youtubeViews: 2_000_000, ownershipPercent: 0.5, releaseDate: '2024-06-01' },
  { title: 'Track B', artist: 'Artist X', spotifyStreams: 5_000_000,  youtubeViews: 1_000_000, ownershipPercent: 0.5, releaseDate: '2024-09-01' },
  { title: 'Track C', artist: 'Artist Y', spotifyStreams: 8_000_000,  youtubeViews: 3_500_000, ownershipPercent: 1.0, releaseDate: '2025-01-15' },
];

describe('region selector integration', () => {
  const dbRates = getRegionalPublishingRates(RATES);
  const metrics = buildRegionalMetrics(dbRates);

  // Helper: simulate the UI switching region. The CatalogAnalysis page
  // resets all rate/collection/growth overrides when region changes — we
  // mirror that here by passing only `selectedRegion` with no overrides.
  const analyzeForRegion = (region: 'us_uk' | 'india') =>
    analyzeCatalog(SAMPLE_CATALOG, { selectedRegion: region, analysisDate: '2026-04-24' }, metrics);

  it('produces a higher "available to collect" total for US/UK than India', () => {
    const usUk = analyzeForRegion('us_uk');
    const india = analyzeForRegion('india');

    expect(usUk.totalAvailableToCollect).toBeGreaterThan(india.totalAvailableToCollect);
    // Sanity: must be meaningfully higher, not within rounding noise.
    expect(usUk.totalAvailableToCollect).toBeGreaterThan(india.totalAvailableToCollect * 2);
  });

  it('produces a higher 3-year collectible projection for US/UK than India', () => {
    const usUk = analyzeForRegion('us_uk');
    const india = analyzeForRegion('india');

    expect(usUk.totalIndividualThreeYearCollectible).toBeGreaterThan(
      india.totalIndividualThreeYearCollectible
    );
    expect(usUk.totalIndividualThreeYearCollectible).toBeGreaterThan(
      india.totalIndividualThreeYearCollectible * 2
    );
  });

  it('produces a higher total publishing estimate for US/UK than India', () => {
    const usUk = analyzeForRegion('us_uk');
    const india = analyzeForRegion('india');

    expect(usUk.totalPublishingEstimated).toBeGreaterThan(india.totalPublishingEstimated);
  });

  it('switching region back to US/UK after India yields the original US/UK totals (no override leakage)', () => {
    const before = analyzeForRegion('us_uk');
    // Switch to India, then back. Each call uses a fresh config — same as the
    // UI which clears per-region overrides on selector change.
    analyzeForRegion('india');
    const after = analyzeForRegion('us_uk');

    expect(after.totalAvailableToCollect).toBeCloseTo(before.totalAvailableToCollect, 2);
    expect(after.totalPublishingEstimated).toBeCloseTo(before.totalPublishingEstimated, 2);
  });

  it('all regions compute non-zero, finite "available to collect" totals', () => {
    for (const region of ['us_uk', 'india', 'latam', 'africa', 'global_blended'] as const) {
      const result = analyzeCatalog(
        SAMPLE_CATALOG,
        { selectedRegion: region, analysisDate: '2026-04-24' },
        metrics
      );
      expect(Number.isFinite(result.totalAvailableToCollect)).toBe(true);
      expect(result.totalAvailableToCollect).toBeGreaterThan(0);
    }
  });

  it('expected regional ordering (Spotify gross): us_uk > latam > india', () => {
    const order = (['us_uk', 'latam', 'india'] as const).map((region) => ({
      region,
      total: analyzeCatalog(SAMPLE_CATALOG, { selectedRegion: region, analysisDate: '2026-04-24' }, metrics)
        .totalPublishingEstimated,
    }));
    expect(order[0].total).toBeGreaterThan(order[1].total);
    expect(order[1].total).toBeGreaterThan(order[2].total);
  });
});