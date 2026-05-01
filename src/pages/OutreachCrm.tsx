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
  STAGES, type OutreachRecord, type OutreachNote, type OutreachTask,
  type OutreachStage, type OutreachStatus, type OutreachEntityType,
} from "@/lib/api/outreachCrm";
import { recordFeedback } from "@/lib/api/modelFeedback";
import { Loader2, Plus, Trash2, CheckCircle2, Clock } from "lucide-react";

const ENTITY_TYPES: OutreachEntityType[] = ["artist", "writer", "producer", "track", "catalog"];

export default function OutreachCrm() {
  const { activeTeam, members, currentUserId } = useTeamContext();
  const { toast } = useToast();
  const [records, setRecords] = useState<OutreachRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OutreachRecord | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!activeTeam) return;
    setLoading(true);
    listOutreach(activeTeam.id)
      .then(setRecords)
      .catch((e) => toast({ title: "Failed to load outreach", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [activeTeam, toast]);

  const grouped = useMemo(() => {
    const m = new Map<OutreachStage, OutreachRecord[]>();
    for (const s of STAGES) m.set(s, []);
    for (const r of records) m.get(r.stage)!.push(r);
    return m;
  }, [records]);

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

  if (!activeTeam) {
    return <div className="p-8 text-muted-foreground">Select a team to use the outreach CRM.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Outreach CRM</h1>
          <p className="text-sm text-muted-foreground">{activeTeam.name} pipeline · {records.length} records</p>
        </div>
        <NewRecordDialog
          teamId={activeTeam.id}
          members={members}
          open={creating}
          onOpenChange={setCreating}
          onCreated={(r) => setRecords((p) => [r, ...p])}
        />
      </div>

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
                    className="p-3 cursor-pointer hover:border-primary transition-colors bg-card"
                    onClick={() => setSelected(r)}
                  >
                    <div className="text-sm font-medium truncate">{r.entity_name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{r.entity_type} · {r.status}</div>
                    {r.next_action && (
                      <div className="text-[11px] text-muted-foreground mt-1 truncate">→ {r.next_action}</div>
                    )}
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

      {selected && (
        <RecordDrawer
          record={selected}
          members={members}
          currentUserId={currentUserId}
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
  record, members, currentUserId, onClose, onStageChange, onStatusChange, onDelete, onUpdate,
}: {
  record: OutreachRecord;
  members: { user_id: string; invited_email?: string }[];
  currentUserId: string | null;
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
    const n = await addNote(record.id, record.team_id, noteBody.trim());
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
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}