import { useEffect, useMemo, useState } from "react";
import { Fingerprint, Loader2, RefreshCw, Wand2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { normalizeMetadata, type NormalizedRecord } from "@/lib/metadataNormalization";

export interface NormalizationCatalogSong {
  id?: string;
  title: string;
  artist?: string;
  isrc?: string;
  iswc?: string;
  spotifyTrackId?: string;
}

interface Props {
  songs: NormalizationCatalogSong[];
  /** Receive resolved canonical IDs (ISRC/ISWC/Spotify ID) so the page can patch the catalog rows. */
  onApply?: (updates: { title: string; artist?: string; isrc?: string; iswc?: string; spotifyTrackId?: string }[]) => void;
}

const songKeyOf = (t: string, a?: string | null) =>
  `${(t || "").trim().toLowerCase()}::${(a || "").trim().toLowerCase()}`;

export function MetadataNormalizationPanel({ songs, onApply }: Props) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [records, setRecords] = useState<Map<string, NormalizedRecord>>(new Map());

  const summary = useMemo(() => {
    let withIsrc = 0, withIswc = 0, withWriterIpis = 0, withSpotify = 0;
    for (const s of songs) {
      const r = records.get(songKeyOf(s.title, s.artist));
      if (!r) continue;
      if (r.isrc) withIsrc++;
      if (r.iswc) withIswc++;
      if (r.spotify_track_id) withSpotify++;
      if (Array.isArray(r.writer_ipis) && r.writer_ipis.some((w) => w.ipi)) withWriterIpis++;
    }
    return { withIsrc, withIswc, withWriterIpis, withSpotify, total: songs.length, resolved: records.size };
  }, [songs, records]);

  async function run(force = false) {
    if (!songs.length) {
      toast({ title: "No songs", description: "Load a catalog first." });
      return;
    }
    setRunning(true);
    setProgress({ done: 0, total: songs.length });
    const chunkSize = 5;
    for (let i = 0; i < songs.length; i += chunkSize) {
      const chunk = songs.slice(i, i + chunkSize);
      const items = chunk.map((s) => ({
        title: s.title,
        artist: s.artist,
        isrc: s.isrc,
        iswc: s.iswc,
        spotify_track_id: s.spotifyTrackId,
      }));
      const res = await normalizeMetadata(items, { force });
      if (res.success) {
        setRecords((prev) => {
          const m = new Map(prev);
          chunk.forEach((s, idx) => {
            const r = res.results[idx]?.data;
            if (r) m.set(songKeyOf(s.title, s.artist), r);
          });
          return m;
        });
      } else {
        console.error("Normalize chunk failed:", res.error);
      }
      setProgress((p) => ({ done: Math.min(p.total, i + chunk.length), total: p.total }));
    }
    setRunning(false);
    toast({ title: "Normalization complete", description: `Resolved ${records.size + songs.length} song${songs.length === 1 ? "" : "s"}.` });
  }

  useEffect(() => { /* cache state holds across reruns */ }, []);

  function applyToCatalog() {
    const updates: { title: string; artist?: string; isrc?: string; iswc?: string; spotifyTrackId?: string }[] = [];
    for (const s of songs) {
      const r = records.get(songKeyOf(s.title, s.artist));
      if (!r) continue;
      updates.push({
        title: s.title,
        artist: s.artist,
        isrc: r.isrc || s.isrc,
        iswc: r.iswc || s.iswc,
        spotifyTrackId: r.spotify_track_id || s.spotifyTrackId,
      });
    }
    if (!updates.length) {
      toast({ title: "Nothing to apply", description: "Run normalization first." });
      return;
    }
    onApply?.(updates);
    toast({ title: "Applied to catalog", description: `${updates.length} row${updates.length === 1 ? "" : "s"} updated with canonical identifiers.` });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Metadata normalization (ISRC · ISWC · IPI)</h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">MusicBrainz + Spotify</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Resolves each song to a canonical identity by chaining ISRC → MusicBrainz recording → ISWC work → writer IPIs, then enriches with Spotify track IDs. Cached for 30 days workspace-wide. Use this before cross-checking PRO/CMO data, distributor statements, or registry shares.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => run(false)} disabled={running || !songs.length}>
            {running ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Resolving ({progress.done}/{progress.total})</>) : (<><Wand2 className="h-3.5 w-3.5 mr-1.5" />Normalize all</>)}
          </Button>
          <Button size="sm" variant="outline" onClick={() => run(true)} disabled={running || !songs.length}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Force refresh
          </Button>
          {onApply && (
            <Button size="sm" variant="secondary" onClick={applyToCatalog} disabled={running || records.size === 0}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Apply IDs to catalog
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Resolved</div>
          <div className="text-lg font-semibold text-foreground">{summary.resolved}/{summary.total}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ISRC</div>
          <div className="text-lg font-semibold text-foreground">{summary.withIsrc}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">ISWC</div>
          <div className="text-lg font-semibold text-foreground">{summary.withIswc}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Writer IPIs</div>
          <div className="text-lg font-semibold text-foreground">{summary.withWriterIpis}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Spotify ID</div>
          <div className="text-lg font-semibold text-foreground">{summary.withSpotify}</div>
        </div>
      </div>

      {songs.length > 0 && (
        <div className="max-h-[300px] overflow-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Song</th>
                <th className="px-3 py-2 font-medium">ISRC</th>
                <th className="px-3 py-2 font-medium">ISWC</th>
                <th className="px-3 py-2 font-medium">Writers (IPI)</th>
                <th className="px-3 py-2 font-medium text-right">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {songs.slice(0, 200).map((s, i) => {
                const r = records.get(songKeyOf(s.title, s.artist));
                return (
                  <tr key={(s.id || s.title) + i} className="border-t border-border align-top">
                    <td className="px-3 py-1.5">
                      <div className="text-foreground truncate max-w-[220px]">{r?.canonical_title || s.title}</div>
                      <div className="text-muted-foreground truncate max-w-[220px]">{r?.canonical_artist || s.artist || "—"}</div>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-foreground">{r?.isrc || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-foreground">{r?.iswc || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-1.5">
                      {r?.writer_ipis?.length ? (
                        <div className="space-y-0.5">
                          {r.writer_ipis.slice(0, 4).map((w, j) => (
                            <div key={j} className="flex items-center gap-1.5">
                              <span className="text-foreground truncate max-w-[160px]">{w.name}</span>
                              {w.ipi ? (
                                <span className="font-mono text-[10px] text-muted-foreground">{w.ipi}</span>
                              ) : (
                                <AlertCircle className="h-3 w-3 text-amber-500" />
                              )}
                            </div>
                          ))}
                          {r.writer_ipis.length > 4 && (
                            <div className="text-[10px] text-muted-foreground">+{r.writer_ipis.length - 4} more</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {r ? `${Math.round((r.confidence || 0) * 100)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {songs.length > 200 && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">Showing first 200 of {songs.length}.</div>
          )}
        </div>
      )}
    </div>
  );
}