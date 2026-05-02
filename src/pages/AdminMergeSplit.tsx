import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GitMerge, Split, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AdminGate } from "@/components/admin/AdminGate";

type EntityType = "artist" | "track" | "album" | "creator";

interface Candidate {
  pub_id: string;
  display_name: string;
  subtitle?: string | null;
  source_count?: number;
}

function EntityPicker({
  entityType,
  label,
  value,
  onPick,
}: {
  entityType: EntityType;
  label: string;
  value: Candidate | null;
  onPick: (c: Candidate | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);

  async function run() {
    if (!q.trim()) return;
    setSearching(true);
    const { data } = await supabase.rpc("pub_search_rank", {
      _q: q.trim(),
      _type: entityType,
      _limit: 10,
    });
    setResults(((data as any[]) || []).map((r) => ({
      pub_id: r.pub_entity_id,
      display_name: r.display_name,
      subtitle: r.subtitle,
      source_count: r.source_count,
    })));
    setSearching(false);
  }

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {value ? (
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="font-medium">{value.display_name}</div>
              <div className="text-xs text-muted-foreground">{value.pub_id}</div>
              {value.subtitle && <div className="text-xs text-muted-foreground">{value.subtitle}</div>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => onPick(null)}>Clear</Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or ID…"
                onKeyDown={(e) => e.key === "Enter" && run()} />
              <Button onClick={run} disabled={searching}>Search</Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-auto">
              {results.map((r) => (
                <button key={r.pub_id} onClick={() => onPick(r)}
                  className="w-full text-left rounded-md border border-border p-2 hover:bg-muted">
                  <div className="text-sm font-medium">{r.display_name}</div>
                  <div className="text-xs text-muted-foreground">{r.subtitle ?? r.pub_id}</div>
                </button>
              ))}
              {!results.length && !searching && q && (
                <div className="text-xs text-muted-foreground">No matches.</div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MergeTab() {
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<EntityType>("artist");
  const [src, setSrc] = useState<Candidate | null>(null);
  const [tgt, setTgt] = useState<Candidate | null>(null);
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  async function doMerge() {
    if (!src || !tgt) return;
    if (src.pub_id === tgt.pub_id) {
      toast({ title: "Source and target are identical", variant: "destructive" });
      return;
    }
    if (!confirm(`Merge ${src.display_name} → ${tgt.display_name}? All credits, links, notes, subscriptions move to target. Reversible via Split.`)) return;
    setRunning(true);
    const { data, error } = await supabase.rpc("pub_merge_entities", {
      _entity_type: entityType,
      _source_pub_id: src.pub_id,
      _target_pub_id: tgt.pub_id,
      _reason: reason || null,
    });
    setRunning(false);
    if (error) {
      toast({ title: "Merge failed", description: error.message, variant: "destructive" });
      return;
    }
    setLastResult(data);
    toast({ title: "Merge complete", description: "Entity reassigned and redirect recorded." });
    setSrc(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Entity type:</span>
        <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="artist">Artist</SelectItem>
            <SelectItem value="track">Track</SelectItem>
            <SelectItem value="album">Album</SelectItem>
            <SelectItem value="creator">Creator</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <EntityPicker entityType={entityType} label="Source (will be removed)" value={src} onPick={setSrc} />
        <EntityPicker entityType={entityType} label="Target (will keep)" value={tgt} onPick={setTgt} />
      </div>

      <Card className="bg-surface border-border">
        <CardContent className="pt-4 space-y-3">
          <Textarea placeholder="Reason (optional but recommended)" value={reason}
            onChange={(e) => setReason(e.target.value)} rows={2} />
          <div className="flex justify-end">
            <Button onClick={doMerge} disabled={!src || !tgt || running}>
              <GitMerge className="w-4 h-4 mr-2" />{running ? "Merging…" : "Merge"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card className="bg-surface border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Last merge result</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(lastResult, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BulkMergeTab() {
  const { toast } = useToast();
  const [csv, setCsv] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  async function run() {
    const rows = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = rows.map((r) => {
      const [entity_type, source_pub_id, target_pub_id, ...rest] = r.split(",").map((x) => x.trim());
      return { entity_type, source_pub_id, target_pub_id, reason: rest.join(",") || null };
    }).filter((x) => x.entity_type && x.source_pub_id && x.target_pub_id);
    if (!items.length) {
      toast({ title: "No valid rows parsed", variant: "destructive" });
      return;
    }
    if (!confirm(`Apply ${items.length} merges?`)) return;
    setRunning(true);
    const out: any[] = [];
    for (const it of items) {
      const { data, error } = await supabase.rpc("pub_merge_entities", {
        _entity_type: it.entity_type,
        _source_pub_id: it.source_pub_id,
        _target_pub_id: it.target_pub_id,
        _reason: it.reason,
      });
      out.push({ ...it, ok: !error, error: error?.message, moved: data });
    }
    setResults(out);
    setRunning(false);
    toast({ title: "Bulk merge finished", description: `${out.filter((x) => x.ok).length}/${out.length} succeeded.` });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Paste CSV: <code>entity_type,source_pub_id,target_pub_id,reason</code> — one per line.
      </p>
      <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={10}
        placeholder="artist,pub_artist_abc...,pub_artist_xyz...,duplicate scrape" />
      <div className="flex justify-end">
        <Button onClick={run} disabled={running}>{running ? "Running…" : "Apply bulk merge"}</Button>
      </div>
      {!!results.length && (
        <Card className="bg-surface border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Results</CardTitle></CardHeader>
          <CardContent className="space-y-1 max-h-80 overflow-auto">
            {results.map((r, i) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <Badge variant={r.ok ? "outline" : "destructive"}>{r.ok ? "OK" : "FAIL"}</Badge>
                <code>{r.entity_type}</code>
                <span className="truncate">{r.source_pub_id} → {r.target_pub_id}</span>
                {r.error && <span className="text-red-400">{r.error}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SplitTab() {
  const { toast } = useToast();
  const [redirects, setRedirects] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("entity_redirects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setRedirects(data || []);
  }
  useEffect(() => { load(); }, []);

  async function doSplit(r: any) {
    if (!confirm(`Restore ${r.old_pub_id} (was merged into ${r.new_pub_id})?`)) return;
    setBusyId(r.id);
    const { error } = await supabase.rpc("pub_split_entity", {
      _entity_type: r.entity_type,
      _old_pub_id: r.old_pub_id,
      _reason: "manual reversal",
    });
    setBusyId(null);
    if (error) {
      toast({ title: "Split failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Split complete" });
    load();
  }

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Recent redirects</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {!redirects.length && <p className="text-xs text-muted-foreground">No merges to reverse.</p>}
        {redirects.map((r) => (
          <div key={r.id} className="flex items-center justify-between border border-border rounded-md p-2 text-sm">
            <div>
              <Badge variant="outline" className="mr-2">{r.entity_type}</Badge>
              <code className="text-xs">{r.old_pub_id}</code>
              <span className="mx-2 text-muted-foreground">→</span>
              <code className="text-xs">{r.new_pub_id}</code>
              {r.reason && <span className="ml-2 text-xs text-muted-foreground">— {r.reason}</span>}
            </div>
            <Button size="sm" variant="outline" onClick={() => doSplit(r)} disabled={busyId === r.id}>
              <Split className="w-3.5 h-3.5 mr-1" />Split
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminMergeSplit() {
  return (
    <AdminGate>
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Home</Button></Link>
            <h1 className="text-2xl font-semibold">Entity Merge / Split</h1>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded-md p-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Merges reassign credits, external IDs, notes, subscriptions, watchlist, and outreach. They are reversible via Split while the redirect exists.</span>
          </div>
          <Tabs defaultValue="merge">
            <TabsList>
              <TabsTrigger value="merge">Interactive merge</TabsTrigger>
              <TabsTrigger value="bulk">Bulk merge (CSV)</TabsTrigger>
              <TabsTrigger value="split">Split / reverse</TabsTrigger>
            </TabsList>
            <TabsContent value="merge"><MergeTab /></TabsContent>
            <TabsContent value="bulk"><BulkMergeTab /></TabsContent>
            <TabsContent value="split"><SplitTab /></TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminGate>
  );
}