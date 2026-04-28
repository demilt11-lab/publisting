import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Music2, AlertTriangle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchStreamingStats } from "@/lib/api/streamingStats";
import { useAuth } from "@/hooks/useAuth";

export interface TruthSourceSong {
  id?: string;
  title: string;
  artist?: string;
  isrc?: string;
  spotifyTrackId?: string;
  spotifyStreams?: number;
}

interface TruthRecord {
  id: string;
  song_title: string;
  song_artist: string | null;
  isrc: string | null;
  spotify_track_id: string | null;
  spotify_url: string | null;
  popularity: number | null;
  stream_count: number | null;
  is_exact: boolean;
  estimated_streams: number | null;
  source: string;
  fetched_at: string;
  expires_at: string;
}

interface Props {
  songs: TruthSourceSong[];
  /** Called with verified per-song stream counts so the page can apply them to the catalog. */
  onApply?: (updates: { title: string; artist?: string; spotifyStreams: number; isExact: boolean }[]) => void;
}

const songKeyOf = (t: string, a?: string | null) =>
  `${(t || "").trim().toLowerCase()}::${(a || "").trim().toLowerCase()}`;

export function SpotifyTruthSourcePanel({ songs, onApply }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [records, setRecords] = useState<Map<string, TruthRecord>>(new Map());
  const [loading, setLoading] = useState(false);

  async function loadRecords() {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("spotify_stream_truth")
        .select("*")
        .eq("user_id", user.id)
        .order("fetched_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map = new Map<string, TruthRecord>();
      for (const r of data || []) {
        map.set(songKeyOf(r.song_title, r.song_artist), r as TruthRecord);
      }
      setRecords(map);
    } catch (e) {
      console.error("Load truth records failed:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRecords(); /* eslint-disable-line */ }, [user?.id]);

  const summary = useMemo(() => {
    let exact = 0, estimated = 0, missing = 0, total = songs.length;
    let exactStreams = 0;
    for (const s of songs) {
      const r = records.get(songKeyOf(s.title, s.artist));
      if (!r || r.stream_count == null) { missing++; continue; }
      if (r.is_exact) { exact++; exactStreams += Number(r.stream_count) || 0; }
      else estimated++;
    }
    return { exact, estimated, missing, total, exactStreams };
  }, [songs, records]);

  async function fetchOne(s: TruthSourceSong): Promise<TruthRecord | null> {
    if (!user) return null;
    const stats = await fetchStreamingStats(s.title, s.artist || "", s.spotifyTrackId);
    if (!stats) return null;
    const sp = stats.spotify;
    const row = {
      user_id: user.id,
      song_title: s.title,
      song_artist: s.artist || null,
      isrc: s.isrc || null,
      spotify_track_id: s.spotifyTrackId || null,
      spotify_url: sp.url || null,
      popularity: sp.popularity ?? null,
      stream_count: sp.streamCount ?? null,
      is_exact: !!sp.isExactStreamCount,
      estimated_streams: sp.estimatedStreams ?? null,
      source: sp.isExactStreamCount ? "pathfinder" : "popularity_estimate",
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
    };
    const { data, error } = await supabase
      .from("spotify_stream_truth")
      .insert(row)
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("Insert truth row failed:", error);
      return null;
    }
    return data as TruthRecord;
  }

  async function runBulk(force = false) {
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to verify Spotify streams.", variant: "destructive" });
      return;
    }
    if (!songs.length) {
      toast({ title: "No songs", description: "Load a catalog first." });
      return;
    }
    setRunning(true);
    setProgress({ done: 0, total: songs.length, failed: 0 });
    let failed = 0;
    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      const key = songKeyOf(s.title, s.artist);
      const existing = records.get(key);
      const fresh = existing && new Date(existing.expires_at) > new Date();
      if (!force && fresh && existing.is_exact) {
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        continue;
      }
      const rec = await fetchOne(s);
      if (rec) {
        setRecords((prev) => { const m = new Map(prev); m.set(key, rec); return m; });
      } else {
        failed++;
      }
      setProgress((p) => ({ done: p.done + 1, total: p.total, failed }));
      // Soft rate-limit
      await new Promise((r) => setTimeout(r, 250));
    }
    setRunning(false);
    toast({
      title: "Spotify verification complete",
      description: `${songs.length - failed} verified, ${failed} failed.`,
    });
  }

  function applyToCatalog() {
    const updates: { title: string; artist?: string; spotifyStreams: number; isExact: boolean }[] = [];
    for (const s of songs) {
      const r = records.get(songKeyOf(s.title, s.artist));
      if (r && r.stream_count != null) {
        updates.push({ title: s.title, artist: s.artist, spotifyStreams: Number(r.stream_count), isExact: r.is_exact });
      }
    }
    if (!updates.length) {
      toast({ title: "Nothing to apply", description: "Run verification first." });
      return;
    }
    onApply?.(updates);
    toast({ title: "Applied to catalog", description: `${updates.length} song${updates.length === 1 ? "" : "s"} updated with verified Spotify streams.` });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Spotify stream truth-source</h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Pathfinder</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pulls exact per-track Spotify play counts (Pathfinder) for every song in the catalog. Falls back to popularity-based estimate when an exact count is unavailable. Cached for 7 days per user.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => runBulk(false)} disabled={running || !songs.length}>
            {running ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Verifying ({progress.done}/{progress.total})</>) : (<><Wand2 className="h-3.5 w-3.5 mr-1.5" />Verify all</>)}
          </Button>
          <Button size="sm" variant="outline" onClick={() => runBulk(true)} disabled={running || !songs.length}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Force refresh
          </Button>
          {onApply && (
            <Button size="sm" variant="secondary" onClick={applyToCatalog} disabled={running || summary.total === 0 || (summary.exact + summary.estimated) === 0}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Apply to catalog
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Exact</div>
          <div className="text-lg font-semibold text-foreground">{summary.exact}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Estimated</div>
          <div className="text-lg font-semibold text-foreground">{summary.estimated}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Missing</div>
          <div className="text-lg font-semibold text-foreground">{summary.missing}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Verified streams</div>
          <div className="text-lg font-semibold text-foreground">{summary.exactStreams.toLocaleString()}</div>
        </div>
      </div>

      {songs.length > 0 && (
        <div className="max-h-[260px] overflow-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Song</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium text-right">Spotify streams</th>
                <th className="px-3 py-2 font-medium text-right">Pop.</th>
              </tr>
            </thead>
            <tbody>
              {songs.slice(0, 200).map((s, i) => {
                const r = records.get(songKeyOf(s.title, s.artist));
                return (
                  <tr key={(s.id || s.title) + i} className="border-t border-border">
                    <td className="px-3 py-1.5">
                      <div className="text-foreground truncate max-w-[260px]">{s.title}</div>
                      <div className="text-muted-foreground truncate max-w-[260px]">{s.artist || "—"}</div>
                    </td>
                    <td className="px-3 py-1.5">
                      {!r ? <span className="text-muted-foreground">—</span> : r.is_exact ? (
                        <Badge variant="outline" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />Exact</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />Estimated</Badge>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r?.stream_count != null ? Number(r.stream_count).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {r?.popularity ?? "—"}
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

      {loading && (
        <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Loading cached records…</div>
      )}
    </div>
  );
}