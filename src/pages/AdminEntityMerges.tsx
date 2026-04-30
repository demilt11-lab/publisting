import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GitMerge, Loader2, Check, X, RefreshCw, Plus, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  bulkDecide, createProposal, decideProposal, fetchProposals,
  type EntityType, type MergeProposal,
} from "@/lib/api/entityMerges";

const statusColor: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: "track", label: "Track" },
  { value: "artist", label: "Artist" },
  { value: "contributor", label: "Contributor" },
  { value: "work", label: "Work" },
];

export default function AdminEntityMerges() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [items, setItems] = useState<MergeProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState<MergeProposal | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    entity_type: "track" as EntityType,
    source_id: "", target_id: "",
    source_name: "", target_name: "",
    reason: "", evidence: "{}",
  });

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchProposals(tab, 200));
      setSelected(new Set());
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const allSelected = items.length > 0 && selected.size === items.length;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleDecide = async (id: string, decision: "approved" | "rejected") => {
    try {
      await decideProposal(id, decision);
      toast({ title: `Marked ${decision}`, description: "Proposal updated." });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" });
    }
  };

  const handleBulk = async (decision: "approved" | "rejected") => {
    if (selected.size === 0) return;
    try {
      await bulkDecide(Array.from(selected), decision);
      toast({ title: `Bulk ${decision}`, description: `${selected.size} proposals updated.` });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    try {
      let evidenceObj: any = {};
      try { evidenceObj = JSON.parse(form.evidence || "{}"); }
      catch { toast({ title: "Invalid JSON", description: "Evidence must be valid JSON.", variant: "destructive" }); return; }
      if (!form.source_id || !form.target_id) {
        toast({ title: "Missing IDs", description: "Source and target IDs are required.", variant: "destructive" });
        return;
      }
      await createProposal({
        entity_type: form.entity_type,
        source_id: form.source_id, target_id: form.target_id,
        source_name: form.source_name || undefined,
        target_name: form.target_name || undefined,
        reason: form.reason || undefined,
        evidence: evidenceObj,
      });
      toast({ title: "Proposal created" });
      setCreateOpen(false);
      setForm({ entity_type: "track", source_id: "", target_id: "", source_name: "", target_name: "", reason: "", evidence: "{}" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed", variant: "destructive" });
    }
  };

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 } as Record<string, number>;
    items.forEach((i) => { c[i.status] = (c[i.status] || 0) + 1; });
    return c;
  }, [items]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button></Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-primary" /> Entity Merge Proposals
            </h1>
          </div>
          <div className="flex gap-2 items-center">
            {(["pending", "approved", "rejected", "all"] as const).map((t) => (
              <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)} className="capitalize">
                {t}{tab === t && counts[t] !== undefined ? ` (${items.length})` : ""}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" /></Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Propose merge</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Propose entity merge</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Entity type</Label>
                    <Select value={form.entity_type} onValueChange={(v) => setForm({ ...form, entity_type: v as EntityType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ENTITY_TYPES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Source ID (will be merged INTO target)</Label>
                      <Input value={form.source_id} onChange={(e) => setForm({ ...form, source_id: e.target.value })} placeholder="uuid" />
                      <Input value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} placeholder="Source display name (optional)" className="text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Target ID (canonical to keep)</Label>
                      <Input value={form.target_id} onChange={(e) => setForm({ ...form, target_id: e.target.value })} placeholder="uuid" />
                      <Input value={form.target_name} onChange={(e) => setForm({ ...form, target_name: e.target.value })} placeholder="Target display name (optional)" className="text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Reason</Label>
                    <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. duplicate ISRC, alias detection" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><FileJson className="w-3 h-3" /> Evidence (JSON)</Label>
                    <Textarea rows={4} className="font-mono text-xs" value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate}>Create proposal</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="glass rounded-xl p-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handleBulk("approved")} className="gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Approve</Button>
              <Button size="sm" variant="outline" onClick={() => handleBulk("rejected")} className="gap-1.5"><X className="w-3.5 h-3.5 text-destructive" /> Reject</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground italic">
            No {tab} proposals.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2">
              <Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? new Set(items.map(i => i.id)) : new Set())} />
              <span className="text-[10px] text-muted-foreground">Select all on this page</span>
            </div>
            {items.map((it) => (
              <div key={it.id} className="glass rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggle(it.id)} className="mt-1" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[9px] capitalize">{it.entity_type}</Badge>
                      <Badge variant="outline" className={`text-[9px] capitalize ${statusColor[it.status]}`}>{it.status}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(it.created_at).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-border/50 p-2">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Source (merge from)</p>
                        <p className="font-medium text-foreground mt-0.5">{it.source_name || "—"}</p>
                        <p className="font-mono text-[10px] text-muted-foreground/70 break-all">{it.source_id}</p>
                      </div>
                      <div className="rounded-lg border border-border/50 p-2 bg-primary/5">
                        <p className="text-[9px] text-primary uppercase tracking-wide">Target (keep)</p>
                        <p className="font-medium text-foreground mt-0.5">{it.target_name || "—"}</p>
                        <p className="font-mono text-[10px] text-muted-foreground/70 break-all">{it.target_id}</p>
                      </div>
                    </div>
                    {it.reason && <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Reason: </span>{it.reason}</p>}
                    {it.status === "pending" ? (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => handleDecide(it.id, "approved")} className="gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => handleDecide(it.id, "rejected")} className="gap-1.5"><X className="w-3.5 h-3.5 text-destructive" /> Reject</Button>
                        <Button size="sm" variant="ghost" onClick={() => setPreviewing(it)} className="gap-1.5"><FileJson className="w-3.5 h-3.5" /> Evidence</Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="ghost" onClick={() => setPreviewing(it)} className="gap-1.5"><FileJson className="w-3.5 h-3.5" /> Evidence</Button>
                        {it.decided_at && <span className="text-[10px] text-muted-foreground self-center">Decided {new Date(it.decided_at).toLocaleString()}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!previewing} onOpenChange={(v) => !v && setPreviewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Merge evidence</DialogTitle></DialogHeader>
          {previewing && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{previewing.source_name || previewing.source_id}</span>
                {" → "}
                <span className="font-medium text-foreground">{previewing.target_name || previewing.target_id}</span>
              </div>
              <pre className="bg-muted/30 rounded-lg p-3 text-[10px] font-mono overflow-auto max-h-96">
                {JSON.stringify(previewing.evidence ?? {}, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}