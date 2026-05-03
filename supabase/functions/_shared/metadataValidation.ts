// Shared metadata validation helpers used by edge functions after API responses
// from Spotify, Soundcharts, and Genius. Pure functions — no I/O.

export type ValidationFlag =
  | "missing_isrc"
  | "missing_title"
  | "missing_primary_artist"
  | "missing_release_date"
  | "missing_name"
  | "missing_external_ids"
  | "empty_string_field"
  | "malformed_isrc"
  | "malformed_release_date"
  | "stale_data"
  | "conflicting_credits";

export interface ValidationResult {
  is_valid: boolean;
  missing_fields: string[];
  warnings: string[];
  flags: ValidationFlag[];
  completeness_score: number; // 0-100
}

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const ISO_DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function isMeaningful(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

export function validateTrackMetadata(track: Record<string, any> | null | undefined): ValidationResult {
  const t = track ?? {};
  const missing: string[] = [];
  const warnings: string[] = [];
  const flags: ValidationFlag[] = [];

  // Required: title, primary artist, ISRC, release date
  const title = t.title ?? t.name ?? null;
  const artist = t.primary_artist_name ?? t.artist ?? t.artists?.[0]?.name ?? null;
  const isrc = (t.isrc ?? t.external_ids?.isrc ?? "").toString().replace(/-/g, "").toUpperCase();
  const release = (t.release_date ?? t.album?.release_date ?? "").toString();

  if (!isMeaningful(title)) { missing.push("title"); flags.push("missing_title"); }
  if (!isMeaningful(artist)) { missing.push("primary_artist"); flags.push("missing_primary_artist"); }
  if (!isMeaningful(isrc)) {
    missing.push("isrc"); flags.push("missing_isrc");
  } else if (!ISRC_RE.test(isrc)) {
    flags.push("malformed_isrc"); warnings.push(`ISRC "${isrc}" is not in the standard format`);
  }
  if (!isMeaningful(release)) {
    missing.push("release_date"); flags.push("missing_release_date");
  } else if (!ISO_DATE_RE.test(release)) {
    flags.push("malformed_release_date"); warnings.push(`release_date "${release}" is not ISO`);
  }

  // Empty-string check on common string fields
  for (const k of ["title", "primary_artist_name", "label", "isrc"]) {
    if (k in t && typeof t[k] === "string" && t[k].length === 0) {
      flags.push("empty_string_field"); warnings.push(`Field "${k}" is an empty string`);
    }
  }

  // Completeness across an extended field set
  const fields = ["title", "primary_artist", "isrc", "release_date", "duration_ms", "explicit", "label", "external_ids", "cover_url", "popularity"];
  const present = fields.filter((f) => {
    if (f === "primary_artist") return isMeaningful(artist);
    if (f === "external_ids") return isMeaningful(t.external_ids) || isMeaningful(t.spotify_id) || isMeaningful(t.isrc);
    if (f === "release_date") return isMeaningful(release);
    if (f === "isrc") return isMeaningful(isrc);
    return isMeaningful(t[f]);
  });
  const completeness = Math.round((present.length / fields.length) * 100);

  // Required-fields-only validity
  const is_valid = missing.length === 0 && !flags.includes("malformed_isrc");
  return { is_valid, missing_fields: missing, warnings, flags, completeness_score: completeness };
}

export function validateArtistMetadata(artist: Record<string, any> | null | undefined): ValidationResult {
  const a = artist ?? {};
  const missing: string[] = [];
  const warnings: string[] = [];
  const flags: ValidationFlag[] = [];

  const name = a.name ?? a.display_name ?? null;
  const externals = a.external_ids ?? a.externals ?? a.external_urls ?? null;
  if (!isMeaningful(name)) { missing.push("name"); flags.push("missing_name"); }
  if (!isMeaningful(externals) && !isMeaningful(a.spotify_id) && !isMeaningful(a.id)) {
    missing.push("external_ids"); flags.push("missing_external_ids");
  }

  for (const k of ["name", "country"]) {
    if (k in a && typeof a[k] === "string" && a[k].length === 0) {
      flags.push("empty_string_field"); warnings.push(`Field "${k}" is an empty string`);
    }
  }

  const fields = ["name", "external_ids", "country", "genres", "image_url", "followers", "popularity"];
  const present = fields.filter((f) => {
    if (f === "external_ids") return isMeaningful(externals) || isMeaningful(a.spotify_id);
    return isMeaningful(a[f]);
  });
  const completeness = Math.round((present.length / fields.length) * 100);
  const is_valid = missing.length === 0;
  return { is_valid, missing_fields: missing, warnings, flags, completeness_score: completeness };
}

// Source reliability weights for confidence scoring (sum doesn't have to be 1)
export const SOURCE_WEIGHTS: Record<string, number> = {
  spotify: 1.0,
  soundcharts: 0.85,
  apple: 0.9,
  genius: 0.6,
  musicbrainz: 0.7,
  discogs: 0.5,
  manual: 1.0,
};

export function confidenceFromSources(sources: string[]): number {
  if (!sources.length) return 0;
  const w = sources.map((s) => SOURCE_WEIGHTS[s] ?? 0.4);
  // diminishing returns: 1 - prod(1 - w_i)
  const inv = w.reduce((acc, x) => acc * (1 - Math.min(0.99, x)), 1);
  return Math.round((1 - inv) * 100);
}