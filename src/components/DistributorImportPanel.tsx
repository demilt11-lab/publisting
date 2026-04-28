import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, Trash2, FileSpreadsheet, CheckCircle2, AlertTriangle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  DISTRIBUTOR_PRESETS,
  autoDetectMapping,
  parseCsvFile,
  normalizeRows,
  summarize,
  aggregateByTrack,
  matchAggregatesToCatalog,
  type DistributorMatch,
  type ColumnMapping,
  type CanonicalField,
  type ParsedCsv,
  type NormalizedRow,
  type TrackAggregate,
} from "@/lib/distributorCsvParser";

const FIELD_LABELS: Record<CanonicalField, string> = {
  track_title: "Track title",
  artist: "Artist",
  isrc: "ISRC",
  upc: "UPC",
  platform: "Platform / Store",
  country: "Country",
  streams: "Streams / Units",
  earnings: "Earnings",
  currency: "Currency",
  ownership_percent: "Ownership %",
  period_start: "Period start",
  period_end: "Period end",
};

const REQUIRED_FIELDS: CanonicalField[] = ["track_title", "earnings"];

interface SavedImport {
  id: string;
  distributor_name: string;
  file_name: string | null;
  period_start: string | null;
  period_end: string | null;
  row_count: number;
  total_streams: number;
  total_earnings: number;
  notes: string | null;
  created_at: string;
}

export interface DistributorMatchedTrack {
  isrc: string | null;
  title: string | null;
  artist: string | null;
  streams: number;
  earnings: number;
}

interface Props {
  /** Catalog songs currently loaded — used to flag which uploaded rows match. */
  catalogSongs?: { title: string; artist?: string; isrc?: string }[];
  /** Optional callback emitting aggregated earnings (for cross-referencing). */
  onMatchedTracks?: (tracks: DistributorMatchedTrack[]) => void;
}

