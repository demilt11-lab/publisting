import { describe, it, expect, vi } from 'vitest';

/**
 * Coverage test: every included song MUST contribute a finite, numeric value
 * to every field that the catalog totals reducer sums. Guards against:
 *   - new totals fields being added without a per-song mapping
 *   - per-song fields silently becoming `undefined`/`NaN` (which would
 *     poison `sum()` with NaN and corrupt every regional total)
 *   - missing forecast sub-fields
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

// Mixed catalog exercising every code path: zero-stream song, missing
// ownership (defaults), pre-collected amount vs percent, multi-participant
// split, brand-new release, very old release.
const CATALOG = [
  { title: 'A', artist: 'X', spotifyStreams: 10_000_000, youtubeViews: 2_000_000, ownershipPercent: 0.5,  releaseDate: '2024-06-01' },
  { title: 'B', artist: 'X', spotifyStreams: 5_500_000,  youtubeViews: 1_200_000, ownershipPercent: 1.0,  alreadyCollectedAmount: 4500, releaseDate: '2024-09-01' },
  { title: 'C', artist: 'Y', spotifyStreams: 8_750_000,  youtubeViews: 3_500_000, ownershipPercent: 0.25, alreadyCollectedPercent: 0.6, releaseDate: '2025-01-15' },
  { title: 'D', artist: 'Z', spotifyStreams: 2_400_000,  youtubeViews:   800_000, participantCount: 3,     releaseDate: '2025-03-20' },
  { title: 'E', artist: 'Z', spotifyStreams:    50_000,  youtubeViews:    10_000, ownershipPercent: 0.75, releaseDate: '2025-08-01' },
  { title: 'F', artist: 'W', spotifyStreams:         0,  youtubeViews:         0, ownershipPercent: 1.0,  releaseDate: '2026-01-01' },
];

const REGIONS = ['us_uk', 'india', 'latam', 'africa', 'global_blended'] as const;

/**
 * Per-song numeric fields that flow into catalog totals. Adding a new
 * totals field requires adding the corresponding per-song field here AND
 * to the forecast list below — otherwise this test fails loudly.
 */
const REQUIRED_TOP_LEVEL_FIELDS = [
  'spotifyStreams',
  'youtubeViews',
  'spotifyPublishingEstimated',
  'youtubePublishingEstimated',
  'totalPublishingEstimated',
  'ownershipPercent',
  'individualGrossShare',
  'individualAlreadyCollected',
  'individualAvailableToCollect',
] as const;

const REQUIRED_FORECAST_FIELDS = [
  'year1Gross',
  'year2Gross',
  'year3Gross',
  'threeYearGrossTotal',
  'individualYear1Gross',
  'individualYear2Gross',
  'individualYear3Gross',
  'individualThreeYearGross',
  'individualYear1Collectible',
  'individualYear2Collectible',
  'individualYear3Collectible',
  'individualThreeYearCollectible',
] as const;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

describe('per-song field coverage (no missing mappings before summing)', () => {
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

      it('produces at least one included song', () => {
        expect(included.length).toBeGreaterThan(0);
      });

      it('every included song defines every top-level totals-contributing field as a finite number', () => {
        for (const song of included) {
          for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
            const value = (song as unknown as Record<string, unknown>)[field];
            expect(
              isFiniteNumber(value),
              `song "${song.title}" missing/non-finite field "${field}" (got ${String(value)})`
            ).toBe(true);
          }
        }
      });

      it('every included song defines every forecast field as a finite number', () => {
        for (const song of included) {
          expect(song.forecast, `song "${song.title}" missing forecast object`).toBeDefined();
          for (const field of REQUIRED_FORECAST_FIELDS) {
            const value = (song.forecast as unknown as Record<string, unknown>)[field];
            expect(
              isFiniteNumber(value),
              `song "${song.title}" missing/non-finite forecast.${field} (got ${String(value)})`
            ).toBe(true);
          }
        }
      });

      it('every numeric field is non-negative (no negative-revenue leakage into totals)', () => {
        for (const song of included) {
          for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
            const value = (song as unknown as Record<string, number>)[field];
            expect(value, `song "${song.title}" field "${field}" is negative`).toBeGreaterThanOrEqual(0);
          }
          for (const field of REQUIRED_FORECAST_FIELDS) {
            const value = (song.forecast as unknown as Record<string, number>)[field];
            expect(value, `song "${song.title}" forecast.${field} is negative`).toBeGreaterThanOrEqual(0);
          }
        }
      });

      it('every totals field is a finite number (no NaN leakage from missing per-song values)', () => {
        for (const [field, value] of Object.entries(result.totals)) {
          expect(
            isFiniteNumber(value),
            `totals.${field} is non-finite (got ${String(value)}) — likely a missing per-song mapping`
          ).toBe(true);
        }
      });

      it('summing each per-song field equals the matching totals field (no field skipped during reduction)', () => {
        const fieldPairs: Array<[keyof typeof result.totals, (s: typeof included[number]) => number]> = [
          ['spotifyStreams',                     (s) => s.spotifyStreams],
          ['youtubeViews',                       (s) => s.youtubeViews],
          ['totalPublishingEstimated',           (s) => s.totalPublishingEstimated],
          ['totalIndividualGrossShare',          (s) => s.individualGrossShare],
          ['totalAlreadyCollected',              (s) => s.individualAlreadyCollected],
          ['totalAvailableToCollect',            (s) => s.individualAvailableToCollect],
          ['totalYear1Gross',                    (s) => s.forecast.year1Gross],
          ['totalYear2Gross',                    (s) => s.forecast.year2Gross],
          ['totalYear3Gross',                    (s) => s.forecast.year3Gross],
          ['totalThreeYearGross',                (s) => s.forecast.threeYearGrossTotal],
          ['totalIndividualYear1Gross',          (s) => s.forecast.individualYear1Gross],
          ['totalIndividualYear2Gross',          (s) => s.forecast.individualYear2Gross],
          ['totalIndividualYear3Gross',          (s) => s.forecast.individualYear3Gross],
          ['totalIndividualThreeYearGross',      (s) => s.forecast.individualThreeYearGross],
          ['totalIndividualYear1Collectible',    (s) => s.forecast.individualYear1Collectible],
          ['totalIndividualYear2Collectible',    (s) => s.forecast.individualYear2Collectible],
          ['totalIndividualYear3Collectible',    (s) => s.forecast.individualYear3Collectible],
          ['totalIndividualThreeYearCollectible',(s) => s.forecast.individualThreeYearCollectible],
        ];
        for (const [totalsField, picker] of fieldPairs) {
          const summed = included.reduce((acc, s) => acc + picker(s), 0);
          expect(
            summed,
            `sum of per-song values for totals.${String(totalsField)} did not match`
          ).toBeCloseTo(result.totals[totalsField] as number, 6);
        }
      });
    });
  }
});