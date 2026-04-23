import { supabase } from '@/integrations/supabase/client';

export interface StreamingRate {
  id: string;
  platform: string;
  country_code: string;
  region: string | null;
  rate_per_stream: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  quarter: string;
  source: string | null;
  verified: boolean;
  notes: string | null;
}

// In-memory cache with 1-hour TTL
let ratesCache: { data: StreamingRate[]; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch all active streaming rates from the database.
 * Results are cached in-memory for 1 hour.
 */
export async function fetchActiveRates(forceRefresh = false): Promise<StreamingRate[]> {
  if (!forceRefresh && ratesCache && Date.now() - ratesCache.fetchedAt < CACHE_TTL) {
    return ratesCache.data;
  }

  const { data, error } = await supabase
    .from('streaming_rates')
    .select('*')
    .is('effective_to', null)
    .order('platform')
    .order('country_code');

  if (error) {
    console.error('Failed to fetch streaming rates:', error);
    return ratesCache?.data ?? [];
  }

  const rates = (data ?? []).map(r => ({
    ...r,
    rate_per_stream: Number(r.rate_per_stream),
  }));

  ratesCache = { data: rates, fetchedAt: Date.now() };
  return rates;
}

/**
 * Get the per-stream rate for a specific platform and country.
 * Falls back to DEFAULT_T1/T2/T3 tiers, then hardcoded defaults.
 */
export function getRateForCountry(
  rates: StreamingRate[],
  platform: 'spotify' | 'youtube',
  countryCode: string
): number {
  // Exact match
  const exact = rates.find(r => r.platform === platform && r.country_code === countryCode);
  if (exact) return exact.rate_per_stream;

  // Tier default fallback (T2 = middle income as safe default)
  const tierDefault = rates.find(r => r.platform === platform && r.country_code === 'DEFAULT_T2');
  if (tierDefault) return tierDefault.rate_per_stream;

  // Hardcoded last-resort
  return platform === 'spotify' ? 0.00350 : 0.00145;
}

/**
 * Get the weighted average rate for a platform across all countries.
 * Useful for global blended estimates.
 */
export function getBlendedRate(
  rates: StreamingRate[],
  platform: 'spotify' | 'youtube'
): number {
  const platformRates = rates.filter(
    r => r.platform === platform && !r.country_code.startsWith('DEFAULT')
  );
  if (platformRates.length === 0) return platform === 'spotify' ? 0.00350 : 0.00145;
  const sum = platformRates.reduce((s, r) => s + r.rate_per_stream, 0);
  return sum / platformRates.length;
}

/**
 * Get rates grouped by region for a platform.
 */
export function getRatesByRegion(
  rates: StreamingRate[],
  platform: 'spotify' | 'youtube'
): Record<string, { avg: number; countries: StreamingRate[] }> {
  const platformRates = rates.filter(
    r => r.platform === platform && !r.country_code.startsWith('DEFAULT') && r.region
  );

  const grouped: Record<string, StreamingRate[]> = {};
  for (const r of platformRates) {
    const region = r.region!;
    if (!grouped[region]) grouped[region] = [];
    grouped[region].push(r);
  }

  const result: Record<string, { avg: number; countries: StreamingRate[] }> = {};
  for (const [region, list] of Object.entries(grouped)) {
    const avg = list.reduce((s, r) => s + r.rate_per_stream, 0) / list.length;
    result[region] = { avg, countries: list };
  }
  return result;
}

/**
 * Map region keys to their average DB-backed rates.
 * Used to feed REGIONAL_METRICS in CatalogAnalysis.
 */
export function getRegionalPublishingRates(rates: StreamingRate[]): Record<string, {
  spotifyRate: number;
  youtubeRate: number;
}> {
  const spotifyByRegion = getRatesByRegion(rates, 'spotify');
  const youtubeByRegion = getRatesByRegion(rates, 'youtube');

  const regionMap: Record<string, string[]> = {
    africa: ['africa'],
    us_uk: ['north_america', 'europe'],
    india: ['asia_india'],
    latam: ['latin_america'],
    middle_east: ['middle_east'],
    global_blended: ['north_america', 'europe', 'asia', 'latin_america', 'africa', 'middle_east', 'oceania'],
  };

  const result: Record<string, { spotifyRate: number; youtubeRate: number }> = {};

  for (const [key, regions] of Object.entries(regionMap)) {
    const spotifyRates = regions.flatMap(r => spotifyByRegion[r]?.countries ?? []);
    const youtubeRates = regions.flatMap(r => youtubeByRegion[r]?.countries ?? []);

    result[key] = {
      spotifyRate: spotifyRates.length > 0
        ? spotifyRates.reduce((s, r) => s + r.rate_per_stream, 0) / spotifyRates.length
        : getBlendedRate(rates, 'spotify'),
      youtubeRate: youtubeRates.length > 0
        ? youtubeRates.reduce((s, r) => s + r.rate_per_stream, 0) / youtubeRates.length
        : getBlendedRate(rates, 'youtube'),
    };
  }

  return result;
}

/** Get the current quarter string, e.g., "2026-Q2" */
export function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}
