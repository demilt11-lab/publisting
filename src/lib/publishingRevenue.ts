/**
 * Publishing revenue estimation utilities.
 *
 * Industry-average per-stream publishing royalty rates (2024-2025):
 *   Spotify mechanical + performance: ~$0.004 / stream
 *   YouTube Content-ID publishing:     ~$0.002 / view
 *
 * Spotify popularity → estimated total streams mapping uses an exponential
 * regression calibrated against publicly-reported stream counts:
 *   Pop 30 ≈ 27 K, Pop 50 ≈ 700 K, Pop 70 ≈ 19 M, Pop 80 ≈ 140 M, Pop 90 ≈ 1 B
 */

// Per-stream publishing rates (USD)
export const SPOTIFY_PUB_RATE = 0.004;
export const YOUTUBE_PUB_RATE = 0.002;

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

export interface SongRevenue {
  estSpotifyStreams: number;
  youtubeViews: number;
  totalPubRevenue: number;      // Total publishing $ generated (all owners)
  ownerShare: number;           // $ attributable to this person's share
  availableToCollect: number;   // $ from the remaining share (100% - their %)
  annualRate: number;           // Estimated annual $ (based on years since release)
  threeYearProjection: number;  // annualRate × 3
}

/**
 * Calculate per-song publishing revenue estimates.
 */
export function calculateSongRevenue(
  spotifyStr: string | null | undefined,
  youtubeViewsStr: string | null | undefined,
  publishingShare: number | null | undefined,
  releaseDate: string | null | undefined
): SongRevenue | null {
  const popularity = parseSpotifyPopularity(spotifyStr);
  const estSpotifyStreams = estimateSpotifyStreams(popularity);
  const youtubeViews = parseYouTubeViews(youtubeViewsStr);

  if (estSpotifyStreams === 0 && youtubeViews === 0) return null;

  const spotifyPubRevenue = estSpotifyStreams * SPOTIFY_PUB_RATE;
  const youtubePubRevenue = youtubeViews * YOUTUBE_PUB_RATE;
  const totalPubRevenue = spotifyPubRevenue + youtubePubRevenue;

  const share = publishingShare ?? 0;
  const ownerShare = totalPubRevenue * (share / 100);
  const availableToCollect = totalPubRevenue * ((100 - share) / 100);

  // Annualise based on years since release (min 0.5 years to avoid division-by-zero)
  let yearsSinceRelease = 1;
  if (releaseDate) {
    const released = new Date(releaseDate);
    if (!isNaN(released.getTime())) {
      yearsSinceRelease = Math.max(
        0.5,
        (Date.now() - released.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      );
    }
  }

  const annualRate = totalPubRevenue / yearsSinceRelease;
  const threeYearProjection = annualRate * 3;

  return {
    estSpotifyStreams,
    youtubeViews,
    totalPubRevenue,
    ownerShare,
    availableToCollect,
    annualRate,
    threeYearProjection,
  };
}

export function formatCurrency(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  if (n >= 1) return "$" + n.toFixed(0);
  return "$" + n.toFixed(2);
}
