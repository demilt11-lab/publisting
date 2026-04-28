/**
 * Canonical credits — one writer/producer object dedup'd across DSP sources.
 *
 * Source provenance follows the project rule: Spotify is authoritative for
 * songwriter/producer credits; secondary sources may *add* names but cannot
 * displace a Spotify-confirmed credit. YouTube description parsing is treated
 * as low-confidence supplementary data.
 */

import { normalizeName } from "@/lib/song-matcher";

export type CanonicalRole = "writer" | "producer" | "performer" | "featuring" | "other";
export type CanonicalSource = "spotify" | "apple" | "youtube" | "manual";

export interface RawCredit {
  name: string;
  role: CanonicalRole;
  source: CanonicalSource;
  /** Source-side confidence 0..1 — defaults applied per source when omitted. */
  confidence?: number;
  pro?: string;
  ipi?: string;
  publishingCompany?: string;
}

export interface CanonicalCredit {
  name: string;
  role: CanonicalRole;
  /** Other roles this person also held across sources. */
  alsoRoles: CanonicalRole[];
  sources: CanonicalSource[];
  confidence: number; // 0..100
  pro?: string;
  ipi?: string;
  publishingCompany?: string;
}

const SOURCE_BASE_CONFIDENCE: Record<CanonicalSource, number> = {
  spotify: 0.85,
  apple: 0.7,
  youtube: 0.4,
  manual: 1,
};

const ROLE_RANK: Record<CanonicalRole, number> = {
  writer: 5,
  producer: 4,
  performer: 3,
  featuring: 2,
  other: 1,
};

const ROLE_SYNONYMS: Record<string, CanonicalRole> = {
  songwriter: "writer", writer: "writer", composer: "writer", lyricist: "writer", author: "writer",
  producer: "producer", "co-producer": "producer", coproducer: "producer", "executive producer": "producer",
  artist: "performer", performer: "performer", vocalist: "performer", "main artist": "performer",
  featuring: "featuring", feat: "featuring", "featured artist": "featuring",
};

export function canonicaliseRole(raw: string | undefined | null): CanonicalRole {
  if (!raw) return "other";
  const k = raw.trim().toLowerCase();
  return ROLE_SYNONYMS[k] || (k.includes("writ") || k.includes("compos") || k.includes("lyric") ? "writer"
    : k.includes("produc") ? "producer"
    : k.includes("feat") ? "featuring"
    : k.includes("artist") || k.includes("vocal") || k.includes("perform") ? "performer"
    : "other");
}

function isJunk(name: string): boolean {
  const n = name.trim();
  if (n.length < 2 || n.length > 80) return true;
  if (/^(unknown|various|n\/a|tba)$/i.test(n)) return true;
  if (/^(the )?artist$/i.test(n)) return true;
  return false;
}

/**
 * Merge raw credits from any number of sources into one canonical list.
 * Spotify-sourced credits are pinned; secondary sources can add new names
 * and add roles to an existing person but cannot overwrite Spotify confidence.
 */
export function normalizeCredits(raws: RawCredit[]): CanonicalCredit[] {
  // Drop junk and bucket by normalized name.
  const byKey = new Map<string, CanonicalCredit & { _hasSpotify: boolean }>();

  for (const r of raws) {
    const name = (r.name || "").trim();
    if (isJunk(name)) continue;
    const role = canonicaliseRole(r.role);
    const key = normalizeName(name);
    if (!key) continue;
    const baseConf = r.confidence ?? SOURCE_BASE_CONFIDENCE[r.source];
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        name,
        role,
        alsoRoles: [],
        sources: [r.source],
        confidence: Math.round(baseConf * 100),
        pro: r.pro,
        ipi: r.ipi,
        publishingCompany: r.publishingCompany,
        _hasSpotify: r.source === "spotify",
      });
      continue;
    }

    // Multi-source confirmation bumps confidence (cap at 100).
    if (!existing.sources.includes(r.source)) existing.sources.push(r.source);
    existing.confidence = Math.min(100, existing.confidence + Math.round(baseConf * 30));

    // Keep the higher-ranked role as primary; demote the other to alsoRoles.
    if (ROLE_RANK[role] > ROLE_RANK[existing.role]) {
      if (!existing.alsoRoles.includes(existing.role)) existing.alsoRoles.push(existing.role);
      existing.role = role;
    } else if (role !== existing.role && !existing.alsoRoles.includes(role)) {
      existing.alsoRoles.push(role);
    }

    // Spotify is authoritative for identity metadata; otherwise fill blanks.
    const spotifyAuthoritative = existing._hasSpotify;
    if (!spotifyAuthoritative || r.source === "spotify") {
      if (r.pro && !existing.pro) existing.pro = r.pro;
      if (r.ipi && !existing.ipi) existing.ipi = r.ipi;
      if (r.publishingCompany && !existing.publishingCompany) existing.publishingCompany = r.publishingCompany;
    }
    if (r.source === "spotify") existing._hasSpotify = true;
  }

  return Array.from(byKey.values())
    .map(({ _hasSpotify, ...rest }) => rest)
    .sort((a, b) =>
      ROLE_RANK[b.role] - ROLE_RANK[a.role] || b.confidence - a.confidence || a.name.localeCompare(b.name),
    );
}

