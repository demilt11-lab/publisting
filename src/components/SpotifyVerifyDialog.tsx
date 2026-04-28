import { useEffect, useMemo, useState } from "react";
import { Loader2, Music, ExternalLink, CheckCircle2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { matchAgainst, type MatchCandidate, type MatchResult } from "@/lib/song-matcher";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  song: { title: string; artist?: string; isrc?: string } | null;
  onLinked?: (spotifyTrackId: string, isrc?: string) => void;
}

interface Candidate {
  id: string;
  name: string;
  artists: string[];
  album?: string;
  release_date?: string;
  isrc?: string;
  duration_ms?: number;
  popularity?: number;
  external_url?: string;
}

function fmtDuration(ms?: number) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function SpotifyVerifyDialog({ open, onOpenChange, song, onLinked }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [usedCreds, setUsedCreds] = useState<"user" | "shared" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !song) return;
    setError(null);
    setCandidates([]);
    setUsedCreds(null);
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("spotify-verify", {
          body: { title: song.title, artist: song.artist, isrc: song.isrc },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Lookup failed");
        setCandidates(data.candidates || []);
        setUsedCreds(data.usedCreds || null);
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, song?.title, song?.artist, song?.isrc]);

  const ranked: MatchResult[] = useMemo(() => {
    if (!song) return [];
    const cands: MatchCandidate[] = candidates.map((c) => ({
      source: "spotify",
      externalId: c.id,
      title: c.name,
      artist: c.artists?.[0],
      writers: c.artists,
      isrc: c.isrc,
      raw: c,
    }));
    return matchAgainst({ title: song.title, artist: song.artist, isrc: song.isrc }, cands);
  }, [candidates, song?.title, song?.artist, song?.isrc]);

  const rankedById = useMemo(() => {
    const m = new Map<string, MatchResult>();
    for (const r of ranked) m.set(r.candidate.externalId, r);
    return m;
  }, [ranked]);

  async function linkCandidate(c: Candidate) {
    if (!song) return;
    setLinking(c.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");

      // 1) Upsert spotify_track_id onto verified_splits (keyed on title+artist for this user)
      const { data: existing } = await supabase
        .from("verified_splits")
        .select("id")
        .eq("user_id", user.id)
        .eq("song_title", song.title)
        .eq("song_artist", song.artist || "")
        .maybeSingle();

      if (existing?.id) {
        await supabase.from("verified_splits")
          .update({ spotify_track_id: c.id })
          .eq("id", existing.id);
      } else {
        await supabase.from("verified_splits").insert({
          user_id: user.id,
          song_title: song.title,
          song_artist: song.artist || "",
          source: "manual",
          writers: [],
          publishers: [],
          spotify_track_id: c.id,
        } as any);
      }

      // 2) Record the match
      const r = rankedById.get(c.id);
      await supabase.from("song_matches").insert({
        user_id: user.id,
        song_title: song.title,
        song_artist: song.artist || null,
        source: "spotify",
        external_id: c.id,
        confidence: r?.confidence ?? 0.5,
        match_type: r?.matchType ?? "manual",
        matched_data: c as any,
      } as any);

      toast({ title: "Linked to Spotify", description: c.name });
      onLinked?.(c.id, c.isrc);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Link failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setLinking(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="w-4 h-4 text-primary" />
            Verify on Spotify
          </DialogTitle>
          <DialogDescription>
            {song ? <>Looking up <span className="text-foreground">{song.title}</span>{song.artist ? <> · {song.artist}</> : null}</> : null}
            {usedCreds ? <span className="ml-2 text-xs text-muted-foreground">({usedCreds === "user" ? "your creds" : "shared key"})</span> : null}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Searching Spotify…
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No tracks found.</div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
            {candidates.map((c) => {
              const r = rankedById.get(c.id);
              const conf = r ? Math.round(r.confidence * 100) : null;
              const isrcMismatch = song?.isrc && c.isrc && song.isrc.toUpperCase() !== c.isrc.toUpperCase();
              return (
                <div key={c.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium truncate">{c.name}</div>
                      {conf !== null && (
                        <Badge variant={conf >= 85 ? "default" : "secondary"} className="text-[10px]">
                          {conf}% · {r!.matchType.replace("_", " ")}
                        </Badge>
                      )}
                      {isrcMismatch && (
                        <Badge variant="destructive" className="text-[10px]">ISRC mismatch</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.artists.join(", ")}{c.album ? <> · {c.album}</> : null}{c.release_date ? <> · {c.release_date}</> : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      ISRC {c.isrc || "—"} · {fmtDuration(c.duration_ms)} · pop {c.popularity ?? "—"}
                      {c.external_url ? (
                        <a href={c.external_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 underline">
                          open <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => linkCandidate(c)} disabled={linking === c.id}>
                    {linking === c.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                    Link
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}