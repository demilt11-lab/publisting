import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search, Bell, Eye, Sparkles, ArrowRight, Loader2, Compass, GitCompare,
  Inbox, Target, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompareTray } from "@/hooks/useCompareTray";
import { fetchInboxAlerts, listMySubscriptions, detailPathForAlert, type PubAlert, type SubscriptionRow } from "@/lib/api/pubAlerts";
import { listMyPins, seedPinsIfEmpty, unpinEntity, pinHref, type PinnedEntity } from "@/lib/api/pinnedEntities";
import { TrustBadge, deriveTrustState } from "@/components/trust/TrustBadge";
import { searchEntities, type EntityMatch } from "@/lib/api/entitySearch";
import { detailPathFor } from "@/lib/entityRoutes";
import { ResultActionBar } from "@/components/discovery/ResultActionBar";

interface Props {
  onSearch: (q: string) => void;
  recentSearches: { query: string; title: string; artist: string; coverUrl?: string | null }[];
}

/**
 * Above-the-fold "command center" panel for the homepage.
 * Hero command search + pinned subs + recent alerts + watchlist highlights + quick links.
 */
export function CommandCenter({ onSearch, recentSearches }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const tray = useCompareTray();

  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<EntityMatch[]>([]);
  const [alerts, setAlerts] = useState<PubAlert[]>([]);
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [pins, setPins] = useState<PinnedEntity[]>([]);
  const [pinsLoaded, setPinsLoaded] = useState(false);
  const [watchlist, setWatchlist] = useState<{ id: string; person_name: string; pub_creator_id: string | null; pipeline_status: string | null }[]>([]);
  const [activity, setActivity] = useState<{ table: string; label: string; sub: string; href: string | null; ts: string }[]>([]);

  // Hero command search: live entity search after a small delay
  useEffect(() => {
    if (!q.trim()) { setMatches([]); return; }
    const id = setTimeout(async () => {
      setSearching(true);
      const r = await searchEntities(q.trim(), { limit: 6 });
      setSearching(false);
      const rows: EntityMatch[] = [];
      if (r.best_match) rows.push(r.best_match);
      rows.push(...r.alternates.slice(0, 5));
      setMatches(rows);
    }, 220);
    return () => clearTimeout(id);
  }, [q]);

  // Pinned subs + alerts
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const al = await fetchInboxAlerts({ status: "all" }, 8);
        if (alive) setAlerts(al ?? []);
      } catch { if (alive) setAlerts([]); }
      if (user?.id) {
        try {
          const s = await listMySubscriptions(user.id);
          if (alive) setSubs((s ?? []).slice(0, 8));
        } catch { if (alive) setSubs([]); }
        try {
          let p = await listMyPins(user.id);
          if (p.length === 0) {
            await seedPinsIfEmpty(user.id);
            p = await listMyPins(user.id);
          }
          if (alive) setPins(p ?? []);
        } catch { if (alive) setPins([]); }
        finally { if (alive) setPinsLoaded(true); }
      } else {
        if (alive) setPinsLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // Watchlist highlights (team-level)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("watchlist_entries")
        .select("id, person_name, pub_creator_id, pipeline_status")
        .order("updated_at", { ascending: false }).limit(5);
      if (alive) setWatchlist((data ?? []) as any);
    })();
    return () => { alive = false; };
  }, []);

  // Recent entity activity (latest external_ids + track_credits inserts as a system signal)
  useEffect(() => {
    let alive = true;
    (async () => {
      const [extRes, credRes] = await Promise.all([
        supabase.from("external_ids")
          .select("entity_type, entity_id, platform, created_at").order("created_at", { ascending: false }).limit(5),
        supabase.from("track_credits")
          .select("track_id, role, created_at, tracks:track_id(pub_track_id, title, primary_artist_name), creators:creator_id(name)")
          .order("created_at", { ascending: false }).limit(5),
      ]);
      if (!alive) return;
      const rows: typeof activity = [];
      for (const r of (credRes.data ?? []) as any[]) {
        const tr = r.tracks; const cr = r.creators;
        if (tr?.pub_track_id) rows.push({
          table: "credit",
          label: `New ${r.role || "credit"} on ${tr.title || "track"}`,
          sub: `${cr?.name || ""}${tr.primary_artist_name ? ` · ${tr.primary_artist_name}` : ""}`,
          href: `/track/${tr.pub_track_id}`, ts: r.created_at,
        });
      }
      // resolve external_ids to pub_id for nav
      const byType: Record<string, string[]> = {};
      for (const r of (extRes.data ?? []) as any[]) {
        (byType[r.entity_type] = byType[r.entity_type] || []).push(r.entity_id);
      }
      const nameMap = new Map<string, { pub: string; label: string }>();
      if (byType.track?.length) {
        const { data } = await supabase.from("tracks").select("id, pub_track_id, title").in("id", byType.track);
        for (const t of (data ?? []) as any[]) nameMap.set(`track:${t.id}`, { pub: t.pub_track_id, label: t.title });
      }
      if (byType.artist?.length) {
        const { data } = await supabase.from("artists").select("id, pub_artist_id, name").in("id", byType.artist);
        for (const t of (data ?? []) as any[]) nameMap.set(`artist:${t.id}`, { pub: t.pub_artist_id, label: t.name });
      }
      if (byType.creator?.length) {
        const { data } = await supabase.from("creators").select("id, pub_creator_id, name, primary_role").in("id", byType.creator);
        for (const t of (data ?? []) as any[]) nameMap.set(`creator:${t.id}`, { pub: t.pub_creator_id, label: t.name });
      }
      for (const r of (extRes.data ?? []) as any[]) {
        const ref = nameMap.get(`${r.entity_type}:${r.entity_id}`);
        if (!ref) continue;
        rows.push({
          table: "platform",
          label: `Linked ${r.platform}`,
          sub: `${r.entity_type} · ${ref.label}`,
          href: r.entity_type === "artist" ? `/artist/${ref.pub}` :
                r.entity_type === "track" ? `/track/${ref.pub}` :
                                            `/writer/${ref.pub}`,
          ts: r.created_at,
        });
      }
      rows.sort((a, b) => b.ts.localeCompare(a.ts));
      if (alive) setActivity(rows.slice(0, 6));
    })();
    return () => { alive = false; };
  }, []);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    onSearch(q.trim());
  };

  // Tracked = union of pinned_entities and subscriptions, deduped
  const tracked = useMemo(() => {
    const seen = new Set<string>();
    const rows: { key: string; entity_type: string; pub_id: string; href: string | null; label?: string | null; source?: string }[] = [];
    for (const p of pins) {
      const normalizedLabel = (p.label || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const k = `${p.entity_type}:${normalizedLabel || p.pub_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ key: p.id, entity_type: p.entity_type, pub_id: p.pub_id, href: pinHref(p), label: p.label, source: p.source });
    }
    for (const s of subs) {
      const k = `${s.entity_type}:${s.pub_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const href = s.entity_type === "artist" ? `/artist/${s.pub_id}`
        : s.entity_type === "track" ? `/track/${s.pub_id}`
        : `/writer/${s.pub_id}`;
      rows.push({ key: s.id, entity_type: s.entity_type, pub_id: s.pub_id, href, source: "alert" });
    }
    return rows.slice(0, 12);
  }, [pins, subs]);

  async function handleUnpin(entity_type: string, pub_id: string) {
    if (!user?.id) return;
    await Promise.all([
      unpinEntity(user.id, entity_type, pub_id),
      supabase.from("pub_alert_subscriptions").delete().eq("user_id", user.id).eq("entity_type", entity_type).eq("pub_id", pub_id),
    ]);
    setPins((cur) => cur.filter((p) => !(p.entity_type === entity_type && p.pub_id === pub_id)));
    setSubs((cur) => cur.filter((s) => !(s.entity_type === entity_type && s.pub_id === pub_id)));
  }

  return (
    <div className="space-y-4">
      {/* Recent searches */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
            <Search className="w-3.5 h-3.5" /> Recent searches
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {recentSearches.length === 0 ? (
            <div className="text-xs text-muted-foreground">No recent searches yet.</div>
          ) : recentSearches.slice(0, 6).map((s, i) => (
            <button
              key={i}
              onClick={() => onSearch(/^https?:\/\//i.test(s.query) ? s.query : (s.artist && s.title ? `${s.artist} - ${s.title}` : s.query))}
              className="flex items-center gap-2 w-full text-left border border-border/40 rounded-md px-2 py-1.5 hover:bg-muted/30"
            >
              {s.coverUrl ? (
                <img src={s.coverUrl} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded bg-muted shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs truncate">{s.title || s.query}</div>
                {s.artist && <div className="text-[10px] text-muted-foreground truncate">{s.artist}</div>}
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Full-width hero boxes: pinned + alerts + watchlist */}
      <div className="space-y-4">
        {/* Watchlist highlights */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
              <Eye className="w-3.5 h-3.5" /> Watchlist highlights
            </CardTitle>
            <Link to="/shared-watchlists" className="text-[10px] text-primary hover:underline">All →</Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {watchlist.length === 0 ? (
              <div className="text-xs text-muted-foreground">No watchlist entries yet.</div>
            ) : watchlist.map((w) => {
              const path = w.pub_creator_id ? `/writer/${w.pub_creator_id}` : null;
              const Row = (
                <div className="flex items-center gap-2 border border-border/40 rounded-md px-2 py-1.5 hover:bg-muted/30">
                  <span className="text-xs truncate flex-1">{w.person_name}</span>
                  {w.pipeline_status && (
                    <Badge variant="outline" className="text-[9px] capitalize">{w.pipeline_status.replace(/_/g, " ")}</Badge>
                  )}
                </div>
              );
              return path ? <Link key={w.id} to={path}>{Row}</Link> : <div key={w.id}>{Row}</div>;
            })}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}