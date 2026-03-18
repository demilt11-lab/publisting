/**
 * SourceProvenance tracks which data sources provided label/publisher/management info.
 * Used for evidence-based confidence in signing status.
 */

export type TrustedSource =
  | "musicbrainz"
  | "genius"
  | "discogs"
  | "apple_music"
  | "spotify"
  | "ascap"
  | "bmi"
  | "sesac"
  | "socan"
  | "prs"
  | "gema"
  | "mlc"
  | "harry_fox"
  | "soundexchange"
  | "official_roster"
  | "deezer"
  | "pro_lookup";

export interface SourceProvenance {
  field: "label" | "publisher" | "management" | "pro" | "ipi";
  value: string;
  source: TrustedSource;
  verified: boolean; // true if from a "trusted" source
}

export interface ProvenanceRecord {
  sources: SourceProvenance[];
}

/**
 * Determine signing confidence from provenance records.
 */
export function getSigningConfidence(
  provenances: SourceProvenance[]
): "high" | "medium" | "low" | "conflicting" {
  if (provenances.length === 0) return "low";

  const publisherSources = provenances.filter((p) => p.field === "publisher");
  const labelSources = provenances.filter((p) => p.field === "label");

  // Check for conflicts
  const uniquePublishers = new Set(publisherSources.map((s) => s.value.toLowerCase()));
  const uniqueLabels = new Set(labelSources.map((s) => s.value.toLowerCase()));

  if (uniquePublishers.size > 1 || uniqueLabels.size > 1) {
    return "conflicting";
  }

  const trustedSources = provenances.filter((p) => p.verified);
  if (trustedSources.length >= 2) return "high";
  if (trustedSources.length === 1) return "medium";
  return "low";
}

/**
 * Validate a social media URL to ensure it points to a real profile,
 * not a search page or invalid location.
 */
export function validateSocialUrl(url: string): {
  valid: boolean;
  platform: string;
  type: "profile" | "company" | "search" | "unknown";
} {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname.toLowerCase();

    // LinkedIn
    if (host.includes("linkedin.com")) {
      if (urlObj.pathname.startsWith("/company/")) {
        return { valid: true, platform: "linkedin", type: "company" };
      }
      if (urlObj.pathname.startsWith("/in/")) {
        return { valid: true, platform: "linkedin", type: "profile" };
      }
      if (urlObj.pathname.includes("/search/")) {
        return { valid: false, platform: "linkedin", type: "search" };
      }
      return { valid: false, platform: "linkedin", type: "unknown" };
    }

    // YouTube
    if (host.includes("youtube.com")) {
      if (urlObj.pathname.startsWith("/@")) {
        return { valid: true, platform: "youtube", type: "profile" };
      }
      if (urlObj.pathname.startsWith("/channel/") || urlObj.pathname.startsWith("/c/")) {
        return { valid: true, platform: "youtube", type: "profile" };
      }
      if (urlObj.pathname.includes("/results")) {
        return { valid: false, platform: "youtube", type: "search" };
      }
      return { valid: false, platform: "youtube", type: "unknown" };
    }

    // TikTok
    if (host.includes("tiktok.com")) {
      if (urlObj.pathname.startsWith("/@")) {
        return { valid: true, platform: "tiktok", type: "profile" };
      }
      if (urlObj.pathname.includes("/search/")) {
        return { valid: false, platform: "tiktok", type: "search" };
      }
      return { valid: false, platform: "tiktok", type: "unknown" };
    }

    // Instagram
    if (host.includes("instagram.com")) {
      const path = urlObj.pathname.replace(/\/$/, "");
      if (path && !path.includes("/explore/") && !path.includes("/search")) {
        return { valid: true, platform: "instagram", type: "profile" };
      }
      return { valid: false, platform: "instagram", type: "search" };
    }

    return { valid: false, platform: "unknown", type: "unknown" };
  } catch {
    return { valid: false, platform: "unknown", type: "unknown" };
  }
}
