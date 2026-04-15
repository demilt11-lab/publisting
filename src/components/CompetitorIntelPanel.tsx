import { useState } from "react";
import { Swords, Plus, Trash2, ExternalLink, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompetitorIntel, CompetitorSigning } from "@/hooks/useCompetitorIntel";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface CompetitorIntelPanelProps {
  watchlistNames?: string[];
}

export const CompetitorIntelPanel = ({ watchlistNames = [] }: CompetitorIntelPanelProps) => {
  const { signings, competitorStats, isLoading, addSigning, removeSigning, watchlistOverlap } = useCompetitorIntel();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ person_name: "", competitor_name: "", person_type: "writer", genre: "", deal_date: "", estimated_value_range: "", news_source_url: "", notes: "" });
  const [view, setView] = useState<"dashboard" | "signings">("dashboard");

  const overlaps = watchlistOverlap(watchlistNames);

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
          <Button variant={view === "dashboard" ? "secondary" : "ghost"} size="sm" className="text-xs h-7" onClick={() => setView("dashboard")}>Dashboard</Button>
          <Button variant={view === "signings" ? "secondary" : "ghost"} size="sm" className="text-xs h-7" onClick={() => setView("signings")}>All Signings</Button>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-3 h-3 mr-1" />Add
          </Button>
        </div>
      </div>

      {/* Alert: overlapping watchlist entries */}
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

      {view === "dashboard" ? (
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
                        <Badge key={g} variant="outline" className="text-[10px]">{g}</Badge>
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
      ) : (
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
