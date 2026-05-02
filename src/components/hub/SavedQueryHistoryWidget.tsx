import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Play, Bell, BellOff, ArrowRight, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listSavedQueries, listSavedQueryRuns, runSavedQuery, setSavedQuerySubscription,
  type SavedQuery, type SavedQueryRun,
} from "@/lib/api/publisting";
import { useToast } from "@/hooks/use-toast";

export function SavedQueryHistoryWidget() {
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [runs, setRuns] = useState<SavedQueryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const reload = async () => {
    setLoading(true);
    const qs = await listSavedQueries();
    setQueries(qs);
    if (qs.length > 0 && !activeId) setActiveId(qs[0].id);
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (!activeId) { setRuns([]); return; }
    listSavedQueryRuns(activeId, 10).then(setRuns).catch(() => setRuns([]));
  }, [activeId]);

  const active = queries.find((q) => q.id === activeId) ?? null;

  const runNow = async () => {
    if (!activeId) return;
    setRunning(true);
    try {
      const r = await runSavedQuery(activeId);
      toast({ title: "Saved query ran", description: `${r.result_count} results · +${r.added}/-${r.removed}` });
      const fresh = await listSavedQueryRuns(activeId, 10);
      setRuns(fresh);
    } catch (e: any) {
      toast({ title: "Run failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally { setRunning(false); }
  };

  const toggleSub = async () => {
    if (!active) return;
    const ok = await setSavedQuerySubscription(active.id, !active.is_subscribed);
    if (ok) {
      setQueries((p) => p.map((q) => q.id === active.id ? { ...q, is_subscribed: !active.is_subscribed } : q));
      toast({ title: active.is_subscribed ? "Unsubscribed" : "Subscribed" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5"><History className="h-4 w-4" /> Saved query history</span>
          <Link to="/admin/saved-queries">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]">All <ArrowRight className="h-3 w-3 ml-1" /></Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-xs text-muted-foreground py-4 flex items-center gap-2 justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved queries…
          </div>
        ) : queries.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No saved queries yet. Save a discovery filter to track changes over time and trigger diff alerts.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {queries.slice(0, 8).map((q) => (
                <button
                  key={q.id}
                  onClick={() => setActiveId(q.id)}
                  className={`text-[11px] px-2 py-1 rounded border ${
                    q.id === activeId ? "border-primary text-foreground bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {q.name}
                </button>
              ))}
            </div>
            {active && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {active.is_subscribed ? "subscribed" : "manual"}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono truncate">{active.query_hash}</span>
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="outline" disabled={running} onClick={runNow}>
                    {running ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                    Run now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={toggleSub}>
                    {active.is_subscribed ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-1">
              {runs.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">No runs yet — Run now to capture a baseline.</div>
              ) : runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs border border-border/50 rounded px-2 py-1">
                  <span className="text-muted-foreground">{new Date(r.run_at).toLocaleString()}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{r.result_count} results</Badge>
                    {r.added?.length ? <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-500/40">+{r.added.length}</Badge> : null}
                    {r.removed?.length ? <Badge variant="outline" className="text-[10px] text-red-300 border-red-500/40">-{r.removed.length}</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}