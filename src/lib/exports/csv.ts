/**
 * CSV export helpers. Always BOM-prefixed (per project convention) so Excel
 * preserves UTF-8 / international characters.
 */
function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length && !columns?.length) return "";
  const cols = columns?.length ? columns : Array.from(
    rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>())
  );
  const header = cols.map(escapeCsvCell).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCsvCell((r as any)[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, csv: string) {
  // BOM ensures Excel reads UTF-8 (catalog-export convention).
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportRows(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  downloadCsv(filename, rowsToCsv(rows, columns));
}