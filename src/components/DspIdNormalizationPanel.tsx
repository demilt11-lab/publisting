import { useEffect, useMemo, useState } from "react";
import {
  Link2, Loader2, RefreshCw, Wand2, CheckCircle2,
  Music, Apple, Youtube, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { normalizeDspIds, type DspCanonicalRecord } from "@/lib/dspIdNormalization";

export interface DspIdCatalogSong {
  id?: string;
  title: string;
  artist?: string;
  isrc?: string;
  spotifyTrackId?: string;
  spotifyUrl?: string;
  appleUrl?: string;
  youtubeUrl?: string;
}

export interface DspIdUpdate {
  title: string;
  artist?: string;
  spotifyTrackId?: string;
  isrc?: string;
  appleTrackId?: string;
  appleUrl?: string;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  deezerTrackId?: string;
  deezerUrl?: string;
}

interface Props {
  songs: DspIdCatalogSong[];
  /** Apply canonical Spotify track ID + linked Apple/YouTube/Deezer IDs to the catalog rows. */
  onApply?: (updates: DspIdUpdate[]) => void;
}

const songKeyOf = (t: string, a?: string | null) =>
  `${(t || "").trim().toLowerCase()}::${(a || "").trim().toLowerCase()}`;

export function DspIdNormalizationPanel({ songs, onApply }: Props) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [records, setRecords] = useState<Map<string, DspCanonicalRecord>>(new Map());

  const summary = useMemo(() => {
    let resolved = 0, withApple = 0, withYouTube = 0, withDeezer = 0;
    for (const s of songs) {
      const r = records.get(songKeyOf(s.title, s.artist));
      if (!r) continue;
      resolved++;
      if (r.apple_track_id) withApple++;
      if (r.youtube_video_id) withYouTube++;
      if (r.deezer_track_id) withDeezer++;
    }
    return { resolved, withApple, withYouTube, withDeezer, total: songs.length };
  }, [songs, records]);

  async function run(force = false) {
    if (!songs.length) {
      toast({ title: "No songs", description: "Load a catalog first." });
      return;
    }
    setRunning(true);
    setProgress({ done: 0, total: songs.length, failed: 0 });
    let failed = 0;
    const chunkSize = 5;
    for (let i = 0; i < songs.length; i += chunkSize) {
      const chunk = songs.slice(i, i + chunkSize);
      const items = chunk.map((s) => ({
        spotify_track_id: s.spotifyTrackId,
        isrc: s.isrc,
        url: s.spotifyUrl || s.appleUrl || s.youtubeUrl,
        title: s.title,
        artist: s.artist,
      }));
      const res = await normalizeDspIds(items, { force });
      if (res.success) {
        setRecords((prev) => {
          const m = new Map(prev);
          chunk.forEach((s, idx) => {
            const r = res.results[idx]?.data;
            if (r) m.set(songKeyOf(s.title, s.artist), r);
            else failed++;
          });
          return m;
        });
      } else {
        failed += chunk.length;
      }
      setProgress({ done: Math.min(songs.length, i + chunk.length), total: songs.length, failed });
      // Soft rate-limit to be polite to Odesli
      await new Promise((r) => setTimeout(r, 300));
    }
    setRunning(false);
    toast({
      title: "DSP IDs normalized",
      description: `${songs.length - failed} resolved, ${failed} failed.`,
    });
  }

  function applyToCatalog() {
    const updates: DspIdUpdate[] = [];
    for (const s of songs) {
      const r = records.get(songKeyOf(s.title, s.artist));
      if (!r) continue;
      updates.push({
        title: s.title,
        artist: s.artist,
        spotifyTrackId: r.spotify_track_id,
        isrc: r.isrc || s.isrc,
        appleTrackId: r.apple_track_id || undefined,
        appleUrl: r.apple_url || undefined,
        youtubeVideoId: r.youtube_video_id || undefined,
        youtubeUrl: r.youtube_url || undefined,
        deezerTrackId: r.deezer_track_id || undefined,
        deezerUrl: r.deezer_url || undefined,
      });
    }
    if (!updates.length) {
      toast({ title: "Nothing to apply", description: "Run normalization first." });
      return;
    }
    onApply?.(updates);
    toast({
      title: "Applied to catalog",
      description: `${updates.length} song${updates.length === 1 ? "" : "s"} re-linked to canonical Spotify identity.`,
    });
  }

  useEffect(() => { /* records survive reruns */ }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">DSP track-ID normalization</h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Spotify-canonical</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Resolves every song to a single canonical Spotify track ID, then re-links the matching Apple Music, YouTube, and Deezer IDs to the same identity. Cached for 30 days workspace-wide. Use this to guarantee that DSP-side metrics (streams, playlist appearances, airplay) point to the same recording across all platforms.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => run(false)} disabled={running || !songs.length}>
            {running ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Linking ({progress.done}/{progress.total})</>) : (<><Wand2 className="h-3.5 w-3.5 mr-1.5" />Normalize all</>)}
          </Button>
          <Button size="sm" variant="outline" onClick={() => run(true)} disabled={running || !songs.length}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Force refresh
          </Button>
          {onApply && (
            <Button size="sm" variant="secondary" onClick={applyToCatalog} disabled={running || records.size === 0}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Apply DSP IDs to catalog
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Resolved</div>
          <div className="text-lg font-semibold text-foreground">{summary.resolved}/{summary.total}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Apple</div>
          <div className="text-lg font-semibold text-foreground">{summary.withApple}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">YouTube</div>
          <div className="text-lg font-semibold text-foreground">{summary.withYouTube}</div>
        </div>
        <div className="rounded-xl border border-border bg-background p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Deezer</div>
          <div className="text-lg font-semibold text-foreground">{summary.withDeezer}</div>
        </div>
      </div>

      {songs.length > 0 && (
        <div className="max-h-[300px] overflow-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Song</th>
                <th className="px-3 py-2 font-medium">Spotify ID</th>
                <th className="px-3 py-2 font-medium">Apple</th>
                <th className="px-3 py-2 font-medium">YouTube</th>
                <th className="px-3 py-2 font-medium">Deezer</th>
              </tr>
            </thead>
            <tbody>
              {songs.slice(0, 200).map((s, i) => {
                const r = records.get(songKeyOf(s.title, s.artist));
                return (
                  <tr key={(s.id || s.title) + i} className="border-t border-border align-top">
                    <td className="px-3 py-1.5">
                      <div className="text-foreground truncate max-w-[200px]">{r?.canonical_title || s.title}</div>
                      <div className="text-muted-foreground truncate max-w-[200px]">{r?.canonical_artist || s.artist || "—"}</div>
                      {r?.isrc && <div className="font-mono text-[10px] text-muted-foreground/80">{r.isrc}</div>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">
                      {r?.spotify_track_id ? (
                        <a href={`https://open.spotify.com/track/${r.spotify_track_id}`} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
                          <Music className="h-3 w-3" />{r.spotify_track_id.slice(0, 10)}…
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">
                      {r?.apple_track_id ? (
                        <a href={r.apple_url || "#"} target="_blank" rel="noreferrer" className="text-foreground inline-flex items-center gap-1">
                          <Apple className="h-3 w-3" />{r.apple_track_id}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">
                      {r?.youtube_video_id ? (
                        <a href={r.youtube_url || `https://youtu.be/${r.youtube_video_id}`} target="_blank" rel="noreferrer" className="text-foreground inline-flex items-center gap-1">
                          <Youtube className="h-3 w-3" />{r.youtube_video_id}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px]">
                      {r?.deezer_track_id ? (
                        <a href={r.deezer_url || `https://www.deezer.com/track/${r.deezer_track_id}`} target="_blank" rel="noreferrer" className="text-foreground inline-flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />{r.deezer_track_id}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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