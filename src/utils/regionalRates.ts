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
  US_UK: {
    youtube: 0.001735,
    spotify: 0.004245,
    appleMusic: 0.0095,
    marketMultiple: { min: 15, max: 20, default: 18 },
    discountRate: { min: 10, max: 12, default: 11 },
    label: "US / UK",
  },
  US: {
    youtube: 0.00182,
    spotify: 0.00437,
    appleMusic: 0.01,
    marketMultiple: { min: 15, max: 20, default: 18 },
    discountRate: { min: 10, max: 12, default: 11 },
    label: "United States",
  },
  India: {
    youtube: 0.00042,
    spotify: 0.00089,
    appleMusic: 0.005,
    marketMultiple: { min: 8, max: 12, default: 10 },
    discountRate: { min: 15, max: 20, default: 18 },
    label: "India",
  },
  UK: {
    youtube: 0.00165,
    spotify: 0.00412,
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
    youtube: 0.00046333,
    spotify: 0.00115375,
    appleMusic: 0.004,
    marketMultiple: { min: 6, max: 10, default: 8 },
    discountRate: { min: 18, max: 25, default: 22 },
    label: "Africa",
  },
  LatAm: {
    youtube: 0.000656,
    spotify: 0.00165583,
    appleMusic: 0.006,
    marketMultiple: { min: 8, max: 14, default: 11 },
    discountRate: { min: 14, max: 18, default: 16 },
    label: "Latin America",
  },
  Global: {
    youtube: 0.00103028,
    spotify: 0.00236132,
    appleMusic: 0.007,
    marketMultiple: { min: 10, max: 15, default: 12 },
    discountRate: { min: 12, max: 16, default: 14 },
    label: "Global Average",
  },
};

/** Map CatalogAnalysis RegionKeys to valuation region keys */
const REGION_KEY_MAP: Record<string, string> = {
  us_uk: "US_UK",
  usuk: "US_UK",
  "us / uk": "US_UK",
  US_UK: "US_UK",
  africa: "Africa",
  india: "India",
  latam: "LatAm",
  global_blended: "Global",
};

export function resolveValuationRegion(regionKey: string): string {
  const normalized = (regionKey || "").trim();
  return REGION_KEY_MAP[normalized] || REGION_KEY_MAP[normalized.toLowerCase()] || normalized || "Global";
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
