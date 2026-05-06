export type PROAffiliation = "ASCAP" | "BMI" | "SESAC" | "GMR" | "SOCAN" | "PRS" | "GEMA" | "SACEM" | "JASRAC" | "Other" | "";
export type SplitSource = "mlc" | "bmi" | "ascap" | "manual";

export interface VerifiedWriter {
  name: string;
  ipi?: string;
  share: number; // 0–100, writer's-share percentage
  pro?: PROAffiliation;
}
export interface VerifiedPublisher {
  name: string;
  ipi?: string;
  share: number; // 0–100, publisher-share percentage
  pro?: PROAffiliation;
}

export interface VerifiedSplitRecord {
  id?: string;
  user_id?: string;
  song_title: string;
  song_artist?: string | null;
  iswc?: string | null;
  work_id?: string | null;
  source: SplitSource;
  writers: VerifiedWriter[];
  publishers: VerifiedPublisher[];
  last_verified?: string;
  notes?: string | null;
}

export function sumShares(rows: { share: number }[]): number {
  return rows.reduce((acc, r) => acc + (Number.isFinite(r.share) ? r.share : 0), 0);
}

export function isValidSplit(splits: VerifiedSplitRecord): { ok: boolean; reason?: string } {
  const w = sumShares(splits.writers);
  const p = sumShares(splits.publishers);
  if (splits.writers.length === 0 && splits.publishers.length === 0) {
    return { ok: false, reason: "Add at least one writer or publisher." };
  }
  if (splits.writers.length > 0 && Math.abs(w - 100) > 0.5) {
    return { ok: false, reason: `Writer shares must total 100% (currently ${w.toFixed(1)}%).` };
  }
  if (splits.publishers.length > 0 && Math.abs(p - 100) > 0.5) {
    return { ok: false, reason: `Publisher shares must total 100% (currently ${p.toFixed(1)}%).` };
  }
  return { ok: true };
}

export function songKey(title: string, artist?: string | null): string {
  return `${(title || "").trim().toLowerCase()}::${(artist || "").trim().toLowerCase()}`;
}

/** Build pre-filled search URLs for the public PRO repertoires. */
export function bmiSongviewUrl(title: string, artist?: string): string {
  const q = encodeURIComponent([title, artist].filter(Boolean).join(" "));
  return `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${q}&Main_Search=Title&Sub_Search=Title&Page_Number=0&View_Count=20&Search_Type=all`;
}
export function ascapAceUrl(title: string, _artist?: string): string {
  // Public ACE entry. The previous `#ace/search/...` deep-link returns a 403
  // shell on first load; `/ace#/search/...` is the supported route.
  return `https://www.ascap.com/ace#/search/title/${encodeURIComponent(title)}`;
}