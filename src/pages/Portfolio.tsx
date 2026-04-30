import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Briefcase, Loader2, RefreshCw, TrendingUp, Activity, Sparkles,
  Users, Music2, ZapOff, Filter, Search, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useTeamContext } from "@/contexts/TeamContext";
import {
  fetchOpportunityScores, recomputeAllOpportunities, fetchSmartRecommendations,
  type OpportunityScore, type EntityType, type LifecycleState, type SmartRecommendation,
} from "@/lib/api/opportunityScores";

const lifecycleColors: Record<LifecycleState, string> = {
  emerging: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  accelerating: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  peaking: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  stable: "bg-muted text-muted-foreground border-border",
  declining: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  dormant: "bg-destructive/10 text-destructive border-destructive/30",
};

const lifecycleIcon: Record<LifecycleState, any> = {
  emerging: Sparkles,
  accelerating: TrendingUp,
  peaking: Activity,
  stable: Activity,
  declining: ZapOff,
  dormant: ZapOff,
};

const entityIcon: Record<EntityType, any> = {
  track: Music2,
  artist: Users,
  writer: Users,
  producer: Users,
};

export default function Portfolio() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeTeam } = useTeamContext();
  const [view, setView] = useState<"team" | "personal">(activeTeam ? "team" : "personal");
  const [scores, setScores] = useState<OpportunityScore[]>([]);
  const [recommendations, setRecommendations] = useState<SmartRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const [entityType, setEntityType] = useState<"all" | EntityType>("all");
  const [lifecycle, setLifecycle] = useState<"all" | LifecycleState>("all");
  const [minScore, setMinScore] = useState(0);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const opts: any = {
        limit: 200,
        entity_types: entityType === "all" ? undefined : [entityType],
        lifecycle: lifecycle === "all" ? undefined : [lifecycle],
        min_score: minScore > 0 ? minScore : undefined,
        search: search || undefined,
      };
      const [s, r] = await Promise.all([
        fetchOpportunityScores(opts),
        fetchSmartRecommendations({
          user_id: view === "personal" ? user?.id : undefined,
          team_id: view === "team" ? activeTeam?.id : undefined,
          entity_types: entityType === "all" ? undefined : [entityType],
          limit: 12,
        }),
      ]);
      setScores(s);
      setRecommendations(r);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view, entityType, lifecycle, minScore]);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      const r: any = await recomputeAllOpportunities();
      toast({ title: "Recomputed", description: `${r?.processed ?? 0} entities scored.` });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message || "Try again later", variant: "destructive" });
    } finally {
      setRecomputing(false);
    }
  };

  const filteredScores = useMemo(() => {
    if (!search) return scores;
    const s = search.toLowerCase();
    return scores.filter((x) => x.display_name.toLowerCase().includes(s));
  }, [scores, search]);

  const stats = useMemo(() => {
    const byLifecycle: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let highOpp = 0;
    for (const s of scores) {
      byLifecycle[s.lifecycle_state] = (byLifecycle[s.lifecycle_state] || 0) + 1;
      byType[s.entity_type] = (byType[s.entity_type] || 0) + 1;
      if (s.score >= 70) highOpp++;
    }
    return { byLifecycle, byType, highOpp, total: scores.length };
  }, [scores]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button></Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-primary" /> Portfolio
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">A&R targets ranked by opportunity</p>
          </div>
          <div className="flex items-center gap-2">
            {activeTeam && (
              <Tabs value={view} onValueChange={(v) => setView(v as any)}>
                <TabsList className="h-8">
                  <TabsTrigger value="team" className="text-xs h-6 px-3">Team</TabsTrigger>
                  <TabsTrigger value="personal" className="text-xs h-6 px-3">My picks</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <Button variant="outline" size="sm" onClick={handleRecompute} disabled={recomputing} className="gap-1.5">
              {recomputing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Recompute
            </Button>
            <Link to="/admin/automation-rules">
              <Button size="sm" className="gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Automation</Button>
            </Link>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Targets ranked" value={stats.total} icon={Briefcase} />
          <StatCard label="High opportunity (≥70)" value={stats.highOpp} icon={TrendingUp} accent="text-emerald-400" />
          <StatCard label="Emerging" value={stats.byLifecycle.emerging || 0} icon={Sparkles} accent="text-blue-400" />
          <StatCard label="Accelerating" value={stats.byLifecycle.accelerating || 0} icon={Activity} accent="text-emerald-400" />
        </div>

        {/* Smart Recommendations */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Smart Recommendations</h2>
            <Badge variant="outline" className="text-[9px]">
              {view === "team" ? `Team: ${activeTeam?.name || "—"}` : "Personal"}
            </Badge>
          </div>
          {recommendations.length === 0 ? (
            <div className="glass rounded-xl p-6 text-center text-xs text-muted-foreground italic">
              No recommendations yet. Run a search or recompute scores to seed the engine.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recommendations.slice(0, 6).map((r) => {
                const Icon = entityIcon[r.entity_type] || Music2;
                const LcIcon = lifecycleIcon[r.lifecycle_state] || Activity;
                return (
                  <div key={`${r.entity_type}::${r.entity_key}`} className="glass rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{r.name}</p>
                          {r.primary_artist && <p className="text-[10px] text-muted-foreground truncate">{r.primary_artist}</p>}
                        </div>
                      </div>
                      <Badge className={`text-[9px] ${lifecycleColors[r.lifecycle_state]} border`}>
                        <LcIcon className="w-2.5 h-2.5 mr-0.5" />{r.lifecycle_state}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={r.score} className="h-1.5 flex-1" />
                      <span className="text-xs font-bold text-foreground tabular-nums w-10 text-right">{Math.round(r.score)}</span>
                    </div>
                    {r.reasons.length > 0 && (
                      <div className="space-y-0.5">
                        {r.reasons.slice(0, 3).map((reason, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground line-clamp-1">• {reason}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Filters */}
        <div className="glass rounded-xl p-3 flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="h-8 text-xs pl-7"
            />
          </div>
          <Select value={entityType} onValueChange={(v) => setEntityType(v as any)}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="track">Tracks</SelectItem>
              <SelectItem value="artist">Artists</SelectItem>
              <SelectItem value="writer">Writers</SelectItem>
              <SelectItem value="producer">Producers</SelectItem>
            </SelectContent>
          </Select>
          <Select value={lifecycle} onValueChange={(v) => setLifecycle(v as any)}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lifecycles</SelectItem>
              <SelectItem value="emerging">Emerging</SelectItem>
              <SelectItem value="accelerating">Accelerating</SelectItem>
              <SelectItem value="peaking">Peaking</SelectItem>
              <SelectItem value="stable">Stable</SelectItem>
              <SelectItem value="declining">Declining</SelectItem>
              <SelectItem value="dormant">Dormant</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(minScore)} onValueChange={(v) => setMinScore(Number(v))}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">All scores</SelectItem>
              <SelectItem value="50">≥ 50</SelectItem>
              <SelectItem value="70">≥ 70 (high)</SelectItem>
              <SelectItem value="85">≥ 85 (priority)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Targets table */}
        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : filteredScores.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground italic">
            No targets match these filters. Try broadening filters or click <span className="font-medium text-foreground">Recompute</span> to score from latest snapshots.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredScores.map((s) => {
              const Icon = entityIcon[s.entity_type] || Music2;
              const LcIcon = lifecycleIcon[s.lifecycle_state] || Activity;
              return (
                <div key={s.id} className="glass rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{s.display_name}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Badge variant="outline" className="text-[9px] capitalize h-4 px-1.5">{s.entity_type}</Badge>
                            {s.primary_artist && <span className="truncate">{s.primary_artist}</span>}
                            <Badge className={`text-[9px] h-4 px-1.5 border ${lifecycleColors[s.lifecycle_state]}`}>
                              <LcIcon className="w-2.5 h-2.5 mr-0.5" />{s.lifecycle_state}
                            </Badge>
                            <span className="text-muted-foreground/60">· {s.data_points} snapshots</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-lg font-bold text-foreground tabular-nums leading-none">{Math.round(s.score)}</p>
                            <p className="text-[9px] text-muted-foreground uppercase">opportunity</p>
                          </div>
                        </div>
                      </div>
                      {/* Component breakdown */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px]">
                        <Component label="Momentum" value={s.momentum_component} />
                        <Component label="Charts" value={s.chart_component} />
                        <Component label="Alerts" value={s.alert_velocity_component} />
                        <Component label="Network" value={s.network_component} />
                        <Component label="Signing gap" value={s.signing_gap_component} />
                      </div>
                      {s.explanation && (
                        <p className="text-[10px] text-muted-foreground italic line-clamp-2">{s.explanation}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: string }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${accent || "text-muted-foreground"}`} />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${accent || "text-foreground"}`}>{value}</p>
    </div>
  );
}

function Component({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground tabular-nums">{Math.round(Number(value || 0))}</span>
      </div>
      <Progress value={Number(value || 0)} className="h-1 mt-1" />
    </div>
  );
}