import { describe, it, expect } from 'vitest';
import {
  getRegionalPublishingRates,
  getRateForCountry,
  getBlendedRate,
  type StreamingRate,
} from '@/lib/api/streamingRates';

/**
 * Validation tests for regional streaming rate logic.
 *
 * Guards against regressions where:
 *  - India falls back to blended Asia (which inflates due to JP/KR rates)
 *  - US/UK gets diluted by broader North America/Europe regional averages
 *  - Any region accidentally falls back to the global blended rate when
 *    a specific country benchmark exists in the dataset.
 */

function makeRate(
  platform: 'spotify' | 'youtube',
  country_code: string,
  region: string | null,
  rate_per_stream: number,
  overrides: Partial<StreamingRate> = {}
): StreamingRate {
  return {
    id: `${platform}-${country_code}`,
    platform,
    country_code,
    region,
    rate_per_stream,
    currency: 'USD',
    effective_from: '2026-01-01',
    effective_to: null,
    quarter: '2026-Q2',
    source: 'test',
    verified: true,
    notes: null,
    ...overrides,
  };
}

// Realistic Q2 2026 benchmarks. India is significantly lower than US/GB,
// while JP/KR are high enough to skew an Asia-wide blended average upward.
const FIXTURE_RATES: StreamingRate[] = [
  // North America
  makeRate('spotify', 'US', 'north_america', 0.00420),
  makeRate('youtube', 'US', 'north_america', 0.00180),
  makeRate('spotify', 'CA', 'north_america', 0.00390),
  makeRate('youtube', 'CA', 'north_america', 0.00160),
  // Europe
  makeRate('spotify', 'GB', 'europe', 0.00410),
  makeRate('youtube', 'GB', 'europe', 0.00170),
  makeRate('spotify', 'DE', 'europe', 0.00380),
  makeRate('youtube', 'DE', 'europe', 0.00150),
  // Asia (India low, Japan/Korea high — would skew blended Asia)
  makeRate('spotify', 'IN', 'asia', 0.00089),
  makeRate('youtube', 'IN', 'asia', 0.00042),
  makeRate('spotify', 'JP', 'asia', 0.00450),
  makeRate('youtube', 'JP', 'asia', 0.00200),
  makeRate('spotify', 'KR', 'asia', 0.00400),
  makeRate('youtube', 'KR', 'asia', 0.00180),
  // Latin America
  makeRate('spotify', 'BR', 'latin_america', 0.00120),
  makeRate('youtube', 'BR', 'latin_america', 0.00050),
  makeRate('spotify', 'MX', 'latin_america', 0.00130),
  makeRate('youtube', 'MX', 'latin_america', 0.00055),
  // Africa
  makeRate('spotify', 'ZA', 'africa', 0.00110),
  makeRate('youtube', 'ZA', 'africa', 0.00045),
  // Middle East
  makeRate('spotify', 'AE', 'middle_east', 0.00200),
  makeRate('youtube', 'AE', 'middle_east', 0.00080),
  // Oceania
  makeRate('spotify', 'AU', 'oceania', 0.00350),
  makeRate('youtube', 'AU', 'oceania', 0.00150),
  // Default tier fallbacks
  makeRate('spotify', 'DEFAULT_T2', null, 0.00300),
  makeRate('youtube', 'DEFAULT_T2', null, 0.00120),
];

describe('streaming rate validation', () => {
  describe('getRegionalPublishingRates', () => {
    const result = getRegionalPublishingRates(FIXTURE_RATES);

    it('produces a rate profile for every required region key', () => {
      const requiredKeys = ['africa', 'us_uk', 'india', 'latam', 'middle_east', 'global_blended'];
      for (const key of requiredKeys) {
        expect(result[key], `missing region: ${key}`).toBeDefined();
        expect(result[key].spotifyRate).toBeGreaterThan(0);
        expect(result[key].youtubeRate).toBeGreaterThan(0);
      }
    });

    it('maps india EXACTLY to the IN country benchmark (not blended Asia)', () => {
      // India must use only the IN country code. If it averaged with JP/KR,
      // the result would be roughly 3-4x higher.
      expect(result.india.spotifyRate).toBeCloseTo(0.00089, 6);
      expect(result.india.youtubeRate).toBeCloseTo(0.00042, 6);
    });

    it('maps us_uk EXACTLY to the average of US and GB (not full continents)', () => {
      const expectedSpotify = (0.00420 + 0.00410) / 2;
      const expectedYoutube = (0.00180 + 0.00170) / 2;
      expect(result.us_uk.spotifyRate).toBeCloseTo(expectedSpotify, 6);
      expect(result.us_uk.youtubeRate).toBeCloseTo(expectedYoutube, 6);
    });

    it('keeps US/UK rates significantly higher than India', () => {
      // Sanity check: protects against any future inversion bug.
      expect(result.us_uk.spotifyRate).toBeGreaterThan(result.india.spotifyRate * 3);
      expect(result.us_uk.youtubeRate).toBeGreaterThan(result.india.youtubeRate * 3);
    });

    it('does not fall back to global blended rate when country data exists', () => {
      const blendedSpotify = getBlendedRate(FIXTURE_RATES, 'spotify');
      const blendedYoutube = getBlendedRate(FIXTURE_RATES, 'youtube');
      // India is far below the global blend — if it equals blend, fallback fired.
      expect(result.india.spotifyRate).not.toBeCloseTo(blendedSpotify, 5);
      expect(result.india.youtubeRate).not.toBeCloseTo(blendedYoutube, 5);
    });

    it('correctly averages multi-country regions (latam = BR + MX)', () => {
      const expectedSpotify = (0.00120 + 0.00130) / 2;
      const expectedYoutube = (0.00050 + 0.00055) / 2;
      expect(result.latam.spotifyRate).toBeCloseTo(expectedSpotify, 6);
      expect(result.latam.youtubeRate).toBeCloseTo(expectedYoutube, 6);
    });

    it('global_blended sits between the highest and lowest regional rates', () => {
      const allRegional = ['us_uk', 'india', 'latam', 'africa', 'middle_east'].map(
        (k) => result[k].spotifyRate
      );
      expect(result.global_blended.spotifyRate).toBeLessThanOrEqual(Math.max(...allRegional));
      expect(result.global_blended.spotifyRate).toBeGreaterThanOrEqual(Math.min(...allRegional));
    });
  });

  describe('getRateForCountry', () => {
    it('returns the exact country rate when present', () => {
      expect(getRateForCountry(FIXTURE_RATES, 'spotify', 'IN')).toBeCloseTo(0.00089, 6);
      expect(getRateForCountry(FIXTURE_RATES, 'spotify', 'US')).toBeCloseTo(0.00420, 6);
    });

    it('falls back to DEFAULT_T2 only for unknown country codes', () => {
      expect(getRateForCountry(FIXTURE_RATES, 'spotify', 'XX')).toBeCloseTo(0.00300, 6);
    });
  });

  describe('empty/degraded data safety', () => {
    it('does not throw when rates list is empty', () => {
      expect(() => getRegionalPublishingRates([])).not.toThrow();
      const empty = getRegionalPublishingRates([]);
      // Falls back to hardcoded last-resort blended rates
      expect(empty.india.spotifyRate).toBeGreaterThan(0);
      expect(empty.us_uk.spotifyRate).toBeGreaterThan(0);
    });
  });
});