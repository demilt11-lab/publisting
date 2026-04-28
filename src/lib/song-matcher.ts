/**
 * Normalized song-matching engine.
 *
 * Tier hierarchy (highest confidence first):
 *   1. ISRC exact match               -> 1.00
 *   2. ISWC exact match               -> 1.00
 *   3. IPI + normalized title         -> 0.95
 *   4. Normalized title + writer name -> Levenshtein-similarity (>=0.85 to accept)
 *
 * Used by the catalog-analysis "Match Songs" / source verification flows.
 */

export type MatchType =
  | "isrc"
  | "iswc"
  | "ipi_title"
  | "fuzzy_title_writer"
  | "manual";

export type MatchSource = "spotify" | "youtube" | "mlc" | "bmi" | "ascap";

export interface SongIdentity {
  title: string;
  artist?: string;
  writers?: string[];
  isrc?: string;
  iswc?: string;
  ipis?: string[];
}

export interface MatchCandidate extends SongIdentity {
  source: MatchSource;
  externalId: string;
  raw?: unknown;
}

export interface MatchResult {
  candidate: MatchCandidate;
  matchType: MatchType;
  confidence: number; // 0..1
  reason: string;
}

/* ---------- normalization ---------- */

const FEAT_RE = /\b(feat\.?|ft\.?|featuring)\b.*$/i;
const PARENS_RE = /\s*\((?:[^)]*)\)\s*/g;     // (Remix), (2019 Remaster), …
const BRACKETS_RE = /\s*\[(?:[^\]]*)\]\s*/g;
const NON_ALNUM_RE = /[^\p{L}\p{N}\s]+/gu;    // strip punctuation, keep unicode letters
const MULTI_WS_RE = /\s+/g;

export function normalizeTitle(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .normalize("NFC")
    .toLowerCase()
    .replace(FEAT_RE, "")
    .replace(PARENS_RE, " ")
    .replace(BRACKETS_RE, " ")
    .replace(NON_ALNUM_RE, " ")
    .replace(MULTI_WS_RE, " ")
    .trim();
}

export function normalizeName(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .normalize("NFC")
    .toLowerCase()
    .replace(NON_ALNUM_RE, " ")
    .replace(MULTI_WS_RE, " ")
    .trim();
}

export function normalizeIsrc(s: string | undefined | null): string {
  return (s || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function normalizeIswc(s: string | undefined | null): string {
  return (s || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

export function normalizeIpi(s: string | undefined | null): string {
  return (s || "").replace(/[^0-9]/g, "");
}

/* ---------- similarity (Levenshtein -> ratio) ---------- */

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / max;
}

/* ---------- matching ---------- */

export const FUZZY_THRESHOLD = 0.85;

/**
 * Score a single candidate against the source song.
 * Returns null when below threshold.
 */
export function scoreCandidate(
  source: SongIdentity,
  candidate: MatchCandidate,
): MatchResult | null {
  // 1) ISRC exact
  const sIsrc = normalizeIsrc(source.isrc);
  const cIsrc = normalizeIsrc(candidate.isrc);
  if (sIsrc && cIsrc && sIsrc === cIsrc) {
    return { candidate, matchType: "isrc", confidence: 1, reason: `ISRC ${sIsrc}` };
  }

  // 2) ISWC exact
  const sIswc = normalizeIswc(source.iswc);
  const cIswc = normalizeIswc(candidate.iswc);
  if (sIswc && cIswc && sIswc === cIswc) {
    return { candidate, matchType: "iswc", confidence: 1, reason: `ISWC ${sIswc}` };
  }

  const sTitle = normalizeTitle(source.title);
  const cTitle = normalizeTitle(candidate.title);

  // 3) IPI overlap + normalized title equality
  const sIpis = (source.ipis || []).map(normalizeIpi).filter(Boolean);
  const cIpis = (candidate.ipis || []).map(normalizeIpi).filter(Boolean);
  if (sIpis.length && cIpis.length && sIpis.some((i) => cIpis.includes(i)) && sTitle && sTitle === cTitle) {
    return { candidate, matchType: "ipi_title", confidence: 0.95, reason: "IPI + title" };
  }

  // 4) Fuzzy title + writer
  if (sTitle && cTitle) {
    const titleSim = similarity(sTitle, cTitle);
    const writerSim = bestWriterSimilarity(source.writers || [source.artist || ""], candidate.writers || [candidate.artist || ""]);
    // weighted: title carries more weight when writers are sparse
    const blended = (titleSim * 0.7) + (writerSim * 0.3);
    if (blended >= FUZZY_THRESHOLD) {
      return {
        candidate,
        matchType: "fuzzy_title_writer",
        confidence: Number(blended.toFixed(3)),
        reason: `title ${Math.round(titleSim * 100)}% · writer ${Math.round(writerSim * 100)}%`,
      };
    }
  }

  return null;
}

function bestWriterSimilarity(a: string[], b: string[]): number {
  const A = a.map(normalizeName).filter(Boolean);
  const B = b.map(normalizeName).filter(Boolean);
  if (!A.length || !B.length) return 0;
  let best = 0;
  for (const x of A) for (const y of B) {
    const s = similarity(x, y);
    if (s > best) best = s;
  }
  return best;
}

/** Rank candidates from a single source, best first. */
export function matchAgainst(
  source: SongIdentity,
  candidates: MatchCandidate[],
): MatchResult[] {
  return candidates
    .map((c) => scoreCandidate(source, c))
    .filter((r): r is MatchResult => !!r)
    .sort((a, b) => b.confidence - a.confidence);
}
