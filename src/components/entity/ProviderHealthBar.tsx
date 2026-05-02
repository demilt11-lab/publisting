import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getProviderHealth, syncEntityFromProvider, syncEntityFromAllProviders,
  type ProviderHealth, type ProviderName, type EntityType, type ProviderSyncReport,
} from "@/lib/api/publisting";
import { useToast } from "@/hooks/use-toast";

const PROVIDERS: ProviderName[] = ["spotify", "genius", "pro", "soundcharts"];

function toneFor(pct: number | null) {
  if (pct == null) return "text-muted-foreground border-border";
  if (pct >= 90) return "text-emerald-300 border-emerald-500/40";
  if (pct >= 60) return "text-amber-300 border-amber-500/40";
  return "text-red-300 border-red-500/40";
}

export function ProviderHealthBar({
  entity_type, pub_entity_id, onRefreshed,
}: {
  entity_type: EntityType;
  pub_entity_id: string;
  onRefreshed?: (reports: ProviderSyncReport[]) => void;
}) {
  const { toast } = useToast();
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [allBusy, setAllBusy] = useState(false);
  const [lastReports, setLastReports] = useState<Record<string, ProviderSyncReport>>({});

  useEffect(() => {
    let alive = true;
    getProviderHealth().then((h) => alive && setHealth(h)).catch(() => {});
    return () => { alive = false; };
  }, []);

  const runOne = async (p: ProviderName) => {
    setBusy((b) => ({ ...b, [p]: true }));
    try {
      const r = await syncEntityFromProvider(p, entity_type, pub_entity_id);
      setLastReports((m) => ({ ...m, [p]: r }));
      toast({
        title: `${p}: ${r.status}`,
        description: r.status === "ok"
          ? `+${r.links_upserted} link(s), ${r.fields_recorded} field(s)`
          : (r.error ?? "no changes"),
        variant: r.status === "error" ? "destructive" : "default",
      });
      onRefreshed?.([r]);
    } catch (e: any) {
      toast({ title: `${p} failed`, description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy((b) => ({ ...b, [p]: false }));
    }
  };

  const runAll = async () => {
    setAllBusy(true);
    try {
      const reports = await syncEntityFromAllProviders(entity_type, pub_entity_id);
      const map: Record<string, ProviderSyncReport> = {};
      for (const r of reports) map[r.source] = r;
      setLastReports(map);
      const ok = reports.filter((r) => r.status === "ok").length;
      toast({ title: `Refreshed ${ok}/${reports.length} sources` });
      onRefreshed?.(reports);
    } finally { setAllBusy(false); }
  };

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Provider sync · 24h health
        </div>
        <Button size="sm" variant="outline" disabled={allBusy} onClick={runAll}>
          {allBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Refresh all
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {PROVIDERS.map((p) => {
          const h = health.find((x) => x.provider === p);
          const last = lastReports[p];
          const pct = h?.success_pct_24h ?? null;
          return (
            <div key={p} className="border border-border/60 rounded p-2 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <div className="text-xs font-medium capitalize">{p}</div>
                <Badge variant="outline" className={`text-[10px] ${toneFor(pct)}`}>
                  {pct == null ? "—" : `${pct}%`}
                </Badge>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {h ? <>{h.ok_runs_24h}/{h.total_runs_24h} ok · {h.avg_latency_ms ?? "?"}ms</> : "Idle"}
              </div>
              {last && (
                <div className="text-[10px] text-muted-foreground capitalize truncate">
                  Last: <span className={last.status === "error" ? "text-red-300" : last.status === "ok" ? "text-emerald-300" : "text-amber-300"}>{last.status}</span>
                  {last.status === "ok" && <> · +{last.links_upserted}</>}
                </div>
              )}
              <Button
                size="sm" variant="ghost"
                className="h-6 w-full text-[11px] px-1"
                disabled={!!busy[p]} onClick={() => runOne(p)}
              >
                {busy[p] ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-1" /> Sync</>}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}