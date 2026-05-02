import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchChartHistory, type ChartHistoryPoint } from "@/lib/api/chartTimeSeries";
import type { EntityType } from "@/lib/api/entityResolver";

interface Props {
  entityType: EntityType;
  entityId: string;
  days?: number;
}

export function EntityTrendChart({ entityType, entityId, days = 90 }: Props) {
  const [points, setPoints] = useState<ChartHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchChartHistory(entityType, entityId, days).then((p) => {
      if (mounted) { setPoints(p); setLoading(false); }
    });
    return () => { mounted = false; };
  }, [entityType, entityId, days]);

  // Group by chart
  const grouped = points.reduce<Record<string, ChartHistoryPoint[]>>((acc, p) => {
    const k = `${p.platform} · ${p.chart_type}${p.country ? ` (${p.country})` : ""}`;
    (acc[k] ??= []).push(p);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Chart history
          <Badge variant="outline" className="text-[10px]">{days}d</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No chart history recorded for this entity yet.
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([k, pts]) => {
              const peak = Math.min(...pts.map((p) => p.rank));
              const latest = pts[pts.length - 1];
              const first = pts[0];
              const delta = latest.rank - first.rank;
              return (
                <div key={k} className="text-xs border border-border rounded-md p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{k}</span>
                    <span className="text-muted-foreground">
                      Peak #{peak} · Now #{latest.rank}
                      {delta !== 0 && (
                        <span className={delta < 0 ? "text-emerald-400 ml-2" : "text-red-400 ml-2"}>
                          {delta < 0 ? "▲" : "▼"} {Math.abs(delta)}
                        </span>
                      )}
                    </span>
                  </div>
                  <Sparkline ranks={pts.map((p) => p.rank)} />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Sparkline({ ranks }: { ranks: number[] }) {
  if (ranks.length < 2) return null;
  const w = 200, h = 28;
  const max = Math.max(...ranks), min = Math.min(...ranks);
  const range = Math.max(1, max - min);
  const pts = ranks.map((r, i) => {
    const x = (i / (ranks.length - 1)) * w;
    // Lower rank = better, so invert
    const y = ((r - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="text-primary">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} />
    </svg>
  );
}
