import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, RefreshCw, Loader2 } from "lucide-react";
import { EntitySearchPanel } from "@/components/entity/EntitySearchPanel";
import { EntityTrendChart } from "@/components/entity/EntityTrendChart";
import type { EntityMatch } from "@/lib/api/entitySearch";
import { useEffect } from "react";
import { EntityDiscoveryPanel } from "@/components/entity/EntityDiscoveryPanel";
import { getEntityProvenance, syncEntityFromAllProviders, type ProviderSyncReport } from "@/lib/api/publisting";
import { useToast } from "@/hooks/use-toast";
import { SavedQueryHistoryWidget } from "@/components/hub/SavedQueryHistoryWidget";

export default function EntityHub() {
  const [picked, setPicked] = useState<EntityMatch | null>(null);
  const [provenance, setProvenance] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<ProviderSyncReport[] | null>(null);
  const { toast } = useToast();

  const loadProvenance = async (m: EntityMatch) => {
    const r = await getEntityProvenance(m.entity_type as any, m.pub_id).catch(() => null);
    if (!r) { setProvenance([]); return; }
    // Flatten into the row shape the existing list renders.
    const rows: any[] = [];
    for (const f of r.fields ?? []) {
      for (const rec of f.records ?? []) {
        rows.push({
          field_name: f.field,
          field_value: rec.field_value ?? rec.value,
          source: rec.source,
          confidence: rec.confidence,
        });
      }
    }
    setProvenance(rows);
  };

  useEffect(() => {
    if (!picked) { setProvenance([]); return; }
    loadProvenance(picked);
  }, [picked]);

  const refreshFromProviders = async () => {
    if (!picked) return;
    setSyncing(true);
    try {
      const reports = await syncEntityFromAllProviders(picked.entity_type as any, picked.pub_id);
      setLastSync(reports);
      const ok = reports.filter((r) => r.status === "ok").length;
      const errs = reports.filter((r) => r.status === "error");
      toast({
        title: `Refreshed ${ok}/${reports.length} sources`,
        description: errs.length ? `Errors: ${errs.map((e) => e.source).join(", ")}` : "Provenance refreshed",
      });
      await loadProvenance(picked);
    } catch (e) {
      toast({ title: "Refresh failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const detailPath = (m: EntityMatch | null): string | null => {
    if (!m) return null;
    if (m.entity_type === "artist") return `/artist/${m.pub_id}`;
    if (m.entity_type === "track") return `/track/${m.pub_id}`;
    if (m.entity_type === "creator") {
      // route by primary_role if we have it on the match
      const role = (m as any).primary_genre || "writer"; // entity-search packs primary_role into primary_genre for creators
      return role === "producer" ? `/producer/${m.pub_id}` : `/writer/${m.pub_id}`;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to home
            </Link>
            <h1 className="text-2xl font-semibold mt-2">Entity Hub</h1>
            <p className="text-sm text-muted-foreground">
              Canonical Publisting IDs · paste a URL, ISRC, UPC, or song/artist name to resolve.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Smart search</CardTitle>
            </CardHeader>
            <CardContent>
              <EntitySearchPanel onPick={(m) => setPicked(m)} />
            </CardContent>
          </Card>

          <div className="space-y-4">
            {picked ? (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      Selected entity
                      <Badge variant="outline" className="capitalize">{picked.entity_type}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      <div className="font-medium">{picked.title || picked.name}</div>
                      {picked.primary_artist_name && (
                        <div className="text-muted-foreground">{picked.primary_artist_name}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{picked.pub_id}</div>
                    {picked.external_ids && picked.external_ids.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {picked.external_ids.map((x, i) => (
                          x.url ? (
                            <a key={i} href={x.url} target="_blank" rel="noreferrer">
                              <Badge variant="outline" className="text-[10px]">{x.platform}</Badge>
                            </a>
                          ) : (
                            <Badge key={i} variant="outline" className="text-[10px]">{x.platform}</Badge>
                          )
                        ))}
                      </div>
                    )}
                    {detailPath(picked) && (
                      <Link to={detailPath(picked)!}>
                        <Button size="sm" variant="outline" className="mt-2">
                          Open detail page <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </Link>
                    )}
                  </CardContent>
                </Card>

                <EntityTrendChart entityType={picked.entity_type} entityId={picked.id} />

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Source trust</span>
                      <Button size="sm" variant="outline" onClick={refreshFromProviders} disabled={syncing}>
                        {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                        Refresh from providers
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {lastSync && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {lastSync.map((r) => (
                          <Badge key={r.source} variant="outline" className="text-[10px] capitalize">
                            {r.source}: {r.status}{r.status === "ok" ? ` · +${r.links_upserted}/${r.fields_recorded}` : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {provenance.length === 0 ? (
                      <div className="text-xs text-muted-foreground">
                        No source provenance recorded yet. Provenance appears here as the lookup
                        pipeline confirms each field.
                      </div>
                    ) : (
                      <div className="space-y-1 text-xs">
                        {provenance.map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between border-b border-border/50 py-1">
                            <div>
                              <span className="font-medium">{p.field_name}</span>
                              {p.field_value && <span className="text-muted-foreground ml-2">{p.field_value}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">{p.source}</Badge>
                              <span className="text-muted-foreground">{Math.round(Number(p.confidence) * 100)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Run a search and pick a result to anchor it. Once selected the entity gets a
                  permanent <span className="font-mono">pub_…</span> ID, becomes available across
                  watchlist / outreach / dismissals, and starts accumulating chart history and
                  source-provenance data.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <EntityDiscoveryPanel />

        <SavedQueryHistoryWidget />
      </div>
    </div>
  );
}
