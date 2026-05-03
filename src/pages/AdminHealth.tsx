import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity, Database, AlertTriangle, ListChecks } from "lucide-react";
import { fetchSystemHealth, type SystemHealth } from "@/lib/api/systemHealth";
import { ApiErrorState } from "@/components/system/ApiErrorState";

export default function AdminHealth() {
  const [data, setData] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await fetchSystemHealth()); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" /> System Health
            </h1>
            <p className="text-sm text-muted-foreground">Last hour · auto-refreshes every 30s</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAutoRefresh((v) => !v)}>
              {autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
            </Button>
            <Button size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {error && <ApiErrorState error={error} onRetry={load} />}

        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="API success" value={`${data.overall.success_rate}%`} sub={`${data.overall.api_calls} calls`} icon={Activity} />
              <StatCard label="Cache hit rate" value={`${data.overall.cache_hit_rate}%`} sub={`${data.overall.fresh_cache_entries}/${data.overall.cache_entries} fresh`} icon={Database} />
              <StatCard label="Validation errors" value={String(data.overall.validation_errors)} sub="last hour" icon={AlertTriangle} />
              <StatCard label="Queue" value={String(Object.values(data.overall.queue ?? {}).reduce((a, b) => a + b, 0))} sub={Object.entries(data.overall.queue ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "empty"} icon={ListChecks} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-service rate limit usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(data.services).map(([name, s]) => (
                  <div key={name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{name}</span>
                        <Badge variant={s.success_rate >= 95 ? "secondary" : s.success_rate >= 80 ? "outline" : "destructive"}>
                          {s.success_rate}% success
                        </Badge>
                        {s.rate_limited > 0 && (
                          <Badge variant="outline" className="text-amber-300 border-amber-500/40">
                            {s.rate_limited} rate-limited
                          </Badge>
                        )}
                        {s.validation_errors > 0 && (
                          <Badge variant="outline" className="text-red-300 border-red-500/40">
                            {s.validation_errors} validation
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {s.current}/{s.limit} this minute
                      </span>
                    </div>
                    <Progress value={s.usage_pct} className={s.usage_pct > 90 ? "[&>div]:bg-destructive" : ""} />
                  </div>
                ))}
                {!Object.keys(data.services).length && (
                  <p className="text-sm text-muted-foreground">No service activity yet.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub: string; icon: typeof Activity }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
            <div className="text-xs text-muted-foreground mt-1">{sub}</div>
          </div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}