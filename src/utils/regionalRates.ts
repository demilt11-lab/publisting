/**
 * Region-specific streaming rates, market multiples, and discount rates
 * for accurate catalog valuation across global markets.
 */

export interface RegionalValuationConfig {
  youtube: number;
  spotify: number;
  appleMusic: number;
  marketMultiple: { min: number; max: number; default: number };
  discountRate: { min: number; max: number; default: number };
  label: string;
}

export const REGIONAL_STREAMING_RATES: Record<string, RegionalValuationConfig> = {
  US: {
    youtube: 0.0007,
    spotify: 0.004,
    appleMusic: 0.01,
    marketMultiple: { min: 15, max: 20, default: 18 },
    discountRate: { min: 10, max: 12, default: 11 },
    label: "United States",
  },
  India: {
    youtube: 0.0002,
    spotify: 0.0015,
    appleMusic: 0.005,
    marketMultiple: { min: 8, max: 12, default: 10 },
    discountRate: { min: 15, max: 20, default: 18 },
    label: "India",
  },
  UK: {
    youtube: 0.0006,
    spotify: 0.0038,
    appleMusic: 0.009,
    marketMultiple: { min: 14, max: 18, default: 16 },
    discountRate: { min: 10, max: 12, default: 11 },
    label: "United Kingdom",
  },
  Brazil: {
    youtube: 0.0003,
    spotify: 0.002,
    appleMusic: 0.006,
    marketMultiple: { min: 8, max: 14, default: 11 },
    discountRate: { min: 14, max: 18, default: 16 },
    label: "Brazil",
  },
  Canada: {
    youtube: 0.00065,
    spotify: 0.0037,
    appleMusic: 0.009,
    marketMultiple: { min: 14, max: 18, default: 16 },
    discountRate: { min: 10, max: 12, default: 11 },
    label: "Canada",
  },
  Africa: {
    youtube: 0.00015,
    spotify: 0.001,
    appleMusic: 0.004,
    marketMultiple: { min: 6, max: 10, default: 8 },
    discountRate: { min: 18, max: 25, default: 22 },
    label: "Africa",
  },
  LatAm: {
    youtube: 0.0003,
    spotify: 0.002,
    appleMusic: 0.006,
    marketMultiple: { min: 8, max: 14, default: 11 },
    discountRate: { min: 14, max: 18, default: 16 },
    label: "Latin America",
  },
  Global: {
    youtube: 0.0004,
    spotify: 0.0025,
    appleMusic: 0.007,
    marketMultiple: { min: 10, max: 15, default: 12 },
    discountRate: { min: 12, max: 16, default: 14 },
    label: "Global Average",
  },
};

/** Map CatalogAnalysis RegionKeys to valuation region keys */
const REGION_KEY_MAP: Record<string, string> = {
  us_uk: "US",
  africa: "Africa",
  india: "India",
  latam: "LatAm",
  global_blended: "Global",
};

export function resolveValuationRegion(regionKey: string): string {
  return REGION_KEY_MAP[regionKey] || regionKey || "Global";
}

export function getRegionalConfig(region: string): RegionalValuationConfig {
  return REGIONAL_STREAMING_RATES[region] || REGIONAL_STREAMING_RATES["Global"];
}

export function getRegionalRate(region: string, platform: string): number {
  const config = getRegionalConfig(region);
  const key = platform.toLowerCase() as keyof Pick<RegionalValuationConfig, "youtube" | "spotify" | "appleMusic">;
  return config[key] ?? config.youtube;
}

export function getRegionalMultiple(region: string, scenario: "min" | "max" | "default" = "default"): number {
  return getRegionalConfig(region).marketMultiple[scenario];
}

export function getRegionalDiscount(region: string, scenario: "min" | "max" | "default" = "default"): number {
  return getRegionalConfig(region).discountRate[scenario];
}

/**
 * Detect the dominant region from a list of songs based on their country field.
 * Falls back to "Global" if no clear majority.
 */
export function detectDominantRegion(songs: Array<{ country?: string; regionOverride?: string }>): string {
  const counts: Record<string, number> = {};
  for (const s of songs) {
    const region = s.country || s.regionOverride || "Global";
    const mapped = resolveValuationRegion(region);
    counts[mapped] = (counts[mapped] || 0) + 1;
  }
  let best = "Global";
  let bestCount = 0;
  for (const [region, count] of Object.entries(counts)) {
    if (count > bestCount) { best = region; bestCount = count; }
  }
  return best;
}

export const REGION_OPTIONS = Object.entries(REGIONAL_STREAMING_RATES).map(([key, config]) => ({
  value: key,
  label: config.label,
}));
