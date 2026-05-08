import { useEffect, useState } from "react";
import { Flame, Loader2, TrendingUp, TrendingDown, Minus, RefreshCw, Sparkles } from "lucide-react";
import { AppShell, NavSection } from "@/components/layout/AppShell";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const navigate = useNavigate();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [sortBy, setSortBy] = useState<"score" | "weekly_change_pct" | "video_count" | "total_views" | "computed_at">("score");
  const [trajectory, setTrajectory] = useState<"all" | "viral" | "rising" | "steady" | "cooling">("all");
  const [dateRange, setDateRange] = useState<"all" | "24h" | "7d" | "30d">("all");

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

  const now = Date.now();
  const rangeMs: Record<string, number | null> = {
    all: null,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  const filtered = rows
    .filter((r) => trajectory === "all" || r.trajectory === trajectory)
    .filter((r) => {
      const ms = rangeMs[dateRange];
      if (!ms) return true;
      const t = new Date(r.computed_at).getTime();
      return now - t <= ms;
    })
    .slice()
    .sort((a, b) => {
      const av = Number((a as any)[sortBy] ?? (sortBy === "computed_at" ? new Date(a.computed_at).getTime() : 0));
      const bv = Number((b as any)[sortBy] ?? (sortBy === "computed_at" ? new Date(b.computed_at).getTime() : 0));
      if (sortBy === "computed_at") {
        return new Date(b.computed_at).getTime() - new Date(a.computed_at).getTime();
      }
      return bv - av;
    });

  const discoverNow = async () => {
    setDiscovering(true);
    const { data, error } = await supabase.functions.invoke("tiktok-viral-predictor", {
      body: { discover: true, limit: 15 },
    });
    setDiscovering(false);
    if (error || data?.status !== "ok") {
      toast.error("Discovery failed: " + (error?.message || data?.error || "unknown"));
    } else {
      toast.success(`Scored ${data.scored?.length ?? 0} trending tracks from TikTok`);
      load();
    }
  };

  return (
    <AppShell
      activeSection={"home" as NavSection}
      onSectionChange={(s) => navigate("/", { state: { section: s } })}
    >
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

        <div className="rounded-xl border border-border/50 bg-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" /> Live TikTok discovery
            </div>
            <p className="text-xs text-muted-foreground">
              Auto-refreshes daily by sweeping TikTok's own trending search results — no manual input. Trigger an on-demand sweep to pick up brand-new tracks immediately.
            </p>
          </div>
          <Button onClick={discoverNow} disabled={discovering}>
            {discovering ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            {discovering ? "Discovering…" : "Discover trending now"}
          </Button>
        </div>

        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border/50 bg-surface">
            <span className="text-xs text-muted-foreground mr-1">Sort</span>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="h-8 text-xs w-[150px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="score" className="text-xs">Viral score</SelectItem>
                <SelectItem value="weekly_change_pct" className="text-xs">Weekly growth</SelectItem>
                <SelectItem value="video_count" className="text-xs">Video count</SelectItem>
                <SelectItem value="total_views" className="text-xs">Total views</SelectItem>
                <SelectItem value="computed_at" className="text-xs">Most recent</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-2 mr-1">Trajectory</span>
            <Select value={trajectory} onValueChange={(v) => setTrajectory(v as typeof trajectory)}>
              <SelectTrigger className="h-8 text-xs w-[120px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All</SelectItem>
                <SelectItem value="viral" className="text-xs">Viral</SelectItem>
                <SelectItem value="rising" className="text-xs">Rising</SelectItem>
                <SelectItem value="steady" className="text-xs">Steady</SelectItem>
                <SelectItem value="cooling" className="text-xs">Cooling</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-2 mr-1">Updated</span>
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
              <SelectTrigger className="h-8 text-xs w-[130px] bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Any time</SelectItem>
                <SelectItem value="24h" className="text-xs">Last 24 hours</SelectItem>
                <SelectItem value="7d" className="text-xs">This week</SelectItem>
                <SelectItem value="30d" className="text-xs">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {rows.length}</span>
          </div>
          {loading && rows.length === 0 ? (
            <div className="p-8 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading leaderboard…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "No tracks yet — run a discovery sweep to pull TikTok's current trending sounds."
                : "No tracks match these filters."}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((r, i) => {
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