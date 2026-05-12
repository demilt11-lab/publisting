import { supabase } from "@/integrations/supabase/client";

/**
 * Hosts that are known to either return 403 / refuse iframes / require auth
 * or that we have observed routinely failing for unverified deep links.
 * When a URL points at one of these AND we have no `verified` confirmation,
 * we fall back to a safe search URL instead of opening the broken link.
 */
const KNOWN_FRAGILE_HOSTS = [
  "instagram.com",
  "www.instagram.com",
  "facebook.com",
  "www.facebook.com",
  "tiktok.com",
  "www.tiktok.com",
  "x.com",
  "twitter.com",
  "www.twitter.com",
  "repertoire.bmi.com",
  "www.ascap.com",
  "ascap.com",
  "www.sesac.com",
  "sesac.com",
  "portal.themlc.com",
  "www.soundexchange.com",
  "soundexchange.com",
];

function buildBingFallback(query: string): string {
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
}

function buildSearchFallback(label: string, name: string, host?: string): string {
  const q = name?.trim() || label;
  const lower = (host || "").toLowerCase();
  if (lower.includes("instagram.com")) {
    // Instagram's in-app keyword search URL requires login and typically 404s
    // when opened directly. Route through Google site search instead so the
    // user lands on a working result.
    return `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${q}`)}`;
  }
  if (lower.includes("tiktok.com")) {
    return `https://www.tiktok.com/search/user?q=${encodeURIComponent(q)}`;
  }
  if (lower.includes("youtube.com")) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  }
  if (lower.includes("facebook.com")) {
    return `https://www.facebook.com/search/people/?q=${encodeURIComponent(q)}`;
  }
  if (lower.includes("x.com") || lower.includes("twitter.com")) {
    return `https://x.com/search?q=${encodeURIComponent(q)}&f=user`;
  }
  if (lower.includes("ascap.com")) {
    return `https://www.ascap.com/repertory#ace/search/title/${encodeURIComponent(q)}`;
  }
  if (lower.includes("bmi.com")) {
    return `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${encodeURIComponent(q)}&Main_Search=Title&Sub_Search=Title&Page_Number=0&View_Count=20&Search_Type=all`;
  }
  if (lower.includes("sesac.com")) {
    return `https://www.google.com/search?q=${encodeURIComponent("site:sesac.com " + q)}`;
  }
  if (lower.includes("themlc.com")) {
    return `https://www.google.com/search?q=${encodeURIComponent("site:themlc.com " + q)}`;
  }
  if (lower.includes("soundexchange.com")) {
    return `https://www.google.com/search?q=${encodeURIComponent("site:soundexchange.com " + q)}`;
  }
  return buildBingFallback(`${label} ${q}`);
}

export interface ExternalLinkClickInfo {
  url: string | null | undefined;
  label: string;
  name?: string;
  category?: "social" | "music" | "info" | "pro" | "registry" | "other";
  context?: string;
  verified?: boolean;
}

/** Fire-and-forget logger. Never throws. */
export function logExternalLinkEvent(info: {
  url: string;
  status: "ok" | "fallback" | "blocked" | "null";
  label?: string;
  category?: string;
  context?: string;
  fallback_used?: boolean;
  fallback_url?: string | null;
  reason?: string;
}) {
  try {
    let host: string | undefined;
    try { host = new URL(info.url).host; } catch { /* ignore */ }
    const payload = {
      url: info.url,
      host,
      label: info.label || null,
      category: info.category || null,
      context: info.context || (typeof window !== "undefined" ? window.location.pathname : null),
      status: info.status,
      fallback_used: !!info.fallback_used,
      fallback_url: info.fallback_url || null,
      reason: info.reason || null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    };
    // @ts-ignore – table is logged, not in generated types yet
    supabase.from("external_link_events").insert(payload).then(() => {}, () => {});
  } catch {
    /* swallow */
  }
}

function isFragile(url: string): boolean {
  try {
    const host = new URL(url).host.toLowerCase();
    return KNOWN_FRAGILE_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

/**
 * Validate and rewrite a URL before opening:
 *  - null/empty -> route to a safe search fallback (logged as "null")
 *  - unverified link to a known-fragile host -> route to safe search (logged as "fallback")
 *  - otherwise pass through (logged as "ok")
 */
export function resolveSafeLink(info: ExternalLinkClickInfo): { url: string; status: "ok" | "fallback" | "null"; fallback_used: boolean } {
  const { url, label, name, verified } = info;
  if (!url) {
    const fb = buildSearchFallback(label, name || label);
    return { url: fb, status: "null", fallback_used: true };
  }
  if (!verified && isFragile(url)) {
    let host: string | undefined;
    try { host = new URL(url).host; } catch { /* */ }
    // The fragile host already had a fallback search baked in (e.g. Instagram
    // search keyword URLs). Only rewrite if the URL looks like a deep profile,
    // not already a search page.
    if (/\/(search|results|explore|find)/i.test(url)) {
      return { url, status: "ok", fallback_used: false };
    }
    const fb = buildSearchFallback(label, name || label, host);
    return { url: fb, status: "fallback", fallback_used: true };
  }
  return { url, status: "ok", fallback_used: false };
}

/**
 * Open a link in a new tab, escaping the Lovable preview iframe and logging
 * the click. Use everywhere external DSP/social/PRO links are surfaced.
 */
export function openExternalLink(info: ExternalLinkClickInfo) {
  const resolved = resolveSafeLink(info);
  logExternalLinkEvent({
    url: info.url || "",
    status: resolved.status,
    label: info.label,
    category: info.category,
    context: info.context,
    fallback_used: resolved.fallback_used,
    fallback_url: resolved.fallback_used ? resolved.url : null,
    reason: resolved.status === "null" ? "missing_url" : resolved.status === "fallback" ? "unverified_fragile_host" : undefined,
  });
  if (typeof window !== "undefined") {
    window.open(resolved.url, "_blank", "noopener,noreferrer");
  }
}
