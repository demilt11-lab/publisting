import { useEffect, useState } from "react";
import { Loader2, Flame, TrendingUp, TrendingDown, Minus, Sparkles, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface PredictorProps {
  songTitle: string;
  artist: string;
}

interface PredictorResult {
  status: "ok" | "error";
  score?: number;
  trajectory?: "viral" | "rising" | "steady" | "cooling";
  drivers?: { videos: number; creators: number; views: number; engagement: number; velocity: number };
  weekly_change_pct?: number;
  signals?: {
    video_count: number;
    unique_creators: number;
    total_views: number;
    total_likes: number;
    top_creators: Array<{ username: string; views?: number | null; url?: string | null }>;
  };
  rationale?: string | null;
  has_prior_snapshot?: boolean;
  error?: string;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const TRAJECTORY_META: Record<string, { label: string; cls: string; Icon: any }> = {
  viral: { label: "Viral", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30", Icon: Flame },
  rising: { label: "Rising", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: TrendingUp },
  steady: { label: "Steady", cls: "bg-secondary text-muted-foreground border-border", Icon: Minus },
  cooling: { label: "Cooling", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30", Icon: TrendingDown },
};

function scoreColor(score: number) {
  if (score >= 75) return "text-orange-400";
  if (score >= 55) return "text-emerald-400";
  if (score >= 35) return "text-foreground";
  return "text-muted-foreground";
}

export function TikTokViralPredictorPanel({ songTitle, artist }: PredictorProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictorResult | null>(null);

  const run = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("tiktok-viral-predictor", {
      body: { song_title: songTitle, artist },
    });
    if (error) {
      setResult({ status: "error", error: error.message });
    } else {
      setResult(data as PredictorResult);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (songTitle && artist) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songTitle, artist]);

  if (loading && !result) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Scanning TikTok creators and modeling virality…
      </div>
    );
  }

  if (!result || result.status !== "ok" || result.score == null) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Couldn't compute a viral score: {result?.error || "no data"}.
        </p>
        <Button size="sm" variant="outline" onClick={run}>Retry</Button>
      </div>
    );
  }

  const traj = TRAJECTORY_META[result.trajectory || "steady"];
  const TIcon = traj.Icon;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <div className={`text-4xl font-bold tabular-nums ${scoreColor(result.score)}`}>
            {result.score.toFixed(0)}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">/ 100</div>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] gap-1 ${traj.cls}`}>
              <TIcon className="w-2.5 h-2.5" /> {traj.label}
            </Badge>
            {result.has_prior_snapshot && result.weekly_change_pct != null && (
              <Badge variant="outline" className="text-[10px]">
                {result.weekly_change_pct > 0 ? "+" : ""}{result.weekly_change_pct.toFixed(0)}% w/w
              </Badge>
            )}
            {!result.has_prior_snapshot && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">First snapshot — velocity will appear next week</Badge>
            )}
          </div>
          {result.rationale && (
            <p className="text-xs text-muted-foreground leading-relaxed flex gap-1.5">
              <Sparkles className="w-3 h-3 mt-0.5 text-primary shrink-0" />
              <span>{result.rationale}</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {result.drivers && Object.entries(result.drivers).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border/50 bg-secondary/30 p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{k}</div>
            <div className="text-sm font-semibold text-foreground tabular-nums">{v}</div>
            <div className="mt-1 h-1 rounded-full bg-border/60 overflow-hidden">
              <div className="h-full rounded-full bg-primary/60" style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>

      {result.signals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div><span className="text-muted-foreground">Videos:</span> <span className="font-medium text-foreground">{fmt(result.signals.video_count)}</span></div>
          <div><span className="text-muted-foreground">Creators:</span> <span className="font-medium text-foreground">{fmt(result.signals.unique_creators)}</span></div>
          <div><span className="text-muted-foreground">Views:</span> <span className="font-medium text-foreground">{fmt(result.signals.total_views)}</span></div>
          <div><span className="text-muted-foreground">Likes:</span> <span className="font-medium text-foreground">{fmt(result.signals.total_likes)}</span></div>
        </div>
      )}

      {result.signals?.top_creators && result.signals.top_creators.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Top driving creators</div>
          <ul className="space-y-1">
            {result.signals.top_creators.slice(0, 5).map((c) => (
              <li key={c.username} className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground truncate">@{c.username}</span>
                <span className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                  {c.views != null && <span>{fmt(c.views)} views</span>}
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between items-center pt-1">
        <p className="text-[10px] text-muted-foreground">
          v1 heuristic from TikTok signals. Snapshots accumulate to train an ML model over time.
        </p>
        <Button size="sm" variant="ghost" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
        </Button>
      </div>
    </div>
  );
}