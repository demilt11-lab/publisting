import { useState, useEffect, useCallback } from "react";
import { BarChart3, TrendingUp, Clock, AlertTriangle, Users, Target, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface PipelineHealthData {
  stage_distribution: Record<string, number>;
  avg_time_per_stage: Record<string, number>;
  funnel: { stage: string; count: number }[];
  weekly_velocity: number[];
  score_distribution: { high: number; medium: number; low: number };
  stalled_entries: { id: string; person_name: string; days_stalled: number; stage: string }[];
  conversion_rate: number;
  total_active: number;
  total_signed: number;
  total_passed: number;
}

interface PipelineHealthPanelProps {
  teamId: string;
}

const STAGE_LABELS: Record<string, string> = {
  not_contacted: "Not Contacted",
  contacted: "Contacted",
  responded: "Responded",
  negotiating: "Negotiating",
  terms_sent: "Terms Sent",
  signed: "Signed",
  passed: "Passed",
};

const STAGE_COLORS: Record<string, string> = {
  not_contacted: "bg-muted",
  contacted: "bg-blue-500/20 text-blue-400",
  responded: "bg-amber-500/20 text-amber-400",
  negotiating: "bg-purple-500/20 text-purple-400",
  terms_sent: "bg-cyan-500/20 text-cyan-400",
  signed: "bg-emerald-500/20 text-emerald-400",
  passed: "bg-red-500/20 text-red-400",
};

export function PipelineHealthPanel({ teamId }: PipelineHealthPanelProps) {
  const [data, setData] = useState<PipelineHealthData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/deal-scoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ pipeline_health: true, team_id: teamId }),
      });
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error("Pipeline health fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  if (loading && !data) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const maxFunnelCount = Math.max(...data.funnel.map(f => f.count), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Pipeline Health</h3>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={fetchHealth} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-2">
        <KpiCard label="Active" value={data.total_active} icon={Users} />
        <KpiCard label="Signed" value={data.total_signed} icon={Target} color="text-emerald-400" />
        <KpiCard label="Passed" value={data.total_passed} icon={AlertTriangle} color="text-red-400" />
        <KpiCard label="Conv. Rate" value={`${data.conversion_rate}%`} icon={TrendingUp} color="text-primary" />
      </div>

      {/* Conversion Funnel */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs text-muted-foreground">Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-1.5">
          {data.funnel.filter(f => f.stage !== "passed").map((f, i) => (
            <div key={f.stage} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-20 truncate">{STAGE_LABELS[f.stage] || f.stage}</span>
              <div className="flex-1 h-4 bg-muted/30 rounded overflow-hidden">
                <div
                  className={cn("h-full rounded transition-all", i === 0 ? "bg-blue-500/60" : i < 3 ? "bg-primary/50" : "bg-emerald-500/60")}
                  style={{ width: `${(f.count / maxFunnelCount) * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium w-6 text-right">{f.count}</span>
              {i < data.funnel.length - 2 && data.funnel[i + 1] && f.count > 0 && (
                <Tooltip>
                  <TooltipTrigger>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {Math.round((data.funnel[i + 1].count / f.count) * 100)}% conversion
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Score Distribution + Avg Time */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground">Deal Scores</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="space-y-1">
              <ScoreBar label="High (70+)" count={data.score_distribution.high} total={data.total_active} color="bg-emerald-500/60" />
              <ScoreBar label="Medium" count={data.score_distribution.medium} total={data.total_active} color="bg-amber-500/60" />
              <ScoreBar label="Low (<40)" count={data.score_distribution.low} total={data.total_active} color="bg-red-500/60" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Avg Days/Stage
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="space-y-0.5">
              {Object.entries(data.avg_time_per_stage)
                .filter(([stage]) => !["signed", "passed"].includes(stage))
                .slice(0, 4)
                .map(([stage, days]) => (
                  <div key={stage} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground truncate">{STAGE_LABELS[stage] || stage}</span>
                    <span className="font-medium">{days}d</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Velocity */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-1 pt-3 px-3">
          <CardTitle className="text-xs text-muted-foreground">Weekly Activity (last 4 weeks)</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex items-end gap-1 h-12">
            {data.weekly_velocity.map((v, i) => {
              const max = Math.max(...data.weekly_velocity, 1);
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className="w-full bg-primary/40 rounded-t transition-all"
                        style={{ height: `${(v / max) * 40}px`, minHeight: v > 0 ? 4 : 1 }}
                      />
                      <span className="text-[9px] text-muted-foreground">W{i + 1}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">{v} activities</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stalled Deals */}
      {data.stalled_entries.length > 0 && (
        <Card className="bg-card/50 border-red-500/20">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Stalled Deals ({data.stalled_entries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ScrollArea className="max-h-24">
              <div className="space-y-1">
                {data.stalled_entries.map(e => (
                  <div key={e.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-foreground">{e.person_name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className={cn("text-[9px] px-1", STAGE_COLORS[e.stage])}>{STAGE_LABELS[e.stage]}</Badge>
                      <span className="text-red-400 text-[10px]">{e.days_stalled}d</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color?: string }) {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="p-2 text-center">
        <Icon className={cn("w-3.5 h-3.5 mx-auto mb-0.5", color || "text-muted-foreground")} />
        <p className="text-sm font-bold text-foreground">{value}</p>
        <p className="text-[9px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function ScoreBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground w-14 truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-muted/30 rounded overflow-hidden">
        <div className={cn("h-full rounded", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-medium w-4 text-right">{count}</span>
    </div>
  );
}