/** Convenience: build raw credits from Spotify edge-function payload. */
export function spotifyToRaw(data: { writers?: string[]; producers?: string[]; performedBy?: string[] }): RawCredit[] {
  const out: RawCredit[] = [];
  (data.writers || []).forEach((n) => out.push({ name: n, role: "writer", source: "spotify" }));
  (data.producers || []).forEach((n) => out.push({ name: n, role: "producer", source: "spotify" }));
  (data.performedBy || []).forEach((n) => out.push({ name: n, role: "performer", source: "spotify", confidence: 0.6 }));
  return out;
}

/** Parse "Written by / Produced by" lines from a YouTube description. */
const YT_LINE_RE = /^\s*(written by|songwriter[s]?|composed by|composer[s]?|lyrics by|produced by|producer[s]?)\s*[:\-–—]\s*(.+)$/i;
const YT_NAME_SPLIT = /\s*(?:,|&|\band\b|\/|;)\s*/i;

export function youtubeDescriptionToRaw(description: string | undefined | null): RawCredit[] {
  if (!description) return [];
  const out: RawCredit[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = line.match(YT_LINE_RE);
    if (!m) continue;
    const role: CanonicalRole = /produc/i.test(m[1]) ? "producer" : "writer";
    for (const name of m[2].split(YT_NAME_SPLIT)) {
      const cleaned = name.replace(/\(.*?\)/g, "").trim();
      if (cleaned && cleaned.length <= 60) {
        out.push({ name: cleaned, role, source: "youtube" });
      }
    }
  }
  return out;
}

/** Apple Music markdown payload → raw credits (looks for "Written by" / "Producer" lines). */
export function appleMarkdownToRaw(markdown: string | undefined | null): RawCredit[] {
  if (!markdown) return [];
  const out: RawCredit[] = [];
  const lines = markdown.split(/\r?\n/);
  let currentRole: CanonicalRole | null = null;
  for (const line of lines) {
    const head = line.match(/^\s*(?:#+\s*)?(composer|composers|songwriter|songwriters|writer|writers|producer|producers|lyricist|lyricists)\s*[:\-]?\s*$/i);
    if (head) { currentRole = canonicaliseRole(head[1]); continue; }
    const inline = line.match(/^\s*(composer|songwriter|writer|producer|lyricist)s?\s*[:\-]\s*(.+)$/i);
    if (inline) {
      const role = canonicaliseRole(inline[1]);
      for (const name of inline[2].split(YT_NAME_SPLIT)) {
        const cleaned = name.replace(/\(.*?\)/g, "").trim();
        if (cleaned) out.push({ name: cleaned, role, source: "apple" });
      }
      continue;
    }
    if (currentRole) {
      const bullet = line.match(/^\s*[-*•]\s*(.+)$/);
      if (bullet) {
        const cleaned = bullet[1].replace(/\(.*?\)/g, "").trim();
        if (cleaned) out.push({ name: cleaned, role: currentRole, source: "apple" });
      } else if (!line.trim()) {
        currentRole = null;
      }
    }
  }
  return out;
}
