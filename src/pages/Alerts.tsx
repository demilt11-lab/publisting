import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, CheckCheck, X, Loader2, RefreshCw, AlertTriangle, TrendingUp, Network as NetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchAlerts, markRead, dismiss, runEvaluator, LookupAlert } from "@/lib/api/lookupAlerts";

const sevCls: Record<string, string> = {
  high: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};
const kindIcon: Record<string, typeof Bell> = {
  spike: TrendingUp, confidence_drop: AlertTriangle, source_conflict: AlertTriangle, new_platform: NetIcon,
};

export default function Alerts() {
  const [items, setItems] = useState<LookupAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => { setLoading(true); setItems(await fetchAlerts(100)); setLoading(false); };
  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button></Link>
            <h1 className="text-xl font-bold flex items-center gap-2"><Bell className="w-5 h-5 text-primary" /> Alerts</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
            <Button variant="outline" size="sm" disabled={running} className="gap-2"
              onClick={async () => { setRunning(true); await runEvaluator(); await load(); setRunning(false); }}>
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />} Run evaluator
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading alerts…
          </div>
        ) : items.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground italic">
            No alerts yet. The evaluator runs daily on tracked tracks.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((a) => {
              const Icon = kindIcon[a.kind] || Bell;
              const unread = !a.read_at;
              return (
                <div key={a.id} className={`glass rounded-xl p-3 flex items-start gap-3 ${unread ? "ring-1 ring-primary/30" : ""}`}>
                  <Icon className="w-4 h-4 text-primary mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{a.title}</span>
                      <Badge variant="outline" className={`text-[9px] ${sevCls[a.severity] || ""}`}>{a.severity}</Badge>
                      <Badge variant="outline" className="text-[9px]">{a.kind}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    {a.body && <p className="text-xs text-muted-foreground mt-1">{a.body}</p>}
                    {a.track_key && <p className="text-[10px] text-muted-foreground mt-0.5">{a.track_key}</p>}
                  </div>
                  <div className="flex flex-col gap-1">
                    {unread && (
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={async () => { await markRead(a.id); load(); }}>
                        <CheckCheck className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={async () => { await dismiss(a.id); load(); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
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