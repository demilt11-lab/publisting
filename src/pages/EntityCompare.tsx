import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, GitCompare, X, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useCompareTray, type CompareEntity } from "@/hooks/useCompareTray";
import { TrustBadge, deriveTrustState } from "@/components/trust/TrustBadge";
import { fetchChartHistory, fetchPlaylistHistory, fetchFieldProvenance } from "@/lib/api/chartTimeSeries";

interface Loaded extends CompareEntity {
  uuid: string;
  table: "artist" | "track" | "creator";
  externals: { platform: string }[];
  chartCount: number;
  playlistCount: number;
  creditCount: number;
  topCollaborators: string[];
  countries: string[];
  provenance: any[];
}

function tableFor(kind: CompareEntity["kind"]) {
  if (kind === "artist") return "artist" as const;
  if (kind === "track") return "track" as const;
  return "creator" as const;
}

async function loadOne(e: CompareEntity): Promise<Loaded | null> {
  const t = tableFor(e.kind);
  let uuid: string | null = null;
  if (t === "artist") {
    const { data } = await supabase.from("artists").select("id").eq("pub_artist_id", e.pub_id).maybeSingle();
    uuid = data?.id ?? null;
  } else if (t === "track") {
    const { data } = await supabase.from("tracks").select("id").eq("pub_track_id", e.pub_id).maybeSingle();
    uuid = data?.id ?? null;
  } else {
    const { data } = await supabase.from("creators").select("id").eq("pub_creator_id", e.pub_id).maybeSingle();
    uuid = data?.id ?? null;
  }
  if (!uuid) return null;

  const [extRes, hist, pls, prov] = await Promise.all([
    supabase.from("external_ids").select("platform").eq("entity_type", t).eq("entity_id", uuid),
    fetchChartHistory(t as any, uuid, 365),
    fetchPlaylistHistory(t as any, uuid, 365),
    fetchFieldProvenance(t as any, uuid),
  ]);

  let creditCount = 0;
  let topCollaborators: string[] = [];
  let countries: string[] = [];
  if (t === "creator") {
    const { data: tc } = await supabase.from("track_credits")
      .select("track_id, tracks:track_id(primary_artist_name)").eq("creator_id", uuid).limit(200);
    creditCount = tc?.length ?? 0;
    const counts: Record<string, number> = {};
    (tc ?? []).forEach((r: any) => {
      const a = r.tracks?.primary_artist_name; if (a) counts[a] = (counts[a] || 0) + 1;
    });
    topCollaborators = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
    const { data: cr } = await supabase.from("creators").select("country").eq("id", uuid).maybeSingle();
    if (cr?.country) countries = [cr.country];
  } else if (t === "track") {
    const { data: tc } = await supabase.from("track_credits")
      .select("creators:creator_id(name, primary_role)").eq("track_id", uuid);
    creditCount = tc?.length ?? 0;
    topCollaborators = (tc ?? []).map((r: any) => r.creators?.name).filter(Boolean).slice(0, 5);
  } else if (t === "artist") {
    const { data: ar } = await supabase.from("artists").select("country").eq("id", uuid).maybeSingle();
    if (ar?.country) countries = [ar.country];
  }

  return {
    ...e, uuid, table: t,
    externals: (extRes.data ?? []) as any,
    chartCount: hist.length, playlistCount: pls.length,
    creditCount, topCollaborators, countries,
    provenance: prov as any[],
  };
}

