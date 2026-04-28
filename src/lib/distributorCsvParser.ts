import Papa from "papaparse";

/** Known distributor presets — used for auto-detect & header hints. */
export const DISTRIBUTOR_PRESETS = [
  { id: "distrokid", label: "DistroKid" },
  { id: "tunecore", label: "TuneCore" },
  { id: "cdbaby", label: "CD Baby" },
  { id: "amuse", label: "Amuse" },
  { id: "stem", label: "Stem" },
  { id: "unitedmasters", label: "UnitedMasters" },
  { id: "ditto", label: "Ditto Music" },
  { id: "awal", label: "AWAL" },
  { id: "symphonic", label: "Symphonic" },
  { id: "believe", label: "Believe" },
  { id: "orchard", label: "The Orchard" },
  { id: "ingrooves", label: "Ingrooves" },
  { id: "other", label: "Other / Generic" },
] as const;

export type DistributorId = (typeof DISTRIBUTOR_PRESETS)[number]["id"];

/** Canonical fields we care about. */
export type CanonicalField =
  | "track_title"
  | "artist"
  | "isrc"
  | "upc"
  | "platform"
  | "country"
  | "streams"
  | "earnings"
  | "currency"
  | "ownership_percent"
  | "period_start"
  | "period_end";

export type ColumnMapping = Partial<Record<CanonicalField, string>>;

/** Header synonyms used for auto-detection (lowercase, normalized). */
const HEADER_SYNONYMS: Record<CanonicalField, string[]> = {
  track_title: [
    "title", "track", "track title", "song", "song title", "song name",
    "track name", "release title", "product title",
  ],
  artist: [
    "artist", "artist name", "artists", "primary artist", "performer",
    "release artist",
  ],
  isrc: ["isrc", "isrc code"],
  upc: ["upc", "upc/ean", "ean", "barcode", "release upc"],
  platform: [
    "platform", "store", "dsp", "service", "retailer", "store name",
    "platform name", "shop", "channel",
  ],
  country: [
    "country", "country code", "territory", "region", "country/region",
    "country of sale",
  ],
  streams: [
    "streams", "quantity", "stream count", "plays", "play count", "units",
    "unit count", "downloads", "stream qty", "qty",
  ],
  earnings: [
    "earnings", "net earnings", "net revenue", "revenue", "royalty",
    "royalties", "amount", "amount earned", "your earnings", "net amount",
    "payable", "total", "gross earnings", "net royalty",
  ],
  currency: ["currency", "currency code", "ccy"],
  ownership_percent: [
    "ownership", "ownership %", "ownership percent", "share", "share %",
    "split", "split %", "your share",
  ],
  period_start: [
    "period start", "start date", "from", "reporting period start",
    "sale start date", "service period start",
  ],
  period_end: [
    "period end", "end date", "to", "reporting period end", "sale month",
    "sale end date", "service period end", "month", "report month",
  ],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_\-./]+/g, " ");

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS) as [
    CanonicalField,
    string[]
  ][]) {
    const synSet = new Set(synonyms.map(norm));
    // exact match first
    let hit = normalizedHeaders.find((h) => synSet.has(h.n));
    // partial contains fallback
    if (!hit) {
      hit = normalizedHeaders.find((h) =>
        synonyms.some((s) => h.n.includes(norm(s)))
      );
    }
    if (hit) mapping[field] = hit.raw;
  }
  return mapping;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  preview: Record<string, string>[]; // first 5 rows
}

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        const rows = (res.data ?? []).filter((r) =>
          Object.values(r).some((v) => v != null && String(v).trim() !== "")
        );
        resolve({ headers, rows, preview: rows.slice(0, 5) });
      },
      error: (err) => reject(err),
    });
  });
}

const parseNumber = (raw: unknown): number => {
  if (raw == null) return 0;
  const s = String(raw).replace(/[^0-9.\-]/g, "");
  if (!s || s === "-" || s === ".") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const parseDate = (raw: unknown): string | null => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // YYYY-MM or YYYY/MM → first of month
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) {
    const m = ym[2].padStart(2, "0");
    return `${ym[1]}-${m}-01`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
};

export interface NormalizedRow {
  track_title: string | null;
  artist: string | null;
  isrc: string | null;
  upc: string | null;
  platform: string | null;
  country: string | null;
  streams: number;
  earnings: number;
  currency: string | null;
  ownership_percent: number | null;
  period_start: string | null;
  period_end: string | null;
  raw_row: Record<string, string>;
}

export function normalizeRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): NormalizedRow[] {
  const get = (row: Record<string, string>, field: CanonicalField) => {
    const col = mapping[field];
    if (!col) return null;
    const v = row[col];
    return v == null ? null : String(v).trim();
  };
  return rows.map((row) => ({
    track_title: get(row, "track_title") || null,
    artist: get(row, "artist") || null,
    isrc: (get(row, "isrc") || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null,
    upc: get(row, "upc") || null,
    platform: get(row, "platform") || null,
    country: get(row, "country") || null,
    streams: parseNumber(get(row, "streams")),
    earnings: parseNumber(get(row, "earnings")),
    currency: get(row, "currency") || null,
    ownership_percent: mapping.ownership_percent
      ? parseNumber(get(row, "ownership_percent"))
      : null,
    period_start: parseDate(get(row, "period_start")),
    period_end: parseDate(get(row, "period_end")),
    raw_row: row,
  }));
}

export interface ImportSummary {
  rowCount: number;
  totalStreams: number;
  totalEarnings: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export function summarize(rows: NormalizedRow[]): ImportSummary {
  let totalStreams = 0;
  let totalEarnings = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;
  for (const r of rows) {
    totalStreams += r.streams;
    totalEarnings += r.earnings;
    const start = r.period_start ?? r.period_end;
    const end = r.period_end ?? r.period_start;
    if (start && (!minDate || start < minDate)) minDate = start;
    if (end && (!maxDate || end > maxDate)) maxDate = end;
  }
  return {
    rowCount: rows.length,
    totalStreams,
    totalEarnings,
    periodStart: minDate,
    periodEnd: maxDate,
  };
}

/** Aggregate earnings + streams per track (key = ISRC if present, else title|artist). */
export interface TrackAggregate {
  key: string;
  isrc: string | null;
  title: string | null;
  artist: string | null;
  streams: number;
  earnings: number;
  rowCount: number;
}

export function aggregateByTrack(rows: NormalizedRow[]): TrackAggregate[] {
  const map = new Map<string, TrackAggregate>();
  for (const r of rows) {
    const key =
      r.isrc ||
      `${(r.track_title ?? "").toLowerCase()}|${(r.artist ?? "").toLowerCase()}`;
    if (!key.trim() || key === "|") continue;
    const ex = map.get(key);
    if (ex) {
      ex.streams += r.streams;
      ex.earnings += r.earnings;
      ex.rowCount += 1;
    } else {
      map.set(key, {
        key,
        isrc: r.isrc,
        title: r.track_title,
        artist: r.artist,
        streams: r.streams,
        earnings: r.earnings,
        rowCount: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.earnings - a.earnings);
}