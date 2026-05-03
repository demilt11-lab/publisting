import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Activity, Search, MousePointerClick, Users, Bookmark } from "lucide-react";
import { fetchAdminAnalytics, type AdminAnalytics } from "@/lib/api/userAnalytics";
import { ApiErrorState } from "@/components/system/ApiErrorState";

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchAdminAnalytics()); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" /> User Analytics
            </h1>
            <p className="text-sm text-muted-foreground">Last 7–14 days · auto-refreshes every 60s</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={Search} label="Searches (7d)" value={data.totals.searches_7d.toLocaleString()} />
              <StatCard icon={Users} label="Unique users (7d)" value={data.totals.unique_users_7d.toLocaleString()} />
              <StatCard icon={Bookmark} label="Watchlist added (7d)" value={data.totals.watchlist_added_7d.toLocaleString()} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Daily active users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={data.dau.map((d) => ({ label: d.day.slice(5), value: d.users }))} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="h-4 w-4" /> Top searches (7d)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {data.top_searches.length === 0 && (
                    <p className="text-sm text-muted-foreground">No searches recorded yet.</p>
                  )}
                  {data.top_searches.map((s) => (
                    <div key={s.query} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.query}</span>
                      <Badge variant="secondary">{s.count}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MousePointerClick className="h-4 w-4" /> Most-clicked entities
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {data.top_clicks.length === 0 && (
                    <p className="text-sm text-muted-foreground">No clicks recorded yet.</p>
                  )}
                  {data.top_clicks.map((c) => (
                    <div key={`${c.type}-${c.id}`} className="flex items-center justify-between text-sm">
                      <span className="truncate">
                        <span className="text-muted-foreground capitalize mr-2">{c.type ?? "entity"}</span>
                        {c.id}
                      </span>
                      <Badge variant="secondary">{c.count}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bookmark className="h-4 w-4" /> Watchlist growth
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart data={data.watchlist_growth.map((d) => ({ label: d.day.slice(5), value: d.count }))} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-md bg-muted"><Icon className="h-4 w-4" /></div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div
            className="w-full bg-primary/70 rounded-t"
            style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            title={`${d.label}: ${d.value}`}
          />
          <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}