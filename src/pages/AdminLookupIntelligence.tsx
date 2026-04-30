import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchRecentLookups, LookupAuditEntry } from "@/lib/api/lookupIntelligence";
import { RefreshCw, Activity, Database, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

interface SourceHealthRow {
  id: string;
  source: string;
  date: string;
  success_count: number;
  partial_count: number;
  failed_count: number;
  no_data_count: number;
  cache_hits: number;
  total_latency_ms: number;
  last_error: string | null;
  last_seen_at: string;
}

export default function AdminLookupIntelligence() {
  const [health, setHealth] = useState<SourceHealthRow[]>([]);
  const [recent, setRecent] = useState<LookupAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: h }, r] = await Promise.all([
      supabase.from("source_health").select("*").gte("date", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)).order("date", { ascending: false }),
      fetchRecentLookups(50),
    ]);
    setHealth((h || []) as SourceHealthRow[]);
    setRecent(r);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Aggregate by source
  const bySource = health.reduce<Record<string, SourceHealthRow & { totalCalls: number; avgLatency: number; successRate: number }>>((acc, row) => {
    const e = acc[row.source] || { ...row, success_count: 0, partial_count: 0, failed_count: 0, no_data_count: 0, cache_hits: 0, total_latency_ms: 0, totalCalls: 0, avgLatency: 0, successRate: 0 };
    e.success_count += row.success_count;
    e.partial_count += row.partial_count;
    e.failed_count += row.failed_count;
    e.no_data_count += row.no_data_count;
    e.cache_hits += row.cache_hits;
    e.total_latency_ms += row.total_latency_ms;
    e.last_error = row.last_error || e.last_error;
    e.last_seen_at = row.last_seen_at > (e.last_seen_at || "") ? row.last_seen_at : e.last_seen_at;
    acc[row.source] = e;
    return acc;
  }, {});
  Object.values(bySource).forEach((e) => {
    e.totalCalls = e.success_count + e.partial_count + e.failed_count + e.no_data_count;
    e.avgLatency = e.totalCalls > 0 ? Math.round(e.total_latency_ms / e.totalCalls) : 0;
    e.successRate = e.totalCalls > 0 ? e.success_count / e.totalCalls : 0;
  });
  const sources = Object.values(bySource).sort((a, b) => b.totalCalls - a.totalCalls);

  const failedRecent = recent.filter((r) => r.confidence_bucket === "low" || r.confidence_score < 0.4);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Lookup Intelligence — Admin
            </h1>
            <p className="text-sm text-muted-foreground">Source health, latency, cache hit ratios, and recent lookup audit.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Home</Link>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Source health */}
        <div className="surface-elevated rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Source Health (last 7 days)
          </h2>
          {sources.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No telemetry yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border/40">
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3 text-right">Success rate</th>
                    <th className="py-2 pr-3 text-right">Avg latency</th>
                    <th className="py-2 pr-3 text-right">Total calls</th>
                    <th className="py-2 pr-3 text-right">Cache hits</th>
                    <th className="py-2 pr-3 text-right">Failed</th>
                    <th className="py-2 pr-3">Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.source} className="border-b border-border/20">
                      <td className="py-2 pr-3 font-medium text-foreground">{s.source}</td>
                      <td className="py-2 pr-3 text-right">
                        <Badge variant="outline" className={`text-[10px] ${
                          s.successRate >= 0.85 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : s.successRate >= 0.6 ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        }`}>
                          {Math.round(s.successRate * 100)}%
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.avgLatency}ms</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.totalCalls}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{s.cache_hits}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.failed_count}</td>
                      <td className="py-2 pr-3 text-muted-foreground truncate max-w-xs">{s.last_error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Failed / low-confidence queue */}
        <div className="surface-elevated rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Low-confidence / Failed Lookups ({failedRecent.length})
          </h2>
          {failedRecent.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No failures in the last 50 lookups.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {failedRecent.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-background/40 border border-border/30">
                  <span className="text-foreground flex-1 truncate">{r.query_raw}</span>
                  <Badge variant="outline" className="text-[9px]">{r.confidence_bucket}</Badge>
                  <span className="tabular-nums text-muted-foreground">{Math.round(r.confidence_score * 100)}%</span>
                  <span className="tabular-nums text-muted-foreground">{r.duration_ms ?? "—"}ms</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent lookups */}
        <div className="surface-elevated rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent Lookups</h2>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-background/40 border border-border/30">
                <span className="text-foreground flex-1 truncate">{r.query_raw}</span>
                <Badge variant="outline" className="text-[9px]">{r.confidence_bucket}</Badge>
                <span className="tabular-nums text-muted-foreground w-12 text-right">{Math.round(r.confidence_score * 100)}%</span>
                <span className="tabular-nums text-muted-foreground w-14 text-right">{r.duration_ms ?? "—"}ms</span>
                <span className="text-[10px] text-muted-foreground w-32 text-right truncate">{new Date(r.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}