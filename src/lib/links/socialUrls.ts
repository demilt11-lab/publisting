/**
 * Canonical social profile URL builder + sanitizer.
 *
 * Two responsibilities:
 *  1. `buildProfileUrl(platform, handle|id)` — given a stored handle / channel
 *     ID / username, return the correct profile URL for that platform.
 *  2. `sanitizeSocialUrl(url)` — given an arbitrary URL we've stored, detect the
 *     platform, strip junk (tracking params, locale prefixes, redirect
 *     wrappers), and return either a clean canonical URL or a safe search
 *     fallback when the URL is broken / known-bad.
 *
 * Used by SocialProfilesPanel and `safeOpen.openExternalLink` so every
 * social link click is normalized before it leaves the app.
 */

export type SocialPlatformId =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "twitter"
  | "facebook"
  | "soundcloud"
  | "spotify"
  | "threads";

const HOST_TO_PLATFORM: Array<[RegExp, SocialPlatformId]> = [
  [/(?:^|\.)instagram\.com$/i, "instagram"],
  [/(?:^|\.)tiktok\.com$/i, "tiktok"],
  [/(?:^|\.)youtube\.com$/i, "youtube"],
  [/(?:^|\.)youtu\.be$/i, "youtube"],
  [/(?:^|\.)x\.com$/i, "twitter"],
  [/(?:^|\.)twitter\.com$/i, "twitter"],
  [/(?:^|\.)facebook\.com$/i, "facebook"],
  [/(?:^|\.)fb\.com$/i, "facebook"],
  [/(?:^|\.)soundcloud\.com$/i, "soundcloud"],
  [/(?:^|\.)open\.spotify\.com$/i, "spotify"],
  [/(?:^|\.)threads\.net$/i, "threads"],
];

export function detectPlatformFromUrl(url: string): SocialPlatformId | null {
  try {
    const host = new URL(url).host.toLowerCase();
    for (const [re, id] of HOST_TO_PLATFORM) if (re.test(host)) return id;
  } catch { /* not a URL */ }
  return null;
}

const YT_CHANNEL_RE = /^UC[\w-]{20,}$/;

function cleanHandle(raw: string): string {
  return raw.replace(/^@+/, "").trim();
}

/** Build a canonical profile URL from a stored handle / id for the platform. */
export function buildProfileUrl(
  platform: SocialPlatformId,
  handleOrId: string | null | undefined,
): string | null {
  if (!handleOrId) return null;
  const raw = String(handleOrId).trim();
  if (!raw) return null;

  // If the caller already passed a full URL, sanitize it instead.
  if (/^https?:\/\//i.test(raw)) {
    const sanitized = sanitizeSocialUrl(raw);
    return sanitized?.url ?? null;
  }

  const h = cleanHandle(raw);
  if (!h) return null;
  const enc = encodeURIComponent(h);

  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${enc}/`;
    case "tiktok":
      // TikTok ALWAYS requires the @ prefix; without it the page 404s.
      return `https://www.tiktok.com/@${enc}`;
    case "youtube":
      // Three valid stored shapes: channel ID (UC…), legacy username, or @handle.
      if (YT_CHANNEL_RE.test(h)) return `https://www.youtube.com/channel/${h}`;
      // Strip any leading "channel/", "c/", "user/" the caller passed by accident.
      const stripped = h.replace(/^(channel|c|user)\//i, "");
      if (YT_CHANNEL_RE.test(stripped)) return `https://www.youtube.com/channel/${stripped}`;
      return `https://www.youtube.com/@${encodeURIComponent(stripped)}`;
    case "twitter":
      return `https://x.com/${enc}`;
    case "facebook":
      return `https://www.facebook.com/${enc}`;
    case "soundcloud":
      return `https://soundcloud.com/${enc}`;
    case "spotify":
      // Spotify handles are 22-char base62 IDs, e.g. 06HL4z0CvFAxyc27GXpf02.
      return `https://open.spotify.com/artist/${enc}`;
    case "threads":
      return `https://www.threads.net/@${enc}`;
    default:
      return null;
  }
}

