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
    const path = urlObj.pathname.replace(/\/$/, "");

    if (host.includes("linkedin.com")) {
      if (path.startsWith("/company/")) {
        return { valid: true, platform: "linkedin", type: "company" };
      }
      if (path.startsWith("/in/")) {
        return { valid: true, platform: "linkedin", type: "profile" };
      }
      if (path.includes("/search/")) {
        return { valid: false, platform: "linkedin", type: "search" };
      }
      return { valid: false, platform: "linkedin", type: "unknown" };
    }

    if (host.includes("youtube.com")) {
      if (path.startsWith("/@") || path.startsWith("/channel/") || path.startsWith("/c/") || path.startsWith("/user/")) {
        return { valid: true, platform: "youtube", type: "profile" };
      }
      if (path.includes("/results")) {
        return { valid: false, platform: "youtube", type: "search" };
      }
      return { valid: false, platform: "youtube", type: "unknown" };
    }

    if (host.includes("tiktok.com")) {
      if (path.startsWith("/@")) {
        return { valid: true, platform: "tiktok", type: "profile" };
      }
      if (path.includes("/search/")) {
        return { valid: false, platform: "tiktok", type: "search" };
      }
      return { valid: false, platform: "tiktok", type: "unknown" };
    }

    if (host.includes("instagram.com")) {
      if (!path || path.includes("/explore/") || path.includes("/search") || path.startsWith("/p/") || path.startsWith("/reel/") || path.startsWith("/tv/") || path.startsWith("/stories/")) {
        return { valid: false, platform: "instagram", type: "search" };
      }
      return { valid: true, platform: "instagram", type: "profile" };
    }

    if (host.includes("x.com") || host.includes("twitter.com")) {
      if (path.includes("/search") || path === "" || path === "/home" || path.startsWith("/i/")) {
        return { valid: false, platform: "twitter", type: "search" };
      }
      return { valid: true, platform: "twitter", type: "profile" };
    }

    if (host.includes("facebook.com")) {
      if (path.includes("/search") || path.startsWith("/watch") || path.startsWith("/share")) {
        return { valid: false, platform: "facebook", type: "search" };
      }
      return { valid: true, platform: "facebook", type: "profile" };
    }

    return { valid: false, platform: "unknown", type: "unknown" };
  } catch {
    return { valid: false, platform: "unknown", type: "unknown" };
  }
}
