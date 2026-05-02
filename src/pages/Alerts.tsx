import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Bell, CheckCheck, X, Loader2, RefreshCw, AlertTriangle, TrendingUp,
  Network as NetIcon, Inbox, ArrowRight, Filter, Trash2, Music, User2, Disc, Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { runEvaluator, markRead, dismiss } from "@/lib/api/lookupAlerts";
import {
  fetchInboxAlerts, markManyRead, markManyDismissed, listMySubscriptions, unsubscribe,
  detailPathForAlert, type PubAlert, type AlertFilters, type SubscriptionRow,
} from "@/lib/api/pubAlerts";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { exportRows } from "@/lib/exports/csv";
import { AlertProvenance } from "@/components/alerts/AlertProvenance";
import { ChangeSummary } from "@/components/alerts/ChangeSummary";

const sevCls: Record<string, string> = {
  high: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  info: "bg-blue-500/15 text-blue-300 border-blue-500/30",
};
const kindIcon: Record<string, any> = {
  spike: TrendingUp,
  confidence_drop: AlertTriangle,
  source_conflict: AlertTriangle,
  new_platform: NetIcon,
  pub_new_platform_link: NetIcon,
  pub_new_credit: User2,
  pub_chart_movement: TrendingUp,
};

export default function Alerts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<PubAlert[]>([]);
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<AlertFilters>({ status: "all" });
  const [tab, setTab] = useState<"inbox" | "subs">("inbox");

  const load = async () => {
    setLoading(true);
    const rows = await fetchInboxAlerts(filters, 200);
    setItems(rows);
    setSelected(new Set());
    if (user?.id) setSubs(await listMySubscriptions(user.id));
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [JSON.stringify(filters), user?.id]);

  const unreadCount = items.filter((a) => !a.read_at).length;
  const allKinds = useMemo(
    () => Array.from(new Set(items.map((a) => a.kind))).sort(),
    [items],
  );

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(items.map((a) => a.id)) : new Set());
  };

  const batchRead = async () => {
    await markManyRead(Array.from(selected));
    toast({ title: `Marked ${selected.size} as read` });
    await load();
  };
  const batchDismiss = async () => {
    await markManyDismissed(Array.from(selected));
    toast({ title: `Dismissed ${selected.size}` });
    await load();
  };

  const exportInbox = () => {
    exportRows(`publisting-alerts-${new Date().toISOString().slice(0, 10)}.csv`,
      items.map((a) => ({
        kind: a.kind, severity: a.severity, title: a.title, body: a.body,
        entity_type: a.entity_type, pub_artist_id: a.pub_artist_id,
        pub_track_id: a.pub_track_id, pub_creator_id: a.pub_creator_id,
        created_at: a.created_at, read: !!a.read_at,
      })));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button></Link>
            <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0">
              <Inbox className="w-5 h-5 text-primary" /> Alerts inbox
              {unreadCount > 0 && <Badge variant="secondary" className="text-[10px]">{unreadCount} unread</Badge>}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
            <Button variant="outline" size="sm" disabled={running} className="gap-2"
              onClick={async () => { setRunning(true); await runEvaluator(); await load(); setRunning(false); }}>
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />} Run evaluator
            </Button>
            <Button variant="outline" size="sm" disabled={!items.length} onClick={exportInbox}>Export CSV</Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="inbox" className="gap-2"><Inbox className="w-3.5 h-3.5" /> Inbox</TabsTrigger>
            <TabsTrigger value="subs" className="gap-2"><SettingsIcon className="w-3.5 h-3.5" /> Subscriptions ({subs.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="space-y-3 mt-3">
            {/* Filter bar */}
            <Card>
              <CardContent className="p-3 flex flex-wrap gap-2 items-center">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="h-8 text-xs flex-1 min-w-[180px]"
                  placeholder="Search title or body…"
                  value={filters.search ?? ""}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                />
                <Select value={filters.status ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as any }))}>
                  <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={(filters.entityTypes?.[0] as string) ?? "any"}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, entityTypes: v === "any" ? undefined : [v as any] }))}
                >
                  <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Entity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any entity</SelectItem>
                    <SelectItem value="artist">Artists</SelectItem>
                    <SelectItem value="track">Tracks</SelectItem>
                    <SelectItem value="creator">Creators</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filters.kinds?.[0] ?? "any"}
                  onValueChange={(v) => setFilters((f) => ({ ...f, kinds: v === "any" ? undefined : [v] }))}
                >
                  <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Kind" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any kind</SelectItem>
                    {allKinds.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Batch actions */}
            {items.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selected.size === items.length && items.length > 0}
                  onCheckedChange={(c) => toggleAll(!!c)}
                  aria-label="Select all"
                />
                <span className="text-xs text-muted-foreground">
                  {selected.size > 0 ? `${selected.size} selected` : `${items.length} alerts`}
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" disabled={!selected.size} onClick={batchRead}>
                    <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark read
                  </Button>
                  <Button size="sm" variant="outline" disabled={!selected.size} onClick={batchDismiss}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Dismiss
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading alerts…
              </div>
            ) : items.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground italic">
                No alerts match these filters yet. Try widening the filter or subscribe to entities from their detail pages.
              </CardContent></Card>
            ) : (
              <div className="space-y-1.5">
                {items.map((a) => {
                  const Icon = kindIcon[a.kind] || Bell;
                  const unread = !a.read_at;
                  const path = detailPathForAlert(a);
                  const isSel = selected.has(a.id);
                  return (
                    <Card key={a.id} className={`${unread ? "ring-1 ring-primary/30" : ""}`}>
                      <CardContent className="p-3 flex items-start gap-3">
                        <Checkbox checked={isSel} onCheckedChange={(c) => toggleSelect(a.id, !!c)} className="mt-1" aria-label="Select alert" />
                        <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{a.title}</span>
                            <Badge variant="outline" className={`text-[9px] ${sevCls[a.severity] || ""}`}>{a.severity}</Badge>
                            <Badge variant="outline" className="text-[9px]">{a.kind}</Badge>
                            {a.entity_type && (
                              <Badge variant="outline" className="text-[9px] capitalize">{a.entity_type}</Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {new Date(a.created_at).toLocaleString()}
                            </span>
                          </div>
                          {a.body && <p className="text-xs text-muted-foreground mt-1">{a.body}</p>}
                          {(a.pub_artist_id || a.pub_track_id || a.pub_creator_id) && (
                            <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
                              {a.pub_artist_id ?? a.pub_track_id ?? a.pub_creator_id}
                            </p>
                          )}
                          <AlertProvenance alert={a} />
                          <ChangeSummary alert={a} />
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {path && (
                            <Link to={path}>
                              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
                                Open <ArrowRight className="w-3 h-3" />
                              </Button>
                            </Link>
                          )}
                          {unread && (
                            <Button variant="ghost" size="sm" className="h-7 px-2"
                              onClick={async () => { await markRead(a.id); load(); }}>
                              <CheckCheck className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 px-2"
                            onClick={async () => { await dismiss(a.id); load(); }}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="subs" className="mt-3">
            {!user ? (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
                Sign in to manage subscriptions.
              </CardContent></Card>
            ) : subs.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
                You aren't subscribed to any entities yet. Open any artist, track, writer, or producer detail page and click "Alert me".
              </CardContent></Card>
            ) : (
              <div className="space-y-1.5">
                {subs.map((s) => {
                  const path =
                    s.entity_type === "artist" ? `/artist/${s.pub_id}` :
                    s.entity_type === "track"  ? `/track/${s.pub_id}`  :
                                                  `/writer/${s.pub_id}`;
                  const Icon = s.entity_type === "artist" ? User2 : s.entity_type === "track" ? Music : Disc;
                  return (
                    <Card key={s.id}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <Icon className="w-4 h-4 text-primary" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm capitalize">{s.entity_type}</div>
                          <div className="text-[11px] font-mono text-muted-foreground truncate">{s.pub_id}</div>
                        </div>
                        <Link to={path}>
                          <Button variant="ghost" size="sm" className="text-xs">Open <ArrowRight className="w-3 h-3 ml-1" /></Button>
                        </Link>
                        <Button variant="outline" size="sm" onClick={async () => {
                          await unsubscribe(s.id);
                          setSubs((p) => p.filter((x) => x.id !== s.id));
                          toast({ title: "Unsubscribed" });
                        }}>
                          Unsubscribe
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}