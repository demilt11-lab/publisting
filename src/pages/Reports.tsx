import { useEffect, useState } from "react";
import { useTeamContext } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  listBriefs, generateBrief, deleteBrief, downloadBrief,
  listSchedules, createSchedule, updateSchedule, deleteSchedule, listRuns, runScheduleNow,
  type Brief, type ReportSchedule, type ReportRun, type BriefKind, type ReportCadence,
} from "@/lib/api/briefsReports";
import { recomputeOverlays, listFeedback, getOverlay, type ModelFeedback, type ModelWeightOverlay } from "@/lib/api/modelFeedback";
import { Loader2, Download, Trash2, Play, Sparkles } from "lucide-react";

export default function Reports() {
  const { activeTeam } = useTeamContext();
  const { toast } = useToast();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [feedback, setFeedback] = useState<ModelFeedback[]>([]);
  const [overlay, setOverlay] = useState<ModelWeightOverlay | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // New brief
  const [briefKind, setBriefKind] = useState<BriefKind>("portfolio");
  const [briefTitle, setBriefTitle] = useState("");
  // New schedule
  const [schedName, setSchedName] = useState("");
  const [schedCadence, setSchedCadence] = useState<ReportCadence>("weekly");

  useEffect(() => {
    if (!activeTeam) return;
    setLoading(true);
    Promise.all([
      listBriefs(activeTeam.id),
      listSchedules(activeTeam.id),
      listRuns(activeTeam.id),
      listFeedback(activeTeam.id),
      getOverlay(activeTeam.id, "opportunity_score"),
    ])
      .then(([b, s, r, f, o]) => { setBriefs(b); setSchedules(s); setRuns(r); setFeedback(f); setOverlay(o); })
      .catch((e) => toast({ title: "Failed to load", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [activeTeam, toast]);

  async function handleGenerateBrief() {
    if (!activeTeam || !briefTitle.trim()) return;
    setGenerating(true);
    try {
      const b = await generateBrief({ team_id: activeTeam.id, kind: briefKind, title: briefTitle.trim() });
      setBriefs((p) => [b, ...p]);
      setBriefTitle("");
      toast({ title: "Brief generated" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateSchedule() {
    if (!activeTeam || !schedName.trim()) return;
    const s = await createSchedule({ team_id: activeTeam.id, name: schedName.trim(), cadence: schedCadence });
    setSchedules((p) => [s, ...p]);
    setSchedName("");
    toast({ title: "Schedule created" });
  }

  async function handleRunNow(s: ReportSchedule) {
    const run = await runScheduleNow(s.id);
    setRuns((p) => [run, ...p]);
    toast({ title: "Report ran", description: `${run.row_count} rows captured.` });
  }

  async function handleRecompute() {
    if (!activeTeam) return;
    const r = await recomputeOverlays(activeTeam.id);
    toast({ title: "Learning loop ran", description: `${r.updated} weight overlays updated.` });
    const o = await getOverlay(activeTeam.id, "opportunity_score");
    setOverlay(o);
  }

  if (!activeTeam) return <div className="p-8 text-muted-foreground">Select a team.</div>;
  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Reports & Briefs</h1>

      <Tabs defaultValue="briefs">
        <TabsList>
          <TabsTrigger value="briefs">Briefs ({briefs.length})</TabsTrigger>
          <TabsTrigger value="schedules">Schedules ({schedules.length})</TabsTrigger>
          <TabsTrigger value="runs">Recent Runs ({runs.length})</TabsTrigger>
          <TabsTrigger value="learning">Learning Loop</TabsTrigger>
        </TabsList>

        <TabsContent value="briefs" className="space-y-4">
          <Card className="p-4 space-y-2">
            <div className="text-sm font-medium">Generate brief</div>
            <div className="flex gap-2">
              <Select value={briefKind} onValueChange={(v) => setBriefKind(v as BriefKind)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["artist", "deal", "portfolio", "catalog", "custom"] as BriefKind[]).map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={briefTitle} onChange={(e) => setBriefTitle(e.target.value)} placeholder="Brief title" className="flex-1" />
              <Button onClick={handleGenerateBrief} disabled={generating || !briefTitle.trim()}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" /> Generate</>}
              </Button>
            </div>
          </Card>
          <div className="space-y-2">
            {briefs.map((b) => (
              <Card key={b.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{b.title}</div>
                  <div className="text-xs text-muted-foreground capitalize">{b.kind} · {new Date(b.created_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => downloadBrief(b)}><Download className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await deleteBrief(b.id); setBriefs((p) => p.filter((x) => x.id !== b.id)); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
            {briefs.length === 0 && <div className="text-sm text-muted-foreground">No briefs yet.</div>}
          </div>
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <Card className="p-4 space-y-2">
            <div className="text-sm font-medium">New schedule</div>
            <div className="flex gap-2">
              <Input value={schedName} onChange={(e) => setSchedName(e.target.value)} placeholder="Weekly A&R digest" className="flex-1" />
              <Select value={schedCadence} onValueChange={(v) => setSchedCadence(v as ReportCadence)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["daily", "weekly", "monthly", "adhoc"] as ReportCadence[]).map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleCreateSchedule} disabled={!schedName.trim()}>Create</Button>
            </div>
          </Card>
          <div className="space-y-2">
            {schedules.map((s) => (
              <Card key={s.id} className="p-3 flex items-center gap-3">
                <Switch checked={s.enabled} onCheckedChange={async (v) => {
                  const u = await updateSchedule(s.id, { enabled: v });
                  setSchedules((p) => p.map((x) => (x.id === s.id ? u : x)));
                }} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.cadence} · sources: {s.source_kinds.join(", ")} · next: {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : "—"}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleRunNow(s)}><Play className="h-4 w-4 mr-1" /> Run</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await deleteSchedule(s.id); setSchedules((p) => p.filter((x) => x.id !== s.id)); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </Card>
            ))}
            {schedules.length === 0 && <div className="text-sm text-muted-foreground">No schedules yet.</div>}
          </div>
        </TabsContent>

        <TabsContent value="runs" className="space-y-2">
          {runs.map((r) => (
            <Card key={r.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm">{new Date(r.ran_at).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground capitalize">{r.cadence} · {r.row_count} rows</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                const blob = new Blob([JSON.stringify(r.payload, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `report-${r.id}.json`;
                a.click();
              }}><Download className="h-4 w-4" /></Button>
            </Card>
          ))}
          {runs.length === 0 && <div className="text-sm text-muted-foreground">No runs yet.</div>}
        </TabsContent>

        <TabsContent value="learning" className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Opportunity-score weight overlay</div>
                <div className="text-xs text-muted-foreground">Sample size: {overlay?.sample_size ?? 0} · Updated: {overlay ? new Date(overlay.computed_at).toLocaleString() : "Never"}</div>
              </div>
              <Button onClick={handleRecompute}><Sparkles className="h-4 w-4 mr-1" /> Recompute now</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
              {Object.entries(overlay?.weights ?? { chart_movement: 0.25, alert_velocity: 0.20, collaborator_quality: 0.20, snapshot_momentum: 0.20, outreach_signal: 0.15 }).map(([k, v]) => (
                <div key={k} className="p-2 rounded bg-muted/30 text-center">
                  <div className="text-[10px] uppercase text-muted-foreground">{k.replace(/_/g, " ")}</div>
                  <div className="text-sm font-semibold">{(v * 100).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium mb-2">Recent feedback ({feedback.length})</div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {feedback.slice(0, 30).map((f) => (
                <div key={f.id} className="text-xs flex items-center justify-between p-2 rounded bg-muted/20">
                  <div>
                    <Badge variant="outline" className="mr-1 text-[10px]">{f.kind}</Badge>
                    {f.entity_key ?? "—"}
                  </div>
                  <div className="text-muted-foreground">signal {f.signal ?? 0}</div>
                </div>
              ))}
              {feedback.length === 0 && <div className="text-xs text-muted-foreground">No feedback yet. Mark outreach as won/lost or accept/reject recommendations to feed the loop.</div>}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}