/** Build a safe public search URL when no canonical profile can be built. */
export function buildSearchUrl(platform: SocialPlatformId, query: string): string {
  const q = (query || "").trim();
  switch (platform) {
    case "instagram":
      return `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${q}`)}`;
    case "tiktok":
      return `https://www.tiktok.com/search/user?q=${encodeURIComponent(q)}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    case "twitter":
      return `https://x.com/search?q=${encodeURIComponent(q)}&f=user`;
    case "facebook":
      return `https://www.google.com/search?q=${encodeURIComponent(`site:facebook.com ${q}`)}`;
    case "soundcloud":
      return `https://soundcloud.com/search/people?q=${encodeURIComponent(q)}`;
    case "spotify":
      return `https://open.spotify.com/search/${encodeURIComponent(q)}/artists`;
    case "threads":
      return `https://www.google.com/search?q=${encodeURIComponent(`site:threads.net ${q}`)}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }
}

/**
 * Strip tracking params, locale prefixes, and known-broken paths from a social
 * URL. Returns `{ url, platform, suspicious }` or null if the input isn't a
 * recognizable HTTP URL.
 */
export function sanitizeSocialUrl(input: string | null | undefined): {
  url: string;
  platform: SocialPlatformId | null;
  suspicious: boolean;
} | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  let u: URL;
  try { u = new URL(trimmed); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  // Drop common analytics params on every host.
  const TRACKING = [
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "igshid", "igsh", "ref_src", "ref_url", "_branch_match_id",
    "si", "feature",
  ];
  TRACKING.forEach((k) => u.searchParams.delete(k));

  const platform = detectPlatformFromUrl(u.toString());
  let suspicious = false;

  if (platform === "instagram") {
    // Strip /reels, /tagged, locale prefixes, etc. Keep only the username.
    const segments = u.pathname.split("/").filter(Boolean);
    const username = segments[0];
    if (username && !["explore", "p", "reel", "reels", "stories", "tv", "accounts"].includes(username.toLowerCase())) {
      u.pathname = `/${username}/`;
    } else if (!username) {
      suspicious = true;
    } else {
      // Non-profile IG URL (e.g. a post). Treat as suspicious so the safe-link
      // layer can fall back if the caller hasn't verified it.
      suspicious = true;
    }
  } else if (platform === "tiktok") {
    // Canonical form: tiktok.com/@handle. Older URLs sometimes drop the @.
    const segments = u.pathname.split("/").filter(Boolean);
    const first = segments[0];
    if (first && first.startsWith("@")) {
      u.pathname = `/${first}`;
    } else if (first && !["search", "trending", "discover", "video", "tag", "music"].includes(first.toLowerCase())) {
      u.pathname = `/@${first}`;
    } else {
      suspicious = true;
    }
  } else if (platform === "youtube") {
    const segments = u.pathname.split("/").filter(Boolean);
    const first = segments[0] || "";
    // youtu.be/<id> → watch URL
    if (u.host.toLowerCase().endsWith("youtu.be") && first) {
      return {
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(first)}`,
        platform: "youtube",
        suspicious: false,
      };
    }
    if (first.toLowerCase() === "channel" && segments[1]) {
      // /channel/UC… is canonical.
      u.pathname = `/channel/${segments[1]}`;
    } else if (first.toLowerCase() === "user" && segments[1]) {
      // Legacy /user/<name> still resolves; leave as-is.
      u.pathname = `/user/${segments[1]}`;
    } else if (first.toLowerCase() === "c" && segments[1]) {
      // Legacy /c/<name> custom URL — still works.
      u.pathname = `/c/${segments[1]}`;
    } else if (first.startsWith("@")) {
      u.pathname = `/${first}`;
    } else if (first === "watch" || first === "shorts" || first === "results") {
      // Not a profile but a working YouTube URL — leave alone.
    } else if (!first) {
      suspicious = true;
    }
  } else if (platform === "twitter") {
    // Always normalize to x.com — twitter.com still redirects but slower.
    u.host = "x.com";
    const segments = u.pathname.split("/").filter(Boolean);
    const first = segments[0];
    if (!first) suspicious = true;
  } else if (platform === "facebook") {
    // FB sometimes wraps real links: /flx/warn/?u=<encoded>. Unwrap.
    if (u.pathname.startsWith("/flx/warn") && u.searchParams.get("u")) {
      const inner = u.searchParams.get("u")!;
      try { return sanitizeSocialUrl(decodeURIComponent(inner)); } catch { /* fall through */ }
    }
    const segments = u.pathname.split("/").filter(Boolean);
    if (!segments[0]) suspicious = true;
  } else if (platform === "spotify") {
    // Drop /intl-xx/ locale prefixes that frequently break.
    u.pathname = u.pathname.replace(/^\/intl-[a-z]{2}\//i, "/");
  }

  return { url: u.toString(), platform, suspicious };
}

/**
 * One-call helper for UI components: take a stored handle/url for a platform
 * and return the safest public URL we can produce. Falls back to a search
 * query (built from `displayName`) only when nothing canonical is available.
 */
export function safeProfileUrl(
  platform: SocialPlatformId,
  handleOrUrl: string | null | undefined,
  displayName?: string | null,
): string | null {
  if (!handleOrUrl) {
    return displayName ? buildSearchUrl(platform, displayName) : null;
  }
  const built = buildProfileUrl(platform, handleOrUrl);
  if (built) {
    const sanitized = sanitizeSocialUrl(built);
    if (sanitized && !sanitized.suspicious) return sanitized.url;
    return built;
  }
  return displayName ? buildSearchUrl(platform, displayName) : null;
}