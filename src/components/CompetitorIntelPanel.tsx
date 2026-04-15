import { useState, useMemo } from "react";
import { Swords, Plus, Trash2, ExternalLink, TrendingUp, AlertTriangle, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompetitorIntel, CompetitorSigning } from "@/hooks/useCompetitorIntel";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface CompetitorIntelPanelProps {
  watchlistNames?: string[];
}

const GENRE_COLORS: Record<string, string> = {
  pop: "bg-pink-500/20 text-pink-400",
  "hip-hop": "bg-purple-500/20 text-purple-400",
  "r&b": "bg-amber-500/20 text-amber-400",
  rock: "bg-red-500/20 text-red-400",
  country: "bg-orange-500/20 text-orange-400",
  electronic: "bg-cyan-500/20 text-cyan-400",
  latin: "bg-emerald-500/20 text-emerald-400",
  indie: "bg-blue-500/20 text-blue-400",
};

function getGenreColor(genre: string): string {
  const lower = genre.toLowerCase();
  for (const [key, color] of Object.entries(GENRE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "bg-muted text-muted-foreground";
}

export const CompetitorIntelPanel = ({ watchlistNames = [] }: CompetitorIntelPanelProps) => {
  const { signings, competitorStats, isLoading, addSigning, removeSigning, watchlistOverlap } = useCompetitorIntel();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ person_name: "", competitor_name: "", person_type: "writer", genre: "", deal_date: "", estimated_value_range: "", news_source_url: "", notes: "" });
  const [view, setView] = useState<"dashboard" | "signings" | "market">("dashboard");

  const overlaps = watchlistOverlap(watchlistNames);

  // Market share calculation
  const marketShareData = useMemo(() => {
    if (signings.length === 0) return [];
    const competitorCounts = new Map<string, number>();
    signings.forEach(s => {
      competitorCounts.set(s.competitor_name, (competitorCounts.get(s.competitor_name) || 0) + 1);
    });
    const total = signings.length;
    return Array.from(competitorCounts.entries())
      .map(([name, count]) => ({ name, count, share: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [signings]);

  // Genre heatmap data
  const genreHeatmap = useMemo(() => {
    if (signings.length === 0) return new Map<string, Map<string, number>>();
    const map = new Map<string, Map<string, number>>();
    signings.forEach(s => {
      if (!s.genre) return;
      if (!map.has(s.competitor_name)) map.set(s.competitor_name, new Map());
      const genreMap = map.get(s.competitor_name)!;
      genreMap.set(s.genre, (genreMap.get(s.genre) || 0) + 1);
    });
    return map;
  }, [signings]);

  // Signing velocity (signings per month)
  const signingVelocity = useMemo(() => {
    if (signings.length === 0) return [];
    const months = new Map<string, number>();
    signings.forEach(s => {
      const d = new Date(s.deal_date || s.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.set(key, (months.get(key) || 0) + 1);
    });
    return Array.from(months.entries()).sort().slice(-6).map(([month, count]) => ({ month, count }));
  }, [signings]);

  const handleSubmit = async () => {
    if (!form.person_name || !form.competitor_name) return;
    await addSigning(form);
    setForm({ person_name: "", competitor_name: "", person_type: "writer", genre: "", deal_date: "", estimated_value_range: "", news_source_url: "", notes: "" });
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-semibold text-foreground">Competitor Intelligence</h3>
          <Badge variant="secondary" className="text-xs">{signings.length}</Badge>
        </div>
        <div className="flex gap-1">
          <Button variant={view === "dashboard" ? "secondary" : "ghost"} size="sm" className="text-xs h-7" onClick={() => setView("dashboard")}>Overview</Button>
          <Button variant={view === "market" ? "secondary" : "ghost"} size="sm" className="text-xs h-7" onClick={() => setView("market")}>Market</Button>
          <Button variant={view === "signings" ? "secondary" : "ghost"} size="sm" className="text-xs h-7" onClick={() => setView("signings")}>All</Button>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-3 h-3 mr-1" />Add
          </Button>
        </div>
      </div>

      {/* Overlap alerts */}
      {overlaps.length > 0 && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2 text-red-400 text-xs font-medium mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {overlaps.length} watchlist artist{overlaps.length > 1 ? "s" : ""} signed by competitors
          </div>
          <div className="flex flex-wrap gap-1">
            {overlaps.map(o => (
              <Badge key={o.id} variant="outline" className="text-xs text-red-300 border-red-500/30">
                {o.person_name} → {o.competitor_name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="p-3 rounded-lg border border-border/50 bg-surface space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Artist/Writer name" value={form.person_name} onChange={e => setForm(f => ({ ...f, person_name: e.target.value }))} className="text-xs h-8" />
            <Input placeholder="Competitor (e.g. Sony)" value={form.competitor_name} onChange={e => setForm(f => ({ ...f, competitor_name: e.target.value }))} className="text-xs h-8" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={form.person_type} onValueChange={v => setForm(f => ({ ...f, person_type: v }))}>
              <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="writer">Writer</SelectItem>
                <SelectItem value="producer">Producer</SelectItem>
                <SelectItem value="artist">Artist</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Genre" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} className="text-xs h-8" />
            <Input type="date" value={form.deal_date} onChange={e => setForm(f => ({ ...f, deal_date: e.target.value }))} className="text-xs h-8" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Est. value range" value={form.estimated_value_range} onChange={e => setForm(f => ({ ...f, estimated_value_range: e.target.value }))} className="text-xs h-8" />
            <Input placeholder="News source URL" value={form.news_source_url} onChange={e => setForm(f => ({ ...f, news_source_url: e.target.value }))} className="text-xs h-8" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" className="text-xs h-7" onClick={handleSubmit} disabled={!form.person_name || !form.competitor_name}>Track Signing</Button>
          </div>
        </div>
      )}

      {view === "dashboard" && (
        <div className="space-y-3">
          {competitorStats.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No competitor signings tracked yet. Click "Add" to start.</p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {competitorStats.map(stat => (
                  <div key={stat.name} className="p-3 rounded-lg border border-border/50 bg-surface">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{stat.name}</span>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{stat.signings} signing{stat.signings > 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {stat.genres.map(g => (
                        <Badge key={g} variant="outline" className={cn("text-[10px]", getGenreColor(g))}>{g}</Badge>
                      ))}
                    </div>
                    {stat.recentDate && (
                      <p className="text-[10px] text-muted-foreground mt-1">Latest: {stat.recentDate}</p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {view === "market" && (
        <div className="space-y-3">
          {/* Market share bars */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                <PieChartIcon className="w-3 h-3" /> Market Share
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-1.5">
              {marketShareData.map((d, i) => {
                const barColors = ["bg-blue-500/60", "bg-red-500/60", "bg-emerald-500/60", "bg-purple-500/60", "bg-amber-500/60"];
                return (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-20 truncate">{d.name}</span>
                    <div className="flex-1 h-3 bg-muted/30 rounded overflow-hidden">
                      <div className={cn("h-full rounded", barColors[i % barColors.length])} style={{ width: `${d.share}%` }} />
                    </div>
                    <span className="text-[10px] font-medium w-10 text-right">{d.share}% ({d.count})</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Genre focus heatmap */}
          {genreHeatmap.size > 0 && (
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" /> Genre Focus
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2">
                  {Array.from(genreHeatmap.entries()).slice(0, 5).map(([competitor, genres]) => (
                    <div key={competitor}>
                      <p className="text-[10px] font-medium text-foreground mb-0.5">{competitor}</p>
                      <div className="flex flex-wrap gap-1">
                        {Array.from(genres.entries()).sort((a, b) => b[1] - a[1]).map(([genre, count]) => (
                          <Tooltip key={genre}>
                            <TooltipTrigger>
                              <Badge variant="outline" className={cn("text-[9px] px-1", getGenreColor(genre))}>
                                {genre} ×{count}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">{count} {genre} signing{count > 1 ? "s" : ""}</TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Signing velocity */}
          {signingVelocity.length > 0 && (
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs text-muted-foreground">Signing Velocity</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="flex items-end gap-1 h-12">
                  {signingVelocity.map((v, i) => {
                    const max = Math.max(...signingVelocity.map(x => x.count), 1);
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger asChild>
                          <div className="flex-1 flex flex-col items-center gap-0.5">
                            <div
                              className="w-full bg-red-500/40 rounded-t transition-all"
                              style={{ height: `${(v.count / max) * 40}px`, minHeight: v.count > 0 ? 4 : 1 }}
                            />
                            <span className="text-[8px] text-muted-foreground">{v.month.slice(5)}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">{v.count} signings in {v.month}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {view === "signings" && (
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {signings.map(s => (
              <div key={s.id} className="p-2.5 rounded-lg border border-border/50 bg-surface flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{s.person_name}</p>
                  <p className="text-[10px] text-muted-foreground">→ {s.competitor_name} {s.genre && `• ${s.genre}`}</p>
                  {s.estimated_value_range && <p className="text-[10px] text-primary">{s.estimated_value_range}</p>}
                  <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</p>
                </div>
                <div className="flex gap-1">
                  {s.news_source_url && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => window.open(s.news_source_url!, "_blank")}>
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeSigning(s.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};