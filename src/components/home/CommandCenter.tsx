import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search, Bell, Eye, Sparkles, ArrowRight, Loader2, Activity, Compass, GitCompare,
  Inbox, FlaskConical, Target,
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
import { StarterTemplates } from "@/components/templates/StarterTemplates";
import { DigestSummary } from "@/components/home/DigestSummary";

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
      const k = `${p.entity_type}:${p.pub_id}`;
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
    await unpinEntity(user.id, entity_type, pub_id);
    setPins((cur) => cur.filter((p) => !(p.entity_type === entity_type && p.pub_id === pub_id)));
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Publishing intelligence command center</div>
              <h1 className="text-2xl font-semibold mt-0.5">What are you scouting today?</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Search canonical entities, paste a Spotify/Apple/Deezer link, or jump into discovery filters.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Link to="/entity-hub"><Button size="sm" variant="outline" className="gap-1"><Compass className="w-3.5 h-3.5" /> Discovery</Button></Link>
              <Link to="/alerts"><Button size="sm" variant="outline" className="gap-1"><Inbox className="w-3.5 h-3.5" /> Alerts</Button></Link>
              <Link to="/compare"><Button size="sm" variant="outline" className="gap-1"><GitCompare className="w-3.5 h-3.5" /> Compare {tray.items.length > 0 ? `(${tray.items.length})` : ""}</Button></Link>
              <Link to="/portfolio"><Button size="sm" variant="outline" className="gap-1"><Target className="w-3.5 h-3.5" /> Portfolio</Button></Link>
            </div>
          </div>

          <form onSubmit={submit} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search any artist, track, writer, or producer — or paste a link / ISRC / UPC"
              className="pl-9 pr-24 h-11 text-sm"
            />
            <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8" disabled={!q.trim()}>
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Search"}
            </Button>
          </form>

          {matches.length > 0 && (
            <div className="space-y-1 border-t border-border/50 pt-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Canonical matches</div>
              {matches.map((m) => {
                const path = detailPathFor({
                  entity_type: m.entity_type as any, pub_id: m.pub_id,
                  primary_role: (m as any).primary_genre,
                });
                const sources = m.external_ids?.map((x) => x.platform) ?? [];
                const trust = deriveTrustState({
                  sources, confidence: m.score, completeness: m.score,
                });
                const Row = (
                  <div className="flex items-center gap-2 border border-border/40 rounded-md px-2 py-1.5 hover:bg-muted/30">
                    <Badge variant="outline" className="text-[9px] capitalize shrink-0">{m.entity_type}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{m.title || m.name}</div>
                      {m.primary_artist_name && (
                        <div className="text-[11px] text-muted-foreground truncate">{m.primary_artist_name}</div>
                      )}
                    </div>
                    <TrustBadge signal={{ state: trust, confidence: m.score, sources }} size="xs" showConfidence={false} />
                    <ResultActionBar entityType={m.entity_type as any} pubId={m.pub_id} label={m.title || m.name} compact />
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                );
                return path ? (
                  <Link key={`${m.entity_type}-${m.id}`} to={path}>{Row}</Link>
                ) : (
                  <button key={`${m.entity_type}-${m.id}`} className="block w-full text-left"
                    onClick={() => onSearch(m.title ? `${m.primary_artist_name || ""} - ${m.title}` : m.name)}>
                    {Row}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3-column: pinned + alerts + watchlist */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Pinned subscriptions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5" /> Tracked entities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {!user ? (
              <div className="text-xs text-muted-foreground italic">Sign in to subscribe to artists, tracks, writers and producers.</div>
            ) : !pinsLoaded ? (
              <div className="text-xs text-muted-foreground">Loading…</div>
            ) : tracked.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Nothing tracked yet. Click <span className="font-medium">Alert me</span> on any entity, or add to your watchlist — it pins here automatically.
              </div>
            ) : tracked.map((s) => {
              const Inner = (
                <div className="flex items-center gap-2 border border-border/40 rounded-md px-2 py-1.5 hover:bg-muted/30">
                  <Badge variant="outline" className="text-[9px] capitalize">{s.entity_type}</Badge>
                  <span className="text-xs truncate flex-1">{s.label || s.pub_id}</span>
                  {s.source && <Badge variant="outline" className="text-[9px] opacity-70">{s.source}</Badge>}
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                </div>
              );
              return s.href ? (
                <Link key={s.key} to={s.href}>{Inner}</Link>
              ) : (
                <div key={s.key}>{Inner}</div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent alerts */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
              <Bell className="w-3.5 h-3.5" /> Recent alerts
            </CardTitle>
            <Link to="/alerts" className="text-[10px] text-primary hover:underline">All →</Link>
          </CardHeader>
          <CardContent className="space-y-1">
            {alerts.length === 0 ? (
              <div className="text-xs text-muted-foreground">No alerts yet.</div>
            ) : alerts.slice(0, 5).map((a) => {
              const path = detailPathForAlert(a);
              const Inner = (
                <div className="border border-border/40 rounded-md px-2 py-1.5 hover:bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">{a.severity}</Badge>
                    <span className="text-xs font-medium truncate flex-1">{a.title}</span>
                    {!a.read_at && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                  </div>
                  {a.body && <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{a.body}</div>}
                </div>
              );
              return path ? <Link key={a.id} to={path}>{Inner}</Link> : <div key={a.id}>{Inner}</div>;
            })}
          </CardContent>
        </Card>

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

      {/* Activity + recent searches */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
              <Activity className="w-3.5 h-3.5" /> Recent entity activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {activity.length === 0 ? (
              <div className="text-xs text-muted-foreground">No activity yet.</div>
            ) : activity.map((a, i) => {
              const Row = (
                <div className="border border-border/40 rounded-md px-2 py-1.5 hover:bg-muted/30">
                  <div className="text-xs font-medium truncate">{a.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{a.sub}</div>
                </div>
              );
              return a.href ? <Link key={i} to={a.href}>{Row}</Link> : <div key={i}>{Row}</div>;
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
              <FlaskConical className="w-3.5 h-3.5" /> Quick discovery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {[
              { q: "Unsigned writers", to: "/entity-hub?role=writer&signed=unsigned" },
              { q: "Unsigned producers", to: "/entity-hub?role=producer&signed=unsigned" },
              { q: "Creators with 3+ sources", to: "/entity-hub?coverage=3" },
              { q: "Tracks missing credits", to: "/entity-hub?missing=credits" },
              { q: "Open Entity Hub", to: "/entity-hub" },
            ].map((qq) => (
              <Link key={qq.q} to={qq.to}
                className="flex items-center justify-between border border-border/40 rounded-md px-2 py-1.5 hover:bg-muted/30">
                <span className="text-xs">{qq.q}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
              </Link>
            ))}
            {recentSearches.length > 0 && (
              <div className="pt-2 border-t border-border/40 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent searches</div>
                {recentSearches.slice(0, 3).map((s, i) => (
                  <button key={i} onClick={() => onSearch(/^https?:\/\//i.test(s.query) ? s.query : (s.artist && s.title ? `${s.artist} - ${s.title}` : s.query))}
                    className="flex items-center gap-2 w-full text-left border border-border/40 rounded-md px-2 py-1.5 hover:bg-muted/30">
                    {s.coverUrl ? (
                      <img src={s.coverUrl} alt="" className="w-6 h-6 rounded object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs truncate">{s.title || s.query}</div>
                      {s.artist && <div className="text-[10px] text-muted-foreground truncate">{s.artist}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Starter alert templates */}
      <div className="grid md:grid-cols-2 gap-3">
        <StarterTemplates />
        <DigestSummary />
      </div>
    </div>
  );
}