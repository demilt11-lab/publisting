import { useEffect, useMemo, useState } from "react";
import { Loader2, Youtube, ExternalLink, CheckCircle2, AlertTriangle, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { matchAgainst, type MatchCandidate, type MatchResult } from "@/lib/song-matcher";

// Normalize an ISRC string (strip whitespace/hyphens, uppercase) and
// validate against the canonical 12-char format. Returns undefined if invalid.
function normalizeIsrc(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = String(raw).replace(/[\s\-_.]+/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(cleaned) ? cleaned : undefined;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  song: { title: string; artist?: string; isrc?: string; aliases?: string[] } | null;
}

interface Video {
  id: string;
  title: string;
  channelTitle: string;
  publishedAt?: string;
  thumbnail?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationIso?: string;
  isrcGuess?: string;
  url?: string;
}

function fmtNum(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function YoutubeVerifyDialog({ open, onOpenChange, song }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [usedCreds, setUsedCreds] = useState<"user" | "shared" | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [canonicalId, setCanonicalId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !song) return;
    setError(null); setVideos([]); setUsedCreds(null); setCanonicalId(null);
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("youtube-verify", {
          body: {
            title: song.title,
            artist: song.artist,
            isrc: normalizeIsrc(song.isrc),
            aliases: song.aliases,
          },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || "Lookup failed");
        setVideos(data.candidates || []);
        setUsedCreds(data.usedCreds || null);

        // Pre-load any previously-stored canonical id
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: vrow } = await supabase
            .from("verified_splits")
            .select("youtube_canonical_video_id")
            .eq("user_id", user.id)
            .eq("song_title", song.title)
            .eq("song_artist", song.artist || "")
            .maybeSingle();
          if (vrow?.youtube_canonical_video_id) setCanonicalId(vrow.youtube_canonical_video_id);
        }
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, song?.title, song?.artist]);

  const ranked: MatchResult[] = useMemo(() => {
    if (!song) return [];
    const cands: MatchCandidate[] = videos.map((v) => ({
      source: "youtube",
      externalId: v.id,
      title: v.title,
      artist: v.channelTitle,
      writers: [v.channelTitle],
      isrc: v.isrcGuess,
      raw: v,
    }));
    return matchAgainst({ title: song.title, artist: song.artist }, cands);
  }, [videos, song?.title, song?.artist]);

  const rankedById = useMemo(() => {
    const m = new Map<string, MatchResult>();
    for (const r of ranked) m.set(r.candidate.externalId, r);
    return m;
  }, [ranked]);

  async function setCanonical(v: Video) {
    if (!song) return;
    setLinking(v.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required");

      const { data: existing } = await supabase
        .from("verified_splits")
        .select("id")
        .eq("user_id", user.id)
        .eq("song_title", song.title)
        .eq("song_artist", song.artist || "")
        .maybeSingle();

      if (existing?.id) {
        await supabase.from("verified_splits")
          .update({ youtube_canonical_video_id: v.id })
          .eq("id", existing.id);
      } else {
        await supabase.from("verified_splits").insert({
          user_id: user.id,
          song_title: song.title,
          song_artist: song.artist || "",
          source: "manual",
          writers: [],
          publishers: [],
          youtube_canonical_video_id: v.id,
        } as any);
      }

      const r = rankedById.get(v.id);
      await supabase.from("song_matches").insert({
        user_id: user.id,
        song_title: song.title,
        song_artist: song.artist || null,
        source: "youtube",
        external_id: v.id,
        confidence: r?.confidence ?? 0.5,
        match_type: r?.matchType ?? "manual",
        matched_data: v as any,
      } as any);

      setCanonicalId(v.id);
      toast({ title: "Canonical YouTube video set", description: v.title });
    } catch (e: any) {
      toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setLinking(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="w-4 h-4 text-primary" />
            Verify on YouTube
          </DialogTitle>
          <DialogDescription>
            {song ? <>Looking up <span className="text-foreground">{song.title}</span>{song.artist ? <> · {song.artist}</> : null}</> : null}
            {usedCreds ? <span className="ml-2 text-xs text-muted-foreground">({usedCreds === "user" ? "your key" : "shared key"})</span> : null}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Searching YouTube…
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5" /> {error}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No videos found.</div>
        ) : (
          <div className="max-h-[460px] overflow-y-auto divide-y divide-border">
            {videos.map((v) => {
              const r = rankedById.get(v.id);
              const conf = r ? Math.round(r.confidence * 100) : null;
              const isCanonical = canonicalId === v.id;
              return (
                <div key={v.id} className="py-3 flex items-start gap-3">
                  {v.thumbnail ? (
                    <img src={v.thumbnail} alt="" className="w-24 h-14 object-cover rounded border border-border" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium truncate">{v.title}</div>
                      {conf !== null && (
                        <Badge variant={conf >= 85 ? "default" : "secondary"} className="text-[10px]">
                          {conf}% · {r!.matchType.replace("_", " ")}
                        </Badge>
                      )}
                      {isCanonical && (
                        <Badge className="text-[10px] bg-primary/20 text-primary border-primary/40">Canonical</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {v.channelTitle}{v.publishedAt ? <> · {v.publishedAt.slice(0, 10)}</> : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {fmtNum(v.viewCount)} views · {fmtNum(v.likeCount)} likes · {fmtNum(v.commentCount)} comments
                      {v.isrcGuess ? <> · ISRC <span className="text-foreground">{v.isrcGuess}</span></> : null}
                      {v.url ? (
                        <a href={v.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 underline">
                          open <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <Button size="sm" variant={isCanonical ? "secondary" : "default"} onClick={() => setCanonical(v)} disabled={linking === v.id}>
                    {linking === v.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      : isCanonical ? <CheckCircle2 className="w-3 h-3 mr-1" />
                      : <Star className="w-3 h-3 mr-1" />}
                    {isCanonical ? "Canonical" : "Mark canonical"}
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