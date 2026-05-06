/**
 * Parses free-form pasted text from PRO/CMO portal repertoire pages
 * (ASCAP ACE, BMI Songview, SESAC, GMR, SoundExchange ISRC search).
 *
 * Designed to be lenient: PRO portals format their output very differently,
 * so we extract what we can — songwriter/publisher names, share %, IPI, ISWC, PRO —
 * and let the user review.
 */

import type { PROAffiliation, VerifiedSplitRecord } from "./verifiedSplits";

export type PROSource = "ascap" | "bmi" | "sesac" | "gmr" | "soundexchange" | "unknown";

export interface ParsedSplitRow {
  kind: "writer" | "publisher";
  name: string;
  share?: number;        // 0–100
  ipi?: string;
  pro?: PROAffiliation;
}

export interface ParsedPasteBlock {
  /** Best-guess title found in the paste (optional). */
  title?: string;
  /** Best-guess ISWC if present. */
  iswc?: string;
  /** Detected source portal. */
  source: PROSource;
  rows: ParsedSplitRow[];
}

const PRO_TOKENS: Record<string, PROAffiliation> = {
  ASCAP: "ASCAP", BMI: "BMI", SESAC: "SESAC", GMR: "GMR",
  SOCAN: "SOCAN", PRS: "PRS", GEMA: "GEMA", SACEM: "SACEM", JASRAC: "JASRAC",
};

const PUBLISHER_HINTS = /\b(publish(?:er|ing)?|music\s+pub|songs|admin|administrator|admin by)\b/i;
const WRITER_HINTS = /\b(writer|composer|author|songwriter|lyricist)\b/i;

/** Detect which portal the text most likely came from. */
export function detectSource(text: string): PROSource {
  const s = text.toLowerCase();
  if (s.includes("ascap") && (s.includes("ace") || s.includes("repertory"))) return "ascap";
  if (s.includes("bmi") && (s.includes("songview") || s.includes("repertoire"))) return "bmi";
  if (s.includes("sesac")) return "sesac";
  if (s.includes("global music rights") || s.includes("gmr")) return "gmr";
  if (s.includes("soundexchange") || s.includes("isrc")) return "soundexchange";
  return "unknown";
}

/** Try to find an ISWC code (T-XXX.XXX.XXX-X or T-XXXXXXXXX-X). */
function findIswc(text: string): string | undefined {
  const m = text.match(/\bT[-\s]?\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d\b/i);
  return m ? m[0].replace(/\s+/g, "") : undefined;
}

