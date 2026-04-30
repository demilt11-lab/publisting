import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Loader2, Plus, Play, Trash2, RefreshCw, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTeamContext } from "@/contexts/TeamContext";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchRules, fetchRecentRuns, createRule, updateRule, deleteRule, runRuleNow, runAllRulesNow,
  type AutomationRule, type AutomationRun,
} from "@/lib/api/automationRules";

const statusIcon: Record<string, any> = { success: CheckCircle2, skipped: MinusCircle, error: XCircle };
const statusColor: Record<string, string> = {
  success: "text-emerald-400", skipped: "text-muted-foreground", error: "text-destructive",
};

export default function AdminAutomationRules() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeTeam } = useTeamContext();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", trigger_type: "opportunity_score" as any,
    action_type: "add_to_outreach" as any,
    conditions: '{"min_score": 70, "entity_types": ["writer","producer"], "lifecycle_in": ["emerging","accelerating"]}',
    action_params: '{}', cooldown_hours: 24, scope: "team" as "team" | "personal",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [r, rn] = await Promise.all([fetchRules(), fetchRecentRuns(50)]);
      setRules(r); setRuns(rn);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      let conditions: any = {}, action_params: any = {};
      try { conditions = JSON.parse(form.conditions || "{}"); }
      catch { return toast({ title: "Invalid conditions JSON", variant: "destructive" }); }
      try { action_params = JSON.parse(form.action_params || "{}"); }
      catch { return toast({ title: "Invalid action params JSON", variant: "destructive" }); }
      if (!form.name) return toast({ title: "Name required", variant: "destructive" });
      if (form.scope === "team" && !activeTeam) return toast({ title: "No active team", variant: "destructive" });
      await createRule({
        name: form.name, description: form.description || null,
        enabled: true,
        owner_user_id: form.scope === "personal" ? user?.id ?? null : null,
        team_id: form.scope === "team" ? activeTeam?.id ?? null : null,
        trigger_type: form.trigger_type, action_type: form.action_type,
        conditions, action_params, cooldown_hours: form.cooldown_hours,
      });
      toast({ title: "Rule created" });
      setCreateOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message || "Try again", variant: "destructive" });
    }
  };

  const handleToggle = async (r: AutomationRule) => {
    try { await updateRule(r.id, { enabled: !r.enabled }); load(); }
    catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
  };

  const handleDelete = async (r: AutomationRule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    try { await deleteRule(r.id); load(); toast({ title: "Deleted" }); }
    catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
  };

  const handleRun = async (id: string) => {
    setRunning(id);
    try {
      const r: any = await runRuleNow(id);
      toast({ title: "Rule fired", description: `${r?.fired ?? 0} of ${r?.matched ?? 0} matches actioned.` });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setRunning(null); }
  };

  const handleRunAll = async () => {
    setRunning("all");
    try {
      const r: any = await runAllRulesNow();
      toast({ title: "Sweep complete", description: `${r?.fired ?? 0} actions across ${r?.rules_evaluated ?? 0} rules.` });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    } finally { setRunning(null); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Link to="/portfolio"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button></Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Automation Rules
            </h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" /></Button>
            <Button variant="outline" size="sm" onClick={handleRunAll} disabled={running === "all"} className="gap-1.5">
              {running === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run all now
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> New rule</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create automation rule</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label className="text-xs">Name</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. High-opp emerging writers → Outreach" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Description</Label>
                    <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">Trigger</Label>
                      <Select value={form.trigger_type} onValueChange={(v) => setForm({ ...form, trigger_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="opportunity_score">Opportunity score</SelectItem>
                          <SelectItem value="lifecycle_change">Lifecycle change</SelectItem>
                          <SelectItem value="alert_event">Alert event</SelectItem>
                        </SelectContent>
                      </Select></div>
                    <div className="space-y-1.5"><Label className="text-xs">Action</Label>
                      <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="add_to_outreach">Add to outreach</SelectItem>
                          <SelectItem value="tag_priority">Tag priority</SelectItem>
                          <SelectItem value="add_to_review">Add to review queue</SelectItem>
                          <SelectItem value="raise_alert">Raise alert</SelectItem>
                        </SelectContent>
                      </Select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">Scope</Label>
                      <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as any })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="team" disabled={!activeTeam}>Team {activeTeam ? `(${activeTeam.name})` : "(no active team)"}</SelectItem>
                          <SelectItem value="personal">Personal</SelectItem>
                        </SelectContent>
                      </Select></div>
                    <div className="space-y-1.5"><Label className="text-xs">Cooldown (hours)</Label>
                      <Input type="number" value={form.cooldown_hours} onChange={(e) => setForm({ ...form, cooldown_hours: Number(e.target.value) || 24 })} /></div>
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">Conditions (JSON)</Label>
                    <Textarea rows={4} className="font-mono text-xs" value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Action params (JSON)</Label>
                    <Textarea rows={2} className="font-mono text-xs" value={form.action_params} onChange={(e) => setForm({ ...form, action_params: e.target.value })} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Rules ({rules.length})</h2>
              {rules.length === 0 ? (
                <div className="glass rounded-xl p-8 text-center text-xs text-muted-foreground italic">No rules yet. Click "New rule" to create one.</div>
              ) : rules.map((r) => (
                <div key={r.id} className="glass rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{r.name}</p>
                        <Badge variant="outline" className="text-[9px]">{r.trigger_type}</Badge>
                        <Badge variant="outline" className="text-[9px]">{r.action_type}</Badge>
                        <Badge variant="outline" className="text-[9px]">{r.team_id ? "Team" : "Personal"}</Badge>
                        <Badge variant="outline" className="text-[9px]">cooldown {r.cooldown_hours}h</Badge>
                        <Badge variant="outline" className="text-[9px]">fires: {r.fire_count}</Badge>
                      </div>
                      {r.description && <p className="text-[11px] text-muted-foreground">{r.description}</p>}
                      <pre className="text-[10px] font-mono bg-muted/30 rounded p-1.5 overflow-auto">{JSON.stringify(r.conditions, null, 0)}</pre>
                      {r.last_run_at && <p className="text-[10px] text-muted-foreground/70">Last run {new Date(r.last_run_at).toLocaleString()}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={r.enabled} onCheckedChange={() => handleToggle(r)} />
                      <Button size="sm" variant="outline" disabled={running === r.id || r.trigger_type === "alert_event"} onClick={() => handleRun(r.id)} className="gap-1.5">
                        {running === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(r)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Recent runs ({runs.length})</h2>
              {runs.length === 0 ? (
                <div className="glass rounded-xl p-6 text-center text-xs text-muted-foreground italic">No runs yet.</div>
              ) : (
                <div className="space-y-1">
                  {runs.map((rn) => {
                    const Icon = statusIcon[rn.action_status] || MinusCircle;
                    return (
                      <div key={rn.id} className="glass rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${statusColor[rn.action_status]}`} />
                        <span className="font-medium truncate flex-1">{rn.display_name || rn.entity_key || "—"}</span>
                        <Badge variant="outline" className="text-[9px]">{rn.action_type}</Badge>
                        <Badge variant="outline" className="text-[9px]">{rn.triggered_by}</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(rn.created_at).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}