import { useEffect, useState } from "react";
import { Flame, Loader2, TrendingUp, TrendingDown, Minus, RefreshCw, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LeaderboardRow {
  id: string;
  song_title: string;
  artist: string;
  score: number;
  trajectory: string;
  rationale: string | null;
  video_count: number | null;
  unique_creators: number | null;
  total_views: number | null;
  weekly_change_pct: number | null;
  computed_at: string;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const TRAJ_ICON: Record<string, any> = { viral: Flame, rising: TrendingUp, cooling: TrendingDown, steady: Minus };
const TRAJ_CLS: Record<string, string> = {
  viral: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  rising: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cooling: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  steady: "bg-secondary text-muted-foreground border-border",
};

function scoreColor(score: number) {
  if (score >= 75) return "text-orange-400";
  if (score >= 55) return "text-emerald-400";
  if (score >= 35) return "text-foreground";
  return "text-muted-foreground";
}

export default function ViralPredictor() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("tiktok-viral-predictor", {
      body: { leaderboard: true, limit: 50 },
    });
    if (error) {
      toast.error("Failed to load leaderboard: " + error.message);
    } else {
      setRows((data?.leaderboard || []) as LeaderboardRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addTrack = async () => {
    if (!title.trim() || !artist.trim()) {
      toast.error("Enter both song title and artist");
      return;
    }
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("tiktok-viral-predictor", {
      body: { song_title: title.trim(), artist: artist.trim() },
    });
    setAdding(false);
    if (error || data?.status !== "ok") {
      toast.error("Couldn't score that track: " + (error?.message || data?.error || "unknown"));
    } else {
      toast.success(`Scored "${title}" — ${data.score}/100`);
      setTitle(""); setArtist("");
      load();
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Flame className="w-6 h-6 text-orange-400" /> TikTok Viral Predictor
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tracks ranked by predicted virality from TikTok UGC signals (videos, unique creators, view velocity, engagement, week-over-week growth).
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
          <div className="text-sm font-semibold text-foreground">Score a new track</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Song title" value={title} onChange={(e) => setTitle(e.target.value)} className="sm:flex-1" />
            <Input placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} className="sm:flex-1" />
            <Button onClick={addTrack} disabled={adding}>
              {adding ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Score
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          {loading && rows.length === 0 ? (
            <div className="p-8 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading leaderboard…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No tracks scored yet. Use the form above to add your first one.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {rows.map((r, i) => {
                const TIcon = TRAJ_ICON[r.trajectory] || Minus;
                return (
                  <div key={r.id} className="p-4 flex items-start gap-4 hover:bg-secondary/20 transition-colors">
                    <div className="text-xs text-muted-foreground tabular-nums w-6 text-right pt-1">#{i + 1}</div>
                    <div className={`text-2xl font-bold tabular-nums w-14 text-right ${scoreColor(Number(r.score))}`}>
                      {Number(r.score).toFixed(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-foreground truncate">{r.song_title}</div>
                        <div className="text-sm text-muted-foreground truncate">— {r.artist}</div>
                        <Badge variant="outline" className={`text-[10px] gap-1 ${TRAJ_CLS[r.trajectory] || ""}`}>
                          <TIcon className="w-2.5 h-2.5" /> {r.trajectory}
                        </Badge>
                        {r.weekly_change_pct != null && (
                          <Badge variant="outline" className="text-[10px]">
                            {r.weekly_change_pct > 0 ? "+" : ""}{Number(r.weekly_change_pct).toFixed(0)}% w/w
                          </Badge>
                        )}
                      </div>
                      {r.rationale && (
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.rationale}</p>
                      )}
                      <div className="flex gap-4 mt-2 text-[11px] text-muted-foreground">
                        <span>{fmt(r.video_count)} videos</span>
                        <span>{fmt(r.unique_creators)} creators</span>
                        <span>{fmt(r.total_views)} views</span>
                        <span>updated {new Date(r.computed_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}