export default function EntityCompare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tray = useCompareTray();
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [loading, setLoading] = useState(false);

  // Source of truth: query params override tray (so users can deep-link a comparison)
  const fromUrl = useMemo(() => {
    const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
    return ids;
  }, [searchParams]);

  const targets: CompareEntity[] = useMemo(() => {
    if (fromUrl.length) {
      // Pull display info from tray when possible
      return fromUrl.map((id) => {
        const t = tray.items.find((x) => x.pub_id === id);
        return t ?? { pub_id: id, kind: "artist", name: id };
      });
    }
    return tray.items;
  }, [fromUrl, tray.items]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!targets.length) { setLoaded([]); return; }
      setLoading(true);
      const results = await Promise.all(targets.map(loadOne));
      if (alive) setLoaded(results.filter((x): x is Loaded => x !== null));
      setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [JSON.stringify(targets)]);

  const allCollabs = useMemo(() => {
    const sets = loaded.map((l) => new Set(l.topCollaborators.map((s) => s.toLowerCase())));
    if (sets.length < 2) return new Set<string>();
    const overlap = new Set<string>();
    sets[0].forEach((v) => { if (sets.every((s) => s.has(v))) overlap.add(v); });
    return overlap;
  }, [loaded]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button></Link>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-primary" /> Compare entities
              {loaded.length > 0 && <Badge variant="secondary" className="text-[10px]">{loaded.length}</Badge>}
            </h1>
          </div>
          <div className="flex gap-2">
            <Link to="/entity-hub"><Button size="sm" variant="outline">Add from discovery</Button></Link>
            <Button size="sm" variant="ghost" onClick={() => { tray.clear(); setSearchParams({}); }}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Loading comparison…</div>
        ) : loaded.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            Add 2–4 entities to compare. From any detail page or discovery row, click "Compare" to add it here.
          </CardContent></Card>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${loaded.length}, minmax(220px, 1fr))` }}>
            {loaded.map((l) => {
              const detail =
                l.kind === "artist" ? `/artist/${l.pub_id}` :
                l.kind === "track" ? `/track/${l.pub_id}` :
                l.kind === "producer" ? `/producer/${l.pub_id}` : `/writer/${l.pub_id}`;
              const platforms = Array.from(new Set(l.externals.map((x) => x.platform)));
              const trust = deriveTrustState({
                sources: platforms,
                confidence: Math.min(1, platforms.length / 4),
                completeness: l.creditCount > 0 ? 0.9 : 0.3,
              });
              return (
                <Card key={l.pub_id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Badge variant="outline" className="text-[9px] capitalize">{l.kind}</Badge>
                        <CardTitle className="text-sm truncate mt-1">{l.name}</CardTitle>
                        {l.subtitle && <div className="text-xs text-muted-foreground truncate">{l.subtitle}</div>}
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                        onClick={() => tray.remove(l.pub_id)} aria-label="Remove">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <TrustBadge signal={{
                      state: trust, confidence: Math.min(1, platforms.length / 4),
                      sources: platforms, completeness: l.creditCount > 0 ? 0.9 : 0.3,
                    }} />
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs flex-1">
                    <Row label="Source coverage" value={`${platforms.length} platforms`} />
                    <Row label="External IDs" value={String(l.externals.length)} />
                    <Row label="Credit links" value={String(l.creditCount)} />
                    <Row label="Chart points (1y)" value={String(l.chartCount)} />
                    <Row label="Playlist points (1y)" value={String(l.playlistCount)} />
                    <Row label="Provenance fields" value={String(l.provenance.length)} />
                    <div>
                      <div className="text-muted-foreground mb-1">Top collaborators</div>
                      {l.topCollaborators.length === 0 ? (
                        <div className="text-muted-foreground/70 text-[11px]">—</div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {l.topCollaborators.map((c) => (
                            <Badge key={c} variant="outline"
                              className={`text-[10px] ${allCollabs.has(c.toLowerCase()) ? "border-emerald-500/40 text-emerald-300" : ""}`}>
                              {c}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {l.countries.length > 0 && (
                      <Row label="Territory" value={l.countries.join(", ")} />
                    )}
                    <div className="pt-2">
                      <Link to={detail}>
                        <Button size="sm" variant="outline" className="w-full text-xs">
                          <ExternalLink className="w-3 h-3 mr-1" /> Open detail
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {loaded.length >= 2 && allCollabs.size > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Shared collaborators</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(allCollabs).map((c) => (
                  <Badge key={c} className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30">{c}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}