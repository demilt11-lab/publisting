/**
 * DSP link parsing — recognise Spotify, Apple Music, and YouTube track URLs
 * and extract their canonical identifiers. Used by the catalog importer to
 * resolve a pasted URL into a unified metadata + credits record.
 */

export type DspProvider = "spotify" | "apple" | "youtube" | "unknown";

export interface ParsedDspLink {
  provider: DspProvider;
  /** Canonical identifier — Spotify trackId / Apple iTunes track id (i=) / YouTube videoId. */
  id?: string;
  /** Original (cleaned) URL. */
  url: string;
  /** When the URL points to a non-track resource (album, playlist) we still surface it. */
  kind?: "track" | "album" | "playlist" | "video";
}

const SPOTIFY_TRACK_RE = /\/track\/([a-zA-Z0-9]{10,32})/;
const SPOTIFY_ALBUM_RE = /\/album\/([a-zA-Z0-9]{10,32})/;
const SPOTIFY_PLAYLIST_RE = /\/playlist\/([a-zA-Z0-9]{10,32})/;
const APPLE_TRACK_PARAM = "i";
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

export function parseDspLink(raw: string): ParsedDspLink {
  const cleaned = raw.trim();
  let u: URL;
  try { u = new URL(cleaned); } catch { return { provider: "unknown", url: cleaned }; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  if (host.includes("spotify.com") || host === "open.spotify.com") {
    const t = path.match(SPOTIFY_TRACK_RE);
    if (t) return { provider: "spotify", id: t[1], url: cleaned, kind: "track" };
    const a = path.match(SPOTIFY_ALBUM_RE);
    if (a) return { provider: "spotify", id: a[1], url: cleaned, kind: "album" };
    const p = path.match(SPOTIFY_PLAYLIST_RE);
    if (p) return { provider: "spotify", id: p[1], url: cleaned, kind: "playlist" };
    return { provider: "spotify", url: cleaned };
  }

  if (host.includes("music.apple.com") || host.includes("itunes.apple.com")) {
    const songParam = u.searchParams.get(APPLE_TRACK_PARAM);
    if (songParam) return { provider: "apple", id: songParam, url: cleaned, kind: "track" };
    if (/\/album\//.test(path)) return { provider: "apple", url: cleaned, kind: "album" };
    if (/\/song\//.test(path)) {
      const m = path.match(/\/song\/[^/]+\/(\d+)/);
      if (m) return { provider: "apple", id: m[1], url: cleaned, kind: "track" };
    }
    return { provider: "apple", url: cleaned };
  }

  if (YT_HOSTS.has(host)) {
    if (host === "youtu.be") {
      const id = path.replace(/^\//, "").split("/")[0];
      if (id) return { provider: "youtube", id, url: cleaned, kind: "video" };
    }
    const v = u.searchParams.get("v");
    if (v) return { provider: "youtube", id: v, url: cleaned, kind: "video" };
    const m = path.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{6,})/);
    if (m) return { provider: "youtube", id: m[1], url: cleaned, kind: "video" };
    return { provider: "youtube", url: cleaned };
  }

  return { provider: "unknown", url: cleaned };
}

/** Convenience: classify a free-form line as link or text query. */
export function classifyInputLine(line: string): { link?: ParsedDspLink; text?: string } {
  const trimmed = line.trim();
  if (!trimmed) return {};
  if (/^https?:\/\//i.test(trimmed)) {
    const link = parseDspLink(trimmed);
    if (link.provider !== "unknown") return { link };
  }
  return { text: trimmed };
}