export function DistributorImportPanel({ catalogSongs = [], onMatchedTracks }: Props) {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [imports, setImports] = useState<SavedImport[]>([]);
  const [loadingImports, setLoadingImports] = useState(false);
  const [busy, setBusy] = useState(false);

  // Upload-staging state
  const [distributor, setDistributor] = useState<string>("distrokid");
  const [customDistributor, setCustomDistributor] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [notes, setNotes] = useState("");

  // Detail viewer
  const [viewing, setViewing] = useState<SavedImport | null>(null);
  const [viewingRows, setViewingRows] = useState<TrackAggregate[]>([]);
  const [viewingLoading, setViewingLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const loadImports = async () => {
    if (!userId) return;
    setLoadingImports(true);
    const { data, error } = await supabase
      .from("distributor_imports")
      .select("id, distributor_name, file_name, period_start, period_end, row_count, total_streams, total_earnings, notes, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setLoadingImports(false);
    if (error) {
      toast({ title: "Couldn't load imports", description: error.message, variant: "destructive" });
      return;
    }
    setImports((data ?? []) as SavedImport[]);
  };

  useEffect(() => {
    void loadImports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleFile = async (f: File) => {
    setFile(f);
    try {
      const p = await parseCsvFile(f);
      setParsed(p);
      setMapping(autoDetectMapping(p.headers));
    } catch (e) {
      toast({
        title: "Couldn't parse CSV",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setParsed(null);
      setMapping({});
    }
  };

  const normalizedPreview = useMemo<NormalizedRow[]>(() => {
    if (!parsed) return [];
    return normalizeRows(parsed.rows, mapping);
  }, [parsed, mapping]);

  const summary = useMemo(() => summarize(normalizedPreview), [normalizedPreview]);

  const aggregates = useMemo(() => aggregateByTrack(normalizedPreview), [normalizedPreview]);

  /** Per-aggregate match (ISRC then fuzzy title+artist). */
  const matchByKey = useMemo(
    () => matchAggregatesToCatalog(aggregates, catalogSongs),
    [aggregates, catalogSongs]
  );

  const matchSummary = useMemo(() => {
    let isrc = 0, titleArtist = 0, titleOnly = 0, none = 0;
    for (const m of matchByKey.values()) {
      if (m.matchType === "isrc") isrc++;
      else if (m.matchType === "title_artist") titleArtist++;
      else if (m.matchType === "title_only") titleOnly++;
      else none++;
    }
    return { isrc, titleArtist, titleOnly, none, matched: isrc + titleArtist + titleOnly };
  }, [matchByKey]);

  /** Build a per-row match lookup (ISRC or title|artist) for persistence. */
  const rowMatchFor = (r: NormalizedRow): DistributorMatch | null => {
    const key =
      r.isrc ||
      `${(r.track_title ?? "").toLowerCase()}|${(r.artist ?? "").toLowerCase()}`;
    return matchByKey.get(key) ?? null;
  };

  const missingRequired = REQUIRED_FIELDS.filter((f) => !mapping[f]);

  const resetStaging = () => {
    setFile(null);
    setParsed(null);
    setMapping({});
    setNotes("");
  };

  const handleSave = async () => {
    if (!userId) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    if (!parsed || normalizedPreview.length === 0) {
      toast({ title: "Nothing to import", description: "Upload a CSV first.", variant: "destructive" });
      return;
    }
    if (missingRequired.length > 0) {
      toast({
        title: "Missing required fields",
        description: `Please map: ${missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    const distName =
      distributor === "other"
        ? customDistributor.trim() || "Generic distributor"
        : DISTRIBUTOR_PRESETS.find((d) => d.id === distributor)?.label ?? distributor;

    const { data: imp, error: impErr } = await supabase
      .from("distributor_imports")
      .insert({
        user_id: userId,
        distributor_name: distName,
        file_name: file?.name ?? null,
        period_start: summary.periodStart,
        period_end: summary.periodEnd,
        row_count: summary.rowCount,
        total_streams: summary.totalStreams,
        total_earnings: summary.totalEarnings,
        notes: notes.trim() || null,
        raw_headers: parsed.headers,
        column_mapping: mapping,
      })
      .select("id")
      .single();

    if (impErr || !imp) {
      setBusy(false);
      toast({
        title: "Import failed",
        description: impErr?.message ?? "Unknown error",
        variant: "destructive",
      });
      return;
    }

    // Bulk insert earnings rows in chunks
    const importId = imp.id as string;
    const chunkSize = 500;
    for (let i = 0; i < normalizedPreview.length; i += chunkSize) {
      const chunk = normalizedPreview.slice(i, i + chunkSize).map((r) => ({
        import_id: importId,
        user_id: userId,
        track_title: r.track_title,
        artist: r.artist,
        isrc: r.isrc,
        upc: r.upc,
        platform: r.platform,
        country: r.country,
        streams: r.streams,
        earnings: r.earnings,
        currency: r.currency,
        ownership_percent: r.ownership_percent,
        period_start: r.period_start,
        period_end: r.period_end,
        raw_row: r.raw_row,
        ...(() => {
          const m = rowMatchFor(r);
          return m && m.catalogKey
            ? {
                matched_catalog_key: m.catalogKey,
                match_confidence: m.confidence,
                match_type: m.matchType,
              }
            : { matched_catalog_key: null, match_confidence: null, match_type: m?.matchType ?? "none" };
        })(),
      }));
      const { error: rowErr } = await supabase.from("distributor_earnings").insert(chunk);
      if (rowErr) {
        setBusy(false);
        toast({
          title: "Some rows failed",
          description: rowErr.message,
          variant: "destructive",
        });
        await loadImports();
        return;
      }
    }

    setBusy(false);
    toast({
      title: "Import complete",
      description: `${summary.rowCount.toLocaleString()} rows · ${summary.totalEarnings.toLocaleString(
        undefined,
        { style: "currency", currency: "USD" }
      )}`,
    });
    resetStaging();
    await loadImports();
    if (onMatchedTracks && matchSummary.matched > 0) {
      onMatchedTracks(
        aggregates
          .filter((a) => matchByKey.get(a.key)?.catalogKey)
          .map((a) => ({
            isrc: a.isrc,
            title: a.title,
            artist: a.artist,
            streams: a.streams,
            earnings: a.earnings,
          }))
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this import and all its rows?")) return;
    const { error } = await supabase.from("distributor_imports").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    await loadImports();
  };

  const openDetail = async (imp: SavedImport) => {
    setViewing(imp);
    setViewingLoading(true);
    setViewingRows([]);
    const { data, error } = await supabase
      .from("distributor_earnings")
      .select("track_title, artist, isrc, streams, earnings")
      .eq("import_id", imp.id)
      .limit(2000);
    setViewingLoading(false);
    if (error) {
      toast({ title: "Couldn't load rows", description: error.message, variant: "destructive" });
      return;
    }
    const norm: NormalizedRow[] = (data ?? []).map((r: any) => ({
      track_title: r.track_title,
      artist: r.artist,
      isrc: r.isrc,
      upc: null,
      platform: null,
      country: null,
      streams: Number(r.streams ?? 0),
      earnings: Number(r.earnings ?? 0),
      currency: null,
      ownership_percent: null,
      period_start: null,
      period_end: null,
      raw_row: {},
    }));
    setViewingRows(aggregateByTrack(norm).slice(0, 200));
  };

  const fmtMoney = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Distributor royalty import
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Upload royalty statements (CSV) from DistroKid, TuneCore, CD Baby and others.
            We auto-detect columns, normalize totals, and match rows to your loaded catalog by ISRC or title+artist.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {imports.length} import{imports.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {/* Upload form */}
      <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Distributor</Label>
            <Select value={distributor} onValueChange={setDistributor}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DISTRIBUTOR_PRESETS.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {distributor === "other" && (
              <Input
                className="mt-2 h-8 text-xs"
                placeholder="Distributor name"
                value={customDistributor}
                onChange={(e) => setCustomDistributor(e.target.value)}
                maxLength={80}
              />
            )}
          </div>
          <div>
            <Label className="text-xs">CSV file</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              className="h-8 text-xs file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:text-xs file:text-muted-foreground"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </div>
        </div>

        {parsed && (
          <>
            <div className="text-xs text-muted-foreground">
              Detected <strong className="text-foreground">{parsed.rows.length.toLocaleString()}</strong> rows
              across <strong className="text-foreground">{parsed.headers.length}</strong> columns. Map any
              required field below.
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(FIELD_LABELS) as CanonicalField[]).map((field) => {
                const isReq = REQUIRED_FIELDS.includes(field);
                return (
                  <div key={field}>
                    <Label className="text-[11px] flex items-center gap-1">
                      {FIELD_LABELS[field]}
                      {isReq && <span className="text-destructive">*</span>}
                    </Label>
                    <Select
                      value={mapping[field] ?? "__none__"}
                      onValueChange={(v) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (v === "__none__") delete next[field];
                          else next[field] = v;
                          return next;
                        })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs">— Not mapped —</SelectItem>
                        {parsed.headers.map((h) => (
                          <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="grid gap-2 sm:grid-cols-4 text-xs">
              <SummaryStat label="Rows" value={summary.rowCount.toLocaleString()} />
              <SummaryStat label="Streams" value={summary.totalStreams.toLocaleString()} />
              <SummaryStat label="Earnings" value={fmtMoney(summary.totalEarnings)} />
              <SummaryStat
                label="Period"
                value={
                  summary.periodStart || summary.periodEnd
                    ? `${summary.periodStart ?? "?"} → ${summary.periodEnd ?? "?"}`
                    : "—"
                }
              />
            </div>

            {catalogSongs.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs flex flex-wrap items-center gap-2">
                  {matchSummary.matched > 0 ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  <span className="text-muted-foreground">
                    {matchSummary.matched} of {aggregates.length} unique tracks match your loaded catalog
                    ({catalogSongs.length} songs).
                  </span>
                  {matchSummary.isrc > 0 && (
                    <Badge variant="outline" className="text-[10px]">ISRC · {matchSummary.isrc}</Badge>
                  )}
                  {matchSummary.titleArtist > 0 && (
                    <Badge variant="outline" className="text-[10px]">Title+Artist · {matchSummary.titleArtist}</Badge>
                  )}
                  {matchSummary.titleOnly > 0 && (
                    <Badge variant="outline" className="text-[10px]">Title-only · {matchSummary.titleOnly}</Badge>
                  )}
                  {matchSummary.none > 0 && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">Unmatched · {matchSummary.none}</Badge>
                  )}
                </div>

                {/* Per-row match preview */}
                <div className="max-h-[220px] overflow-auto rounded-md border border-border/60">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-2 py-1.5 font-medium">Track</th>
                        <th className="px-2 py-1.5 font-medium">Match</th>
                        <th className="px-2 py-1.5 font-medium">Type</th>
                        <th className="px-2 py-1.5 font-medium text-right">Conf.</th>
                        <th className="px-2 py-1.5 font-medium text-right">Earnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggregates.slice(0, 100).map((a) => {
                        const m = matchByKey.get(a.key);
                        const matched = !!m?.catalogKey;
                        const conf = m?.confidence ?? 0;
                        const tone = matched
                          ? conf >= 0.95 ? "text-emerald-500"
                          : conf >= 0.85 ? "text-emerald-400"
                          : "text-amber-400"
                          : "text-muted-foreground";
                        return (
                          <tr key={a.key} className="border-t border-border/60 align-top">
                            <td className="px-2 py-1">
                              <div className="text-foreground truncate max-w-[200px]">{a.title || "—"}</div>
                              <div className="text-muted-foreground truncate max-w-[200px]">{a.artist || "—"}</div>
                              {a.isrc && <div className="font-mono text-[10px] text-muted-foreground/80">{a.isrc}</div>}
                            </td>
                            <td className="px-2 py-1">
                              {matched ? (
                                <>
                                  <div className="text-foreground truncate max-w-[200px]">{m!.catalogTitle}</div>
                                  <div className="text-muted-foreground truncate max-w-[200px]">{m!.catalogArtist || "—"}</div>
                                </>
                              ) : (
                                <span className="text-muted-foreground italic">{m?.reason || "no match"}</span>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                                {m?.matchType || "none"}
                              </Badge>
                            </td>
                            <td className={`px-2 py-1 text-right tabular-nums ${tone}`}>
                              {matched ? `${Math.round(conf * 100)}%` : "—"}
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums text-foreground/90">
                              {fmtMoney(a.earnings)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {aggregates.length > 100 && (
                    <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-t border-border/60">
                      Showing first 100 of {aggregates.length} unique tracks.
                    </div>
                  )}
                </div>
              </div>
            )}

            {missingRequired.length > 0 && (
              <div className="text-xs text-amber-500 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Missing required mapping: {missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}
              </div>
            )}

            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Q1 2026 statement, USD"
                rows={2}
                className="text-xs"
                maxLength={500}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={resetStaging} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={busy || missingRequired.length > 0}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                Save import
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Saved imports list */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2">Saved imports</h3>
        {loadingImports ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : imports.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No imports yet.</div>
        ) : (
          <div className="space-y-1.5">
            {imports.map((imp) => (
              <div
                key={imp.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {imp.distributor_name}
                    {imp.file_name && (
                      <span className="text-muted-foreground font-normal"> · {imp.file_name}</span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {imp.row_count.toLocaleString()} rows · {Number(imp.total_streams).toLocaleString()} streams ·{" "}
                    {fmtMoney(Number(imp.total_earnings))}
                    {imp.period_start && ` · ${imp.period_start} → ${imp.period_end ?? "?"}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openDetail(imp)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(imp.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewing?.distributor_name}</DialogTitle>
            <DialogDescription>
              {viewing?.row_count.toLocaleString()} rows · {fmtMoney(Number(viewing?.total_earnings ?? 0))}
              {viewing?.period_start && ` · ${viewing.period_start} → ${viewing.period_end ?? "?"}`}
            </DialogDescription>
          </DialogHeader>
          {viewingLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading rows…
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left border-b border-border/60">
                    <th className="py-1.5 pr-2">Track</th>
                    <th className="py-1.5 pr-2">Artist</th>
                    <th className="py-1.5 pr-2">ISRC</th>
                    <th className="py-1.5 pr-2 text-right">Streams</th>
                    <th className="py-1.5 pl-2 text-right">Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingRows.map((r) => (
                    <tr key={r.key} className="border-b border-border/30">
                      <td className="py-1 pr-2 truncate max-w-[200px]">{r.title || "—"}</td>
                      <td className="py-1 pr-2 truncate max-w-[160px] text-muted-foreground">{r.artist || "—"}</td>
                      <td className="py-1 pr-2 font-mono text-[10px] text-muted-foreground">{r.isrc || "—"}</td>
                      <td className="py-1 pr-2 text-right">{r.streams.toLocaleString()}</td>
                      <td className="py-1 pl-2 text-right">{fmtMoney(r.earnings)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {viewingRows.length >= 200 && (
                <p className="text-[11px] text-muted-foreground pt-2">
                  Showing top 200 tracks by earnings. Full data is preserved in your database.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}