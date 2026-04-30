import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, Loader2, Check, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchReviewQueue, resolveReview, dismissReview, ReviewItem } from "@/lib/api/lookupAlerts";

export default function AdminReviewQueue() {
  const [tab, setTab] = useState<"pending" | "resolved" | "dismissed">("pending");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); setItems(await fetchReviewQueue(tab, 100)); setLoading(false); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button></Link>
            <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-primary" /> Analyst Review Queue</h1>
          </div>
          <div className="flex gap-2">
            {(["pending", "resolved", "dismissed"] as const).map((t) => (
              <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>{t}</Button>
            ))}
            <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="w-3.5 h-3.5" /></Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground italic">No {tab} items.</div>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="glass rounded-xl p-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[9px]">{it.kind}</Badge>
                      <Badge variant="outline" className="text-[9px]">{it.severity}</Badge>
                      <span className="text-sm font-medium text-foreground">{it.title}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(it.created_at).toLocaleString()}</span>
                    </div>
                    {it.related_track_key && <p className="text-[10px] text-muted-foreground mt-0.5">{it.related_track_key}</p>}
                    {it.payload && Object.keys(it.payload).length > 0 && (
                      <pre className="text-[10px] text-muted-foreground bg-background/40 border border-border/30 rounded p-2 mt-2 max-h-40 overflow-auto">
                        {JSON.stringify(it.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                  {tab === "pending" && (
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="gap-1 h-7 text-emerald-400 border-emerald-500/30"
                        onClick={async () => { await resolveReview(it.id); load(); }}>
                        <Check className="w-3.5 h-3.5" /> Resolve
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1 h-7"
                        onClick={async () => { await dismissReview(it.id); load(); }}>
                        <X className="w-3.5 h-3.5" /> Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}