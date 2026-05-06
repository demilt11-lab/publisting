import { describe, it, expect, vi } from 'vitest';

/**
 * Validation test: ensures per-song contributions sum exactly to the
 * catalog-level totals for "available to collect" (and related fields)
 * across every supported region. Guards against rounding drift, missing
 * songs in the reducer, or double-counting bugs in analyzeCatalog().
 */

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

import { analyzeCatalog, buildRegionalMetrics } from '@/pages/CatalogAnalysis';
import { getRegionalPublishingRates, type StreamingRate } from '@/lib/api/streamingRates';

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
  makeRate('spotify', 'BR', 'latin_america', 0.00120),
  makeRate('youtube', 'BR', 'latin_america', 0.00050),
  makeRate('spotify', 'ZA', 'africa', 0.00110),
  makeRate('youtube', 'ZA', 'africa', 0.00045),
];

// Mixed catalog with varied ownership splits, pre-collected amounts, and
// pre-collected percentages — exercises all three branches of the
// "available to collect" calculation.
const CATALOG = [
  { title: 'A', artist: 'X', spotifyStreams: 10_000_000, youtubeViews: 2_000_000, ownershipPercent: 0.5,  releaseDate: '2024-06-01' },
  { title: 'B', artist: 'X', spotifyStreams: 5_500_000,  youtubeViews: 1_200_000, ownershipPercent: 1.0,  alreadyCollectedAmount: 4500, releaseDate: '2024-09-01' },
  { title: 'C', artist: 'Y', spotifyStreams: 8_750_000,  youtubeViews: 3_500_000, ownershipPercent: 0.25, alreadyCollectedPercent: 0.6, releaseDate: '2025-01-15' },
  { title: 'D', artist: 'Z', spotifyStreams: 2_400_000,  youtubeViews:   800_000, participantCount: 3,     releaseDate: '2025-03-20' },
  { title: 'E', artist: 'Z', spotifyStreams:    50_000,  youtubeViews:    10_000, ownershipPercent: 0.75, releaseDate: '2025-08-01' },
];

const REGIONS = ['us_uk', 'india', 'latam', 'africa', 'global_blended'] as const;

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

describe('per-song totals consistency', () => {
  const dbRates = getRegionalPublishingRates(RATES);
  const metrics = buildRegionalMetrics(dbRates);

  for (const region of REGIONS) {
    describe(`region: ${region}`, () => {
      const result = analyzeCatalog(
        CATALOG,
        { selectedRegion: region, analysisDate: '2026-04-24' },
        metrics
      );
      const included = result.songs.filter((s) => s.included);

      it('per-song "available to collect" sums to catalog total', () => {
        const summed = sum(included.map((s) => s.individualAvailableToCollect));
        // toBeCloseTo with 8 decimal places = effectively exact (sub-cent precision).
        expect(summed).toBeCloseTo(result.totals.totalAvailableToCollect, 8);
      });

      it('per-song "already collected" sums to catalog total', () => {
        const summed = sum(included.map((s) => s.individualAlreadyCollected));
        expect(summed).toBeCloseTo(result.totals.totalAlreadyCollected, 8);
      });

      it('per-song gross share sums to catalog total', () => {
        const summed = sum(included.map((s) => s.individualGrossShare));
        expect(summed).toBeCloseTo(result.totals.totalIndividualGrossShare, 8);
      });

      it('per-song total publishing estimate sums to catalog total', () => {
        const summed = sum(included.map((s) => s.totalPublishingEstimated));
        expect(summed).toBeCloseTo(result.totals.totalPublishingEstimated, 8);
      });

      it('per-song 3-year individual collectible sums to catalog total', () => {
        const summed = sum(included.map((s) => s.forecast.individualThreeYearCollectible));
        expect(summed).toBeCloseTo(result.totals.totalIndividualThreeYearCollectible, 8);
      });

      it('per-song stream/view counts sum to catalog totals', () => {
        expect(sum(included.map((s) => s.spotifyStreams))).toBe(result.totals.spotifyStreams);
        expect(sum(included.map((s) => s.youtubeViews))).toBe(result.totals.youtubeViews);
      });

      it('individualAvailableToCollect is non-negative per song', () => {
        for (const s of included) {
          expect(s.individualAvailableToCollect).toBeGreaterThanOrEqual(0);
        }
      });

      it('individualAlreadyCollected + individualAvailableToCollect ≤ theoretical gross per song', () => {
        // individualGrossShare is now the full theoretical gross.
        // Available-to-collect = uncollected portion × per-song collectibility (≤1).
        // So already-collected + available-to-collect must be ≤ theoretical gross.
        for (const s of included) {
          const combined = s.individualAlreadyCollected + s.individualAvailableToCollect;
          expect(combined).toBeLessThanOrEqual(s.individualGrossShare + 1e-6);
        }
      });
    });
  }

  it('included song count matches totals.totalSongsIncluded for every region', () => {
    for (const region of REGIONS) {
      const r = analyzeCatalog(
        CATALOG,
        { selectedRegion: region, analysisDate: '2026-04-24' },
        metrics
      );
      const includedCount = r.songs.filter((s) => s.included).length;
      expect(includedCount).toBe(r.totals.totalSongsIncluded);
      expect(r.totals.totalSongsInput).toBe(CATALOG.length);
    }
  });
});