// Shared helpers for Phase 7 Publisting backend functions.
// Keep tiny — each function still imports its own SB client.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

export function err(message: string, status = 400, extra?: Record<string, unknown>) {
  return ok({ error: message, ...(extra ?? {}) }, status);
}

export function detailPathFor(entity_type: string, pub_entity_id: string, primary_role?: string | null): string {
  if (entity_type === "artist") return `/artist/${pub_entity_id}`;
  if (entity_type === "track") return `/track/${pub_entity_id}`;
  if (entity_type === "album") return `/album/${pub_entity_id}`;
  if (entity_type === "creator") {
    if ((primary_role ?? "").toLowerCase() === "producer") return `/producer/${pub_entity_id}`;
    return `/writer/${pub_entity_id}`;
  }
  return `/entity-hub`;
}

export function normalizeName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Parse a music-platform URL into { platform, external_id } or null. */
export function parsePlatformUrl(input: string): { platform: string; external_id: string; entity_hint?: string; canonical_url: string } | null {
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");

  if (host.includes("spotify.com")) {
    const m = path.match(/^\/(?:intl-[a-z]+\/)?(track|artist|album|playlist)\/([A-Za-z0-9]+)/);
    if (m) return { platform: "spotify", entity_hint: m[1], external_id: m[2], canonical_url: `https://open.spotify.com/${m[1]}/${m[2]}` };
  }
  if (host.includes("music.apple.com")) {
    const m = path.match(/^\/[a-z]{2}\/(album|artist|song)\/[^/]+\/(\d+)/);
    if (m) return { platform: "apple", entity_hint: m[1], external_id: m[2], canonical_url: u.toString() };
  }
  if (host.includes("deezer.com")) {
    const m = path.match(/^\/(?:[a-z]{2}\/)?(track|artist|album)\/(\d+)/);
    if (m) return { platform: "deezer", entity_hint: m[1], external_id: m[2], canonical_url: `https://www.deezer.com/${m[1]}/${m[2]}` };
  }
  if (host.includes("youtube.com") || host.includes("youtu.be")) {
    const v = u.searchParams.get("v") || path.replace(/^\//, "");
    if (v) return { platform: "youtube", external_id: v, canonical_url: `https://www.youtube.com/watch?v=${v}` };
  }
  if (host.includes("music.youtube.com")) {
    const id = u.searchParams.get("v");
    if (id) return { platform: "ytmusic", external_id: id, canonical_url: u.toString() };
  }
  if (host.includes("soundcloud.com")) {
    return { platform: "soundcloud", external_id: path, canonical_url: u.toString() };
  }
  if (host.includes("tidal.com")) {
    const m = path.match(/\/(track|artist|album)\/(\d+)/);
    if (m) return { platform: "tidal", entity_hint: m[1], external_id: m[2], canonical_url: u.toString() };
  }
  return null;
}

/** Detect free-text input shape: ISRC, UPC, URL, or plain query. */
export function classifyQuery(q: string): { type: "url" | "isrc" | "upc" | "text"; value: string } {
  const s = (q || "").trim();
  if (/^https?:\/\//i.test(s)) return { type: "url", value: s };
  if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(s.replace(/[\s-]/g, ""))) return { type: "isrc", value: s.replace(/[\s-]/g, "").toUpperCase() };
  if (/^\d{12,13}$/.test(s.replace(/[\s-]/g, ""))) return { type: "upc", value: s.replace(/[\s-]/g, "") };
  return { type: "text", value: s };
}