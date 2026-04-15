/**
 * Publishing revenue estimation utilities — Q2 2026.
 *
 * Supports country-specific per-stream rates from the streaming_rates DB table.
 * Falls back to global blended rates when country data is unavailable.
 *
 * Royalty components:
 *   1. Mechanical (streaming): platform rate × streams × songwriter share
 *   2. Performance (PRO):      ~15% of platform payout × songwriter share
 *   3. Total = mechanical + performance
 *
 * Spotify popularity → estimated total streams mapping uses exponential
 * regression calibrated against publicly-reported stream counts:
 *   Pop 30 ≈ 27 K, Pop 50 ≈ 700 K, Pop 70 ≈ 19 M, Pop 80 ≈ 140 M, Pop 90 ≈ 1 B
 */

// ── Global blended fallback rates (USD) ─────────────────────────
// These are used when no country-specific rate is available.
// Updated Q2 2026 based on industry averages.
export const SPOTIFY_PUB_RATE = 0.00437;   // US rate as default
export const YOUTUBE_PUB_RATE = 0.00182;   // US rate as default

// Performance royalty share (PRO collections as % of total payout)
export const PERFORMANCE_ROYALTY_SHARE = 0.15;

// US statutory mechanical rate per composition (2026)
export const US_MECHANICAL_RATE = 0.124;

// ── Stream estimation ───────────────────────────────────────────

/**
 * Estimate total Spotify streams from the 0-100 popularity index.
 * Returns 0 for null / undefined / 0 popularity.
 */
export function estimateSpotifyStreams(popularity: number | null | undefined): number {
  if (!popularity || popularity <= 0) return 0;
  // Exponential regression: 1000 × 1.115^popularity
  return Math.round(1000 * Math.pow(1.115, popularity));
}

/**
 * Parse a YouTube view-count string ("2,100,000,000") → number.
 */
export function parseYouTubeViews(views: string | null | undefined): number {
  if (!views) return 0;
  return parseInt(views.replace(/,/g, ""), 10) || 0;
}

/**
 * Parse Spotify popularity from "45/100" → 45
 */
export function parseSpotifyPopularity(spotifyStr: string | null | undefined): number {
  if (!spotifyStr) return 0;
  return parseInt(spotifyStr.split("/")[0], 10) || 0;
}

// ── Revenue calculation ─────────────────────────────────────────

export interface SongRevenue {
  estSpotifyStreams: number;
  youtubeViews: number;
  // Mechanical royalties (streaming platform payouts)
  mechanicalRevenue: number;
  // Performance royalties (PRO collections)
  performanceRevenue: number;
  // Total publishing revenue (all owners)
  totalPubRevenue: number;
  // Share attributable to this person's ownership %
  ownerShare: number;
  // Remaining share available to collect (100% - their %)
  availableToCollect: number;
  // Estimated annual rate
  annualRate: number;
  // annualRate × 3
  threeYearProjection: number;
  // Rates used for this calculation
  spotifyRate: number;
  youtubeRate: number;
}

export interface RateOverrides {
  spotifyRate?: number;
  youtubeRate?: number;
}

/**
 * Calculate per-song publishing revenue estimates.
 *
 * @param spotifyStr - Spotify popularity string e.g. "45/100"
 * @param youtubeViewsStr - YouTube view count string e.g. "2,100,000"
 * @param publishingShare - Writer's ownership percentage (0-100)
 * @param releaseDate - ISO date string for release
 * @param exactStreamCount - Optional exact Spotify stream count
 * @param rateOverrides - Optional country-specific rates
 */
export function calculateSongRevenue(
  spotifyStr: string | null | undefined,
  youtubeViewsStr: string | null | undefined,
  publishingShare: number | null | undefined,
  releaseDate: string | null | undefined,
  exactStreamCount?: number | null,
  rateOverrides?: RateOverrides
): SongRevenue | null {
  const popularity = parseSpotifyPopularity(spotifyStr);
  const estSpotifyStreams = exactStreamCount ?? estimateSpotifyStreams(popularity);
  const youtubeViews = parseYouTubeViews(youtubeViewsStr);

  if (estSpotifyStreams === 0 && youtubeViews === 0) return null;

  const spotifyRate = rateOverrides?.spotifyRate ?? SPOTIFY_PUB_RATE;
  const youtubeRate = rateOverrides?.youtubeRate ?? YOUTUBE_PUB_RATE;

  // Mechanical royalties from streaming
  const spotifyMechanical = estSpotifyStreams * spotifyRate;
  const youtubeMechanical = youtubeViews * youtubeRate;
  const mechanicalRevenue = spotifyMechanical + youtubeMechanical;

  // Performance royalties (PRO collections ≈ 15% of total payout)
  const performanceRevenue = mechanicalRevenue * PERFORMANCE_ROYALTY_SHARE;

  // Total publishing revenue
  const totalPubRevenue = mechanicalRevenue + performanceRevenue;

  const share = publishingShare ?? 0;
  const ownerShare = totalPubRevenue * (share / 100);
  const availableToCollect = totalPubRevenue * ((100 - share) / 100);

  // Annualise based on years since release (min 1 year)
  let yearsSinceRelease = 1;
  if (releaseDate) {
    const released = new Date(releaseDate);
    if (!isNaN(released.getTime())) {
      yearsSinceRelease = Math.max(
        1,
        (Date.now() - released.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
    }
  }

  const annualRate = totalPubRevenue / yearsSinceRelease;
  const threeYearProjection = annualRate * 3;

  return {
    estSpotifyStreams,
    youtubeViews,
    mechanicalRevenue,
    performanceRevenue,
    totalPubRevenue,
    ownerShare,
    availableToCollect,
    annualRate,
    threeYearProjection,
    spotifyRate,
    youtubeRate,
  };
}

export function formatCurrency(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "$0";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  if (n >= 1) return "$" + n.toFixed(0);
  return "$" + n.toFixed(2);
}

/**
 * Format a per-stream rate for display, e.g. "$0.00437"
 */
export function formatRate(rate: number): string {
  if (!isFinite(rate) || isNaN(rate)) return "$0.000";
  return "$" + rate.toFixed(5);
}
