import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CheckCircle2, ListMusic, Loader2, Radio, RefreshCw, Settings2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface SoundchartsCatalogSong {
  title: string;
  artist?: string;
  isrc?: string;
  spotifyId?: string;
}

export interface SoundchartsSongRecord {
  id: string;
  song_title: string;
  song_artist: string | null;
  isrc: string | null;
  soundcharts_song_uuid: string | null;
  metadata: any;
  playlists: any[];
  charts: any[];
  airplay: any;
  playlist_count: number;
  chart_count: number;
  airplay_spins: number;
  fetched_at: string;
  expires_at: string;
}

interface Props {
  songs: SoundchartsCatalogSong[];
}

type ConnStatus = "unknown" | "ok" | "missing" | "rejected" | "error";

export function SoundchartsCatalogPanel({ songs }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnStatus>("unknown");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [testing, setTesting] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failed: number }>({ done: 0, total: 0, failed: 0 });
  const [records, setRecords] = useState<Map<string, SoundchartsSongRecord>>(new Map());
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [openSong, setOpenSong] = useState<SoundchartsSongRecord | null>(null);

  const songKeyOf = (t: string, a?: string | null) =>
    `${(t || "").trim().toLowerCase()}::${(a || "").trim().toLowerCase()}`;

  // Load existing records for the current catalog.
  async function loadRecords() {
    setLoadingRecords(true);
    try {
      const { data, error } = await supabase
        .from("soundcharts_song_data")
        .select("*")
        .order("fetched_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const m = new Map<string, SoundchartsSongRecord>();
      for (const r of (data || []) as SoundchartsSongRecord[]) {
        const k = songKeyOf(r.song_title, r.song_artist);
        if (!m.has(k)) m.set(k, r); // keep most-recent
      }
      setRecords(m);
    } catch (e: any) {
      toast({ title: "Couldn't load Soundcharts data", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setLoadingRecords(false);
    }
  }

  useEffect(() => { void loadRecords(); }, []);

  // Test connection: call function in test_only mode.
  async function testConnection() {
    setTesting(true);
    setStatus("unknown");
    try {
      const { data, error } = await supabase.functions.invoke("soundcharts-song-fetch", {
        body: { song_title: "ping", test_only: true },
      });
      if (error) {
        const msg = error.message || "";
        if (/missing_credentials/i.test(msg) || /not configured/i.test(msg)) {
          setStatus("missing");
          setStatusMsg("Soundcharts credentials not set on the backend.");
        } else {
          setStatus("error");
          setStatusMsg(msg);
        }
        return;
      }
      if ((data as any)?.success) {
        setStatus("ok");
        setStatusMsg("Soundcharts connection verified.");
      } else {
        setStatus("rejected");
        setStatusMsg((data as any)?.error || "Soundcharts rejected the credentials.");
      }
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(String(e?.message || e));
    } finally {
      setTesting(false);
    }
  }

  // Per-song fetch (used by parent via callback as well).
  async function fetchOne(s: SoundchartsCatalogSong, force = false): Promise<SoundchartsSongRecord | null> {
    const { data, error } = await supabase.functions.invoke("soundcharts-song-fetch", {
      body: {
        song_title: s.title,
        song_artist: s.artist,
        isrc: s.isrc,
        spotify_id: s.spotifyId,
        force_refresh: force,
      },
    });
    if (error) throw new Error(error.message);
    if (!(data as any)?.success) throw new Error((data as any)?.error || "Fetch failed");
    const rec = (data as any).data as SoundchartsSongRecord;
    setRecords((m) => {
      const n = new Map(m);
      n.set(songKeyOf(rec.song_title, rec.song_artist), rec);
      return n;
    });
    return rec;
  }

  async function bulkEnrich(force = false) {
    if (!songs.length) {
      toast({ title: "No songs in catalog", variant: "destructive" });
      return;
    }
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: songs.length, failed: 0 });
    let failed = 0;
    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      try {
        await fetchOne(s, force);
      } catch (e) {
        failed++;
        console.warn("Soundcharts fetch failed for", s.title, e);
      }
      setBulkProgress({ done: i + 1, total: songs.length, failed });
      // Light throttle to respect Soundcharts rate limits.
      await new Promise((r) => setTimeout(r, 350));
    }
    setBulkRunning(false);
    toast({
      title: "Soundcharts enrichment complete",
      description: `${songs.length - failed}/${songs.length} songs fetched${failed ? `, ${failed} failed` : ""}.`,
    });
  }

  const stats = useMemo(() => {
    let withData = 0, totalPlaylists = 0, totalCharts = 0, totalSpins = 0;
    for (const s of songs) {
      const r = records.get(songKeyOf(s.title, s.artist));
      if (r) {
        withData++;
        totalPlaylists += r.playlist_count || 0;
        totalCharts += r.chart_count || 0;
        totalSpins += r.airplay_spins || 0;
      }
    }
    return { withData, totalPlaylists, totalCharts, totalSpins };
  }, [records, songs]);

  function StatusBadge() {
    if (status === "ok") return <Badge className="bg-primary/20 text-primary border-primary/40 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" /> Connected</Badge>;
    if (status === "missing") return <Badge variant="destructive" className="text-[10px]"><XCircle className="w-3 h-3 mr-1" /> Not configured</Badge>;
    if (status === "rejected") return <Badge variant="destructive" className="text-[10px]"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
    if (status === "error") return <Badge variant="destructive" className="text-[10px]"><XCircle className="w-3 h-3 mr-1" /> Error</Badge>;
    return <Badge variant="outline" className="text-[10px]">Untested</Badge>;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Soundcharts API
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Pulls per-song metadata, DSP playlist appearances, chart positions and radio airplay.
            Credentials (<code>SOUNDCHARTS_APP_ID</code> and <code>SOUNDCHARTS_API_KEY</code>) are stored as backend secrets.
          </p>
        </div>
        <StatusBadge />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}>
          {testing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Settings2 className="w-3 h-3 mr-1" />}
          Test connection
        </Button>
        <Button size="sm" onClick={() => bulkEnrich(false)} disabled={bulkRunning || !songs.length}>
          {bulkRunning
            ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> {bulkProgress.done}/{bulkProgress.total}</>
            : <><Activity className="w-3 h-3 mr-1" /> Enrich all {songs.length ? `(${songs.length})` : ""}</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => bulkEnrich(true)} disabled={bulkRunning || !songs.length} title="Force re-fetch (bypasses 7-day cache)">
          <RefreshCw className="w-3 h-3 mr-1" /> Force refresh
        </Button>
        <Button size="sm" variant="ghost" onClick={loadRecords} disabled={loadingRecords}>
          {loadingRecords ? <Loader2 className="w-3 h-3 animate-spin" /> : "Reload data"}
        </Button>
        {statusMsg && (
          <span className={`text-[11px] ${status === "ok" ? "text-primary" : status === "unknown" ? "text-muted-foreground" : "text-amber-400"}`}>
            {statusMsg}
          </span>
        )}
      </div>

      {bulkRunning && (
        <div className="h-1 w-full overflow-hidden rounded bg-secondary/30">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}
          />
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Stat label="Songs with data" value={`${stats.withData}/${songs.length}`} />
        <Stat label="Playlist appearances" value={String(stats.totalPlaylists)} icon={<ListMusic className="w-3 h-3" />} />
        <Stat label="Chart entries" value={String(stats.totalCharts)} icon={<BarChart3 className="w-3 h-3" />} />
        <Stat label="Radio spins (week)" value={String(stats.totalSpins)} icon={<Radio className="w-3 h-3" />} />
      </div>

      {/* Per-song data table */}
      {songs.length > 0 && (
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/30 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Title</th>
                <th className="px-2 py-1.5 text-left font-medium">Artist</th>
                <th className="px-2 py-1.5 text-right font-medium">Playlists</th>
                <th className="px-2 py-1.5 text-right font-medium">Charts</th>
                <th className="px-2 py-1.5 text-right font-medium">Spins/wk</th>
                <th className="px-2 py-1.5 text-right font-medium">Updated</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {songs.map((s, i) => {
                const rec = records.get(songKeyOf(s.title, s.artist));
                return (
                  <tr key={`${s.title}-${i}`} className="border-t border-border/50">
                    <td className="px-2 py-1.5 max-w-[180px] truncate">{s.title}</td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[140px] truncate">{s.artist || "—"}</td>
                    <td className="px-2 py-1.5 text-right">{rec?.playlist_count ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{rec?.chart_count ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{rec?.airplay_spins ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">
                      {rec ? new Date(rec.fetched_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {rec ? (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setOpenSong(rec)}>View</Button>
                      ) : (
                        <Button
                          size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                          onClick={async () => {
                            try { await fetchOne(s); }
                            catch (e: any) { toast({ title: "Fetch failed", description: String(e?.message || e), variant: "destructive" }); }
                          }}
                        >Fetch</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!openSong} onOpenChange={(o) => !o && setOpenSong(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {openSong && (
            <>
              <DialogHeader>
                <DialogTitle>{openSong.song_title}{openSong.song_artist ? ` — ${openSong.song_artist}` : ""}</DialogTitle>
                <DialogDescription className="text-[11px]">
                  {openSong.metadata?.isrc ? <>ISRC <code>{openSong.metadata.isrc}</code> · </> : null}
                  Fetched {new Date(openSong.fetched_at).toLocaleString()} · Cache expires {new Date(openSong.expires_at).toLocaleDateString()}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <Block title={<><ListMusic className="w-3 h-3" /> Playlists ({openSong.playlist_count})</>}>
                  {openSong.playlists.length === 0 ? <Empty /> : (
                    <ul className="space-y-1">
                      {openSong.playlists.map((p, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate">{p.playlist_name || "—"}</span>
                          <span className="text-muted-foreground shrink-0">
                            {p.position ? `#${p.position}` : ""} {p.subscribers ? `· ${p.subscribers.toLocaleString()}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Block>
                <Block title={<><BarChart3 className="w-3 h-3" /> Charts ({openSong.chart_count})</>}>
                  {openSong.charts.length === 0 ? <Empty /> : (
                    <ul className="space-y-1">
                      {openSong.charts.map((c, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate">{c.chart_name} {c.country ? <span className="text-muted-foreground">[{c.country}]</span> : null}</span>
                          <span className="text-foreground shrink-0">#{c.position}{c.peak ? ` (peak #${c.peak})` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Block>
                <Block title={<><Radio className="w-3 h-3" /> Airplay ({openSong.airplay_spins} spins)</>}>
                  {!openSong.airplay?.stations?.length ? <Empty /> : (
                    <ul className="space-y-1">
                      {openSong.airplay.stations.map((s: any, i: number) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate">{s.station} {s.country ? <span className="text-muted-foreground">[{s.country}]</span> : null}</span>
                          <span className="text-muted-foreground shrink-0">{s.spins ?? 0}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Block>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-2">
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
function Block({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-2">
      <div className="text-xs font-semibold mb-1 flex items-center gap-1">{title}</div>
      {children}
    </div>
  );
}
function Empty() { return <div className="text-muted-foreground text-[11px]">No data.</div>; }