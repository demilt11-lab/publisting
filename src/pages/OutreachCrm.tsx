import { useEffect, useMemo, useState } from "react";
import { useTeamContext } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  listOutreach, createOutreach, updateOutreach, deleteOutreach,
  listNotes, addNote, listTasks, createTask, updateTask, listStatusHistory,
  listDismissals, dismissEntity, undismissEntity,
  STAGES, type OutreachRecord, type OutreachNote, type OutreachTask,
  type OutreachStage, type OutreachStatus, type OutreachEntityType, type OutreachDismissal,
} from "@/lib/api/outreachCrm";
import { recordFeedback } from "@/lib/api/modelFeedback";
import { Loader2, Plus, Trash2, CheckCircle2, Clock, EyeOff, Undo2, AlertTriangle } from "lucide-react";
import { OverdueFollowUpsPanel } from "@/components/outreach/OverdueFollowUpsPanel";
import { BulkContactStatusToolbar } from "@/components/outreach/BulkContactStatusToolbar";

const ENTITY_TYPES: OutreachEntityType[] = ["artist", "writer", "producer", "track", "catalog"];

export default function OutreachCrm() {
  const { activeTeam, members, currentUserId } = useTeamContext();
  const { toast } = useToast();
  const [records, setRecords] = useState<OutreachRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OutreachRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [dismissals, setDismissals] = useState<OutreachDismissal[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissalsOpen, setDismissalsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [overdueRefresh, setOverdueRefresh] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!activeTeam) return;
    setLoading(true);
    Promise.all([listOutreach(activeTeam.id), listDismissals(activeTeam.id)])
      .then(([page, dis]) => { setRecords(page.rows); setNextCursor(page.nextCursor); setDismissals(dis); })
      .catch((e) => toast({ title: "Failed to load outreach", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [activeTeam, toast]);

  const dismissedSet = useMemo(
    () => new Set(dismissals.map((d) => `${d.entity_type}::${d.entity_key}`)),
    [dismissals],
  );

  const visibleRecords = useMemo(
    () => showDismissed ? records : records.filter((r) => !dismissedSet.has(`${r.entity_type}::${r.entity_key}`)),
    [records, dismissedSet, showDismissed],
  );

  const grouped = useMemo(() => {
    const m = new Map<OutreachStage, OutreachRecord[]>();
    for (const s of STAGES) m.set(s, []);
    for (const r of visibleRecords) m.get(r.stage)!.push(r);
    return m;
  }, [visibleRecords]);

  async function handleStageChange(rec: OutreachRecord, stage: OutreachStage) {
    const updated = await updateOutreach(rec.id, { stage });
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? updated : r)));
    setSelected((s) => (s?.id === rec.id ? updated : s));
  }

  async function handleStatusChange(rec: OutreachRecord, status: OutreachStatus) {
    const updated = await updateOutreach(rec.id, { status });
    setRecords((prev) => prev.map((r) => (r.id === rec.id ? updated : r)));
    setSelected((s) => (s?.id === rec.id ? updated : s));
    if (status === "won" || status === "lost") {
      await recordFeedback({
        team_id: rec.team_id,
        kind: "outreach_outcome",
        entity_type: rec.entity_type,
        entity_key: rec.entity_key,
        model_name: "opportunity_score",
        signal: status === "won" ? 1 : -1,
        payload: { drivers: ["chart_movement", "alert_velocity", "collaborator_quality", "snapshot_momentum", "outreach_signal"] },
      });
    }
  }

  async function handleDismiss(rec: OutreachRecord, reason?: string) {
    if (!activeTeam) return;
    try {
      const d = await dismissEntity({
        team_id: activeTeam.id,
        entity_type: rec.entity_type,
        entity_key: rec.entity_key,
        entity_name: rec.entity_name,
        reason: reason ?? "Did not respond",
      });
      setDismissals((p) => [d, ...p.filter((x) => x.id !== d.id)]);
      toast({ title: "Hidden from lanes", description: `${rec.entity_name} will be remembered if encountered again.` });
    } catch (e: any) {
      toast({ title: "Failed to dismiss", description: e.message, variant: "destructive" });
    }
  }

  async function handleUndismiss(d: OutreachDismissal) {
    try {
      await undismissEntity(d.team_id, d.entity_type, d.entity_key);
      setDismissals((p) => p.filter((x) => x.id !== d.id));
    } catch (e: any) {
      toast({ title: "Failed to restore", description: e.message, variant: "destructive" });
    }
  }

  if (!activeTeam) {
    return <div className="p-8 text-muted-foreground">Select a team to use the outreach CRM.</div>;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  function toggleSelected(id: string) {
    setSelectedIds((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function reloadRecords() {
    if (!activeTeam) return;
    const page = await listOutreach(activeTeam.id);
    setRecords(page.rows);
    setNextCursor(page.nextCursor);
    setOverdueRefresh((n) => n + 1);
  }
  async function loadMoreRecords() {
    if (!activeTeam || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listOutreach(activeTeam.id, { cursor: nextCursor });
      setRecords((prev) => [...prev, ...page.rows]);
      setNextCursor(page.nextCursor);
    } catch (e: any) {
      toast({ title: "Failed to load more", description: e.message, variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Outreach CRM</h1>
          <p className="text-sm text-muted-foreground">
            {activeTeam.name} pipeline · {records.length} records
            {dismissals.length > 0 && <> · <button className="underline hover:text-foreground" onClick={() => setDismissalsOpen(true)}>{dismissals.length} dismissed</button></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDismissed((s) => !s)}
            title="Toggle dismissed cards in lanes"
          >
            <EyeOff className="h-4 w-4 mr-1" /> {showDismissed ? "Hide dismissed" : "Show dismissed"}
          </Button>
          <NewRecordDialog
            teamId={activeTeam.id}
            members={members}
            open={creating}
            onOpenChange={setCreating}
            onCreated={(r) => setRecords((p) => [r, ...p])}
          />
        </div>
      </div>

      <OverdueFollowUpsPanel key={overdueRefresh} teamId={activeTeam.id} />
      <BulkContactStatusToolbar
        selectedIds={Array.from(selectedIds)}
        onCleared={() => setSelectedIds(new Set())}
        onUpdated={reloadRecords}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto">
          {STAGES.slice(0, 7).map((stage) => (
            <div key={stage} className="min-w-[220px]">
              <div className="flex items-center justify-between px-2 pb-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">{stage}</span>
                <Badge variant="outline" className="text-[10px]">{grouped.get(stage)?.length ?? 0}</Badge>
              </div>
              <div className="space-y-2">
                {(grouped.get(stage) ?? []).map((r) => (
                  <Card
                    key={r.id}
                    className={`p-3 cursor-pointer hover:border-primary transition-colors bg-card group relative ${
                      dismissedSet.has(`${r.entity_type}::${r.entity_key}`) ? "opacity-50" : ""
                    } ${selectedIds.has(r.id) ? "border-primary" : ""}`}
                    onClick={() => setSelected(r)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-3.5 w-3.5 cursor-pointer accent-primary"
                        checked={selectedIds.has(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelected(r.id)}
                        title="Select for bulk action"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{r.entity_name}</div>
                        <div className="text-xs text-muted-foreground capitalize">{r.entity_type} · {r.status}</div>
                        {r.next_action && (
                          <div className="text-[11px] text-muted-foreground mt-1 truncate">→ {r.next_action}</div>
                        )}
                        {r.next_follow_up_date && r.next_follow_up_date <= todayStr && (
                          <Badge variant="outline" className="mt-1 text-[10px] border-amber-500/40 text-amber-200 gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" /> Follow-up due
                          </Badge>
                        )}
                      </div>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 -m-1"
                        onClick={(e) => { e.stopPropagation(); handleDismiss(r); }}
                        title="Hide from lanes (remember name)"
                        aria-label="Dismiss"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Card>
                ))}
                {(grouped.get(stage)?.length ?? 0) === 0 && (
                  <div className="text-xs text-muted-foreground/60 px-2">Empty</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={loadMoreRecords} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}

      {selected && (
        <RecordDrawer
          record={selected}
          members={members}
          currentUserId={currentUserId}
          isDismissed={dismissedSet.has(`${selected.entity_type}::${selected.entity_key}`)}
          onDismiss={async (reason) => { await handleDismiss(selected, reason); }}
          onRestore={async () => {
            const d = dismissals.find((x) => x.entity_type === selected.entity_type && x.entity_key === selected.entity_key);
            if (d) await handleUndismiss(d);
          }}
          onClose={() => setSelected(null)}
          onStageChange={(s) => handleStageChange(selected, s)}
          onStatusChange={(s) => handleStatusChange(selected, s)}
          onDelete={async () => {
            await deleteOutreach(selected.id);
            setRecords((p) => p.filter((r) => r.id !== selected.id));
            setSelected(null);
          }}
          onUpdate={(u) => {
            setRecords((p) => p.map((r) => (r.id === u.id ? u : r)));
            setSelected(u);
          }}
        />
      )}

      <Dialog open={dismissalsOpen} onOpenChange={setDismissalsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dismissed entities</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            These names are hidden from outreach lanes but remembered. If they appear again in alerts, recommendations, or imports, they'll be flagged so you can restore them here.
          </p>
          <div className="space-y-2 mt-2">
            {dismissals.length === 0 && <div className="text-sm text-muted-foreground">Nothing dismissed.</div>}
            {dismissals.map((d) => (
              <div key={d.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{d.entity_name}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">
                    {d.entity_type} · {d.reason ?? "no reason"} · {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleUndismiss(d)}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Restore
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewRecordDialog({
  teamId, members, open, onOpenChange, onCreated,
}: {
  teamId: string;
  members: { user_id: string; invited_email?: string }[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (r: OutreachRecord) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<OutreachEntityType>("artist");
  const [owner, setOwner] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const rec = await createOutreach({
        team_id: teamId,
        entity_type: type,
        entity_key: name.trim().toLowerCase().replace(/\s+/g, "-"),
        entity_name: name.trim(),
        owner_id: owner || null,
      });
      onCreated(rec);
      onOpenChange(false);
      setName("");
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> New record</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New outreach record</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Entity name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sabrina Carpenter" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as OutreachEntityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Owner</label>
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.invited_email ?? m.user_id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={submit} disabled={submitting || !name.trim()} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecordDrawer({
  record, members, currentUserId, isDismissed, onDismiss, onRestore, onClose, onStageChange, onStatusChange, onDelete, onUpdate,
}: {
  record: OutreachRecord;
  members: { user_id: string; invited_email?: string }[];
  currentUserId: string | null;
  isDismissed: boolean;
  onDismiss: (reason?: string) => Promise<void>;
  onRestore: () => Promise<void>;
  onClose: () => void;
  onStageChange: (s: OutreachStage) => void;
  onStatusChange: (s: OutreachStatus) => void;
  onDelete: () => Promise<void>;
  onUpdate: (r: OutreachRecord) => void;
}) {
  const [notes, setNotes] = useState<OutreachNote[]>([]);
  const [tasks, setTasks] = useState<OutreachTask[]>([]);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listStatusHistory>>>([]);
  const [noteBody, setNoteBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");

  useEffect(() => {
    listNotes(record.id).then(setNotes);
    listTasks(record.team_id, { outreachId: record.id }).then(setTasks);
    listStatusHistory(record.id).then(setHistory);
  }, [record.id, record.team_id]);

  async function postNote() {
    if (!noteBody.trim()) return;
    const n = await addNote(record.id, record.team_id, noteBody.trim(), [], {
      pub_artist_id: (record as any).pub_artist_id ?? null,
      pub_track_id: (record as any).pub_track_id ?? null,
      pub_creator_id: (record as any).pub_creator_id ?? null,
    });
    setNotes((p) => [...p, n]);
    setNoteBody("");
  }

  async function addTask() {
    if (!taskTitle.trim()) return;
    const t = await createTask({ team_id: record.team_id, outreach_id: record.id, title: taskTitle.trim(), due_at: taskDue || null });
    setTasks((p) => [...p, t]);
    setTaskTitle("");
    setTaskDue("");
  }

  async function toggleTask(t: OutreachTask) {
    const updated = await updateTask(t.id, { status: t.status === "done" ? "open" : "done" });
    setTasks((p) => p.map((x) => (x.id === t.id ? updated : x)));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {record.entity_name}
            <Badge variant="outline" className="capitalize text-xs">{record.entity_type}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Stage</label>
            <Select value={record.stage} onValueChange={(v) => onStageChange(v as OutreachStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={record.status} onValueChange={(v) => onStatusChange(v as OutreachStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["open", "blocked", "won", "lost", "on_hold"] as OutreachStatus[]).map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Owner</label>
            <Select
              value={record.owner_id ?? ""}
              onValueChange={async (v) => {
                const u = await updateOutreach(record.id, { owner_id: v || null });
                onUpdate(u);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.invited_email ?? m.user_id.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="notes" className="mt-4">
          <TabsList>
            <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
            <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="space-y-3">
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notes.map((n) => (
                <div key={n.id} className="text-sm p-2 rounded bg-muted/30">
                  <div className="text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
                  <div className="whitespace-pre-wrap">{n.body}</div>
                </div>
              ))}
              {notes.length === 0 && <div className="text-xs text-muted-foreground">No notes yet.</div>}
            </div>
            <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note. Use @user-id to mention." />
            <Button size="sm" onClick={postNote} disabled={!noteBody.trim()}>Post note</Button>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-3">
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                  <button onClick={() => toggleTask(t)} className="text-primary">
                    {t.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </button>
                  <span className={t.status === "done" ? "line-through text-muted-foreground" : ""}>{t.title}</span>
                  {t.due_at && <span className="text-[11px] text-muted-foreground ml-auto">{new Date(t.due_at).toLocaleDateString()}</span>}
                </div>
              ))}
              {tasks.length === 0 && <div className="text-xs text-muted-foreground">No tasks yet.</div>}
            </div>
            <div className="flex gap-2">
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" className="flex-1" />
              <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="w-40" />
              <Button size="sm" onClick={addTask} disabled={!taskTitle.trim()}>Add</Button>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-2 max-h-60 overflow-y-auto">
            {history.map((h) => (
              <div key={h.id} className="text-xs p-2 rounded bg-muted/30">
                <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span> ·{" "}
                {h.from_stage !== h.to_stage && <span>stage <b>{h.from_stage ?? "?"}</b> → <b>{h.to_stage}</b></span>}
                {h.from_status !== h.to_status && <span> status <b>{h.from_status ?? "?"}</b> → <b>{h.to_status}</b></span>}
              </div>
            ))}
            {history.length === 0 && <div className="text-xs text-muted-foreground">No history yet.</div>}
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-3 border-t">
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <div className="flex items-center gap-2">
            {isDismissed ? (
              <Button variant="outline" size="sm" onClick={() => onRestore()}>
                <Undo2 className="h-4 w-4 mr-1" /> Restore
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => onDismiss()}>
                <EyeOff className="h-4 w-4 mr-1" /> Dismiss (no response)
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}