/** Try to extract IPI/CAE numbers (typically 9–11 digits). */
function findIpi(line: string): string | undefined {
  const m = line.match(/\b(?:IPI|CAE)[#:\s]*([0-9]{8,11})\b/i)
    ?? line.match(/\b([0-9]{9,11})\b/);
  return m ? m[1] : undefined;
}

/** Find a percentage in a line (e.g. "50%", "50.00%", "50 %"). */
function findShare(line: string): number | undefined {
  const m = line.match(/(\d{1,3}(?:\.\d{1,4})?)\s?%/);
  if (!m) return undefined;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : undefined;
}

/** Find a PRO affiliation token in a line. */
function findPro(line: string): PROAffiliation | undefined {
  const upper = line.toUpperCase();
  for (const tok of Object.keys(PRO_TOKENS)) {
    if (new RegExp(`\\b${tok}\\b`).test(upper)) return PRO_TOKENS[tok];
  }
  return undefined;
}

/** Strip share/IPI/PRO/role tokens to leave a candidate name. */
function extractName(line: string): string {
  let s = line
    .replace(/(\d{1,3}(?:\.\d{1,4})?)\s?%/g, "")
    .replace(/\b(?:IPI|CAE)[#:\s]*[0-9]{8,11}\b/gi, "")
    .replace(/\b[0-9]{9,11}\b/g, "")
    .replace(/\b(ASCAP|BMI|SESAC|GMR|SOCAN|PRS|GEMA|SACEM|JASRAC)\b/gi, "")
    .replace(/\b(writer|composer|author|songwriter|lyricist|publisher|publishing|admin(?:istrator)?|admin by)\b/gi, "")
    .replace(/\bshare\b/gi, "")
    .replace(/[|;,•·\-–—:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Strip trailing "(...)" annotations
  s = s.replace(/\(.*?\)/g, "").trim();
  return s;
}

/** Decide writer vs publisher from text hints; default to writer. */
function classifyKind(line: string): "writer" | "publisher" {
  if (PUBLISHER_HINTS.test(line)) return "publisher";
  if (WRITER_HINTS.test(line)) return "writer";
  // Heuristic: if name token is ALL-CAPS multi-word like "SONY MUSIC PUB", treat as publisher
  const stripped = extractName(line);
  if (/\b(MUSIC|PUB|SONGS|ENTERTAINMENT|RECORDS)\b/.test(stripped.toUpperCase())) return "publisher";
  return "writer";
}

/**
 * Parse a multi-line paste into split rows.
 * Splits on newlines, semicolons, or pipes. Skips obvious headers/empties.
 */
export function parsePaste(text: string): ParsedPasteBlock {
  const source = detectSource(text);
  const iswc = findIswc(text);

  // Best-guess title: first non-empty line that doesn't look like a header
  let title: string | undefined;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (/^(title|work|song|writer|publisher|share|iswc|ipi|results)/i.test(l)) continue;
    if (l.length < 3 || l.length > 120) continue;
    title = l.replace(/[—–-].*$/, "").trim();
    break;
  }

  const rows: ParsedSplitRow[] = [];
  // Split each line on common multi-record separators.
  const segments = lines.flatMap((l) => l.split(/\s*[|;]\s*/));
  for (const seg of segments) {
    const share = findShare(seg);
    const pro = findPro(seg);
    const ipi = findIpi(seg);
    const name = extractName(seg);
    if (!name || name.length < 2) continue;
    if (/^(title|work|song|results|share|ipi|iswc)$/i.test(name)) continue;
    // Require at least one strong signal per row
    if (share === undefined && !pro && !ipi && !PUBLISHER_HINTS.test(seg) && !WRITER_HINTS.test(seg)) continue;
    rows.push({ kind: classifyKind(seg), name, share, ipi, pro });
  }

  return { title, iswc, source, rows };
}

/* ------------------------------------------------------------------ *
 * Discrepancy detection vs an existing VerifiedSplitRecord baseline. *
 * ------------------------------------------------------------------ */

export interface Discrepancy {
  kind: "writer" | "publisher";
  name: string;
  baselineShare?: number;
  pastedShare?: number;
  reason: "missing_in_baseline" | "missing_in_paste" | "share_mismatch" | "pro_mismatch";
  detail?: string;
}

function norm(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

export function diffAgainstBaseline(
  parsed: ParsedPasteBlock,
  baseline: VerifiedSplitRecord | null | undefined
): Discrepancy[] {
  const out: Discrepancy[] = [];
  if (!baseline) return out;

  const compareGroup = (
    kind: "writer" | "publisher",
    base: { name: string; share: number; pro?: string }[],
    paste: ParsedSplitRow[]
  ) => {
    const baseMap = new Map(base.map((b) => [norm(b.name), b]));
    const pasteMap = new Map<string, ParsedSplitRow>();
    for (const p of paste) pasteMap.set(norm(p.name), p);

    for (const [k, p] of pasteMap) {
      const b = baseMap.get(k);
      if (!b) {
        out.push({ kind, name: p.name, pastedShare: p.share, reason: "missing_in_baseline" });
        continue;
      }
      if (typeof p.share === "number" && Math.abs((b.share ?? 0) - p.share) > 0.5) {
        out.push({ kind, name: p.name, baselineShare: b.share, pastedShare: p.share, reason: "share_mismatch" });
      }
      if (p.pro && b.pro && p.pro !== b.pro) {
        out.push({ kind, name: p.name, reason: "pro_mismatch", detail: `${b.pro} vs ${p.pro}` });
      }
    }
    for (const [k, b] of baseMap) {
      if (!pasteMap.has(k)) {
        out.push({ kind, name: b.name, baselineShare: b.share, reason: "missing_in_paste" });
      }
    }
  };

  compareGroup("writer", baseline.writers, parsed.rows.filter((r) => r.kind === "writer"));
  compareGroup("publisher", baseline.publishers, parsed.rows.filter((r) => r.kind === "publisher"));
  return out;
}

export const PRO_PORTALS: { key: PROSource; label: string; url: string; description: string }[] = [
  { key: "ascap", label: "ASCAP ACE Repertory", url: "https://www.ascap.com/repertory", description: "Search ASCAP works" },
  { key: "bmi", label: "BMI Songview", url: "https://repertoire.bmi.com", description: "Search BMI repertoire" },
  { key: "sesac", label: "SESAC Repertory", url: "https://repertory.sesac.com/", description: "Search SESAC works" },
  { key: "gmr", label: "GMR Catalog", url: "https://globalmusicrights.com/search", description: "Search Global Music Rights" },
  { key: "soundexchange", label: "SoundExchange ISRC", url: "https://isrc.soundexchange.com", description: "ISRC lookup" },
];