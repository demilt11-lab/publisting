import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { TrendingUp, BellRing, Clock, AlertTriangle, Users, FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { listMyPins, pinHref, type PinnedEntity } from "@/lib/api/pinnedEntities";

export function PortfolioRollups() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pins, setPins] = useState<PinnedEntity[]>([]);
  const [alertCount, setAlertCount] = useState<Map<string, number>>(new Map());
  const [newAlerts, setNewAlerts] = useState(0);
  const [missing, setMissing] = useState<PinnedEntity[]>([]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const p = await listMyPins(user.id);
        if (!alive) return;
        setPins(p);
        if (!p.length) return;
        const sevenDays = new Date(Date.now() - 7 * 86400_000).toISOString();
        const ids = p.map((x) => x.pub_id);
        const orFilter = [
          `pub_artist_id.in.(${ids.join(",")})`,
          `pub_track_id.in.(${ids.join(",")})`,
          `pub_creator_id.in.(${ids.join(",")})`,
        ].join(",");
        const { data: alertRows } = await supabase
          .from("lookup_alerts")
          .select("id, pub_artist_id, pub_track_id, pub_creator_id")
          .gte("created_at", sevenDays)
          .or(orFilter);
        const counts = new Map<string, number>();
        for (const a of (alertRows ?? []) as any[]) {
          const id = a.pub_artist_id || a.pub_track_id || a.pub_creator_id;
          if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        if (!alive) return;
        setAlertCount(counts);
        setNewAlerts(alertRows?.length ?? 0);

        const trackPubIds = p.filter((x) => x.entity_type === "track").map((x) => x.pub_id);
        if (trackPubIds.length) {
          const { data: tracks } = await supabase.from("tracks").select("id, pub_track_id").in("pub_track_id", trackPubIds);
          const tIds = (tracks ?? []).map((t: any) => t.id);
          if (tIds.length) {
            const { data: credits } = await supabase.from("track_credits").select("track_id").in("track_id", tIds);
            const has = new Set((credits ?? []).map((c: any) => c.track_id));
            const missingIds = new Set((tracks ?? []).filter((t: any) => !has.has(t.id)).map((t: any) => t.pub_track_id));
            if (alive) setMissing(p.filter((x) => x.entity_type === "track" && missingIds.has(x.pub_id)));
          }
        }
      } catch { /* swallow */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  if (loading) return <div className="text-xs text-muted-foreground">Loading rollups…</div>;
  if (!pins.length) return <div className="text-xs text-muted-foreground">Track entities (Alert me / watchlist) to populate rollups.</div>;

  const monthAgo = Date.now() - 30 * 86400_000;
  const stale = pins.filter((p) => new Date(p.created_at).getTime() < monthAgo).slice(0, 5);
  const movers = pins
    .map((p) => ({ p, n: alertCount.get(p.pub_id) ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n).slice(0, 5);

  const Tile = ({ icon: Icon, title, children }: any) => (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground"><Icon className="w-3.5 h-3.5" />{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">{children}</CardContent>
    </Card>
  );
  const PinLink = ({ p }: { p: PinnedEntity }) => {
    const href = pinHref(p);
    const Inner = <div className="text-xs truncate border border-border/40 rounded px-2 py-1">{p.label || p.pub_id}</div>;
    return href ? <Link to={href}>{Inner}</Link> : Inner;
  };

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      <Tile icon={TrendingUp} title="Top movers (7d)">
        {!movers.length && <p className="text-xs text-muted-foreground">Nothing moved.</p>}
        {movers.map(({ p, n }) => (
          <div key={p.id} className="flex items-center justify-between border border-border/40 rounded px-2 py-1">
            <Link to={pinHref(p) || "#"} className="truncate">{p.label || p.pub_id}</Link>
            <Badge>{n}</Badge>
          </div>
        ))}
      </Tile>
      <Tile icon={BellRing} title="New alerts this week">
        <div className="text-2xl font-semibold">{newAlerts}</div>
      </Tile>
      <Tile icon={Clock} title="Stale tracked (>30d)">
        {!stale.length && <p className="text-xs text-muted-foreground">All fresh.</p>}
        {stale.map((p) => <PinLink key={p.id} p={p} />)}
      </Tile>
      <Tile icon={FileWarning} title="Tracks missing credits">
        {!missing.length && <p className="text-xs text-muted-foreground">All credits present.</p>}
        {missing.map((p) => <PinLink key={p.id} p={p} />)}
      </Tile>
      <Tile icon={Users} title="Collaborator overlap">
        <p className="text-xs text-muted-foreground">Available once 2+ creators are tracked with shared credits.</p>
      </Tile>
      <Tile icon={AlertTriangle} title="Confidence changes">
        <p className="text-xs text-muted-foreground">Surfaces as provider snapshots accumulate.</p>
      </Tile>
    </div>
  );
}