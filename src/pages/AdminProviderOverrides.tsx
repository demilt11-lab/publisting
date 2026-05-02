import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AdminGate } from "@/components/admin/AdminGate";

type Action = "prefer_id" | "suppress_id" | "trust_source" | "distrust_source" | "canonical_field";

export default function AdminProviderOverrides() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [entityType, setEntityType] = useState("artist");
  const [pubId, setPubId] = useState("");
  const [platform, setPlatform] = useState("spotify");
  const [action, setAction] = useState<Action>("suppress_id");
  const [valueText, setValueText] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    const { data } = await supabase.from("provider_overrides")
      .select("*").order("created_at", { ascending: false }).limit(100);
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!pubId || !platform) return;
    let value: any = {};
    if (valueText.trim()) {
      try { value = JSON.parse(valueText); }
      catch { value = { value: valueText.trim() }; }
    }
    const { error } = await supabase.from("provider_overrides").insert({
      entity_type: entityType, pub_id: pubId.trim(), platform, action, value, reason: reason || null,
    });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Override saved" });
    setPubId(""); setValueText(""); setReason("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete override?")) return;
    await supabase.from("provider_overrides").delete().eq("id", id);
    load();
  }

  return (
    <AdminGate>
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Home</Button></Link>
            <h1 className="text-2xl font-semibold">Provider overrides</h1>
          </div>

          <Card className="bg-surface border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">New override</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-6 gap-2">
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["artist","track","creator","album"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="pub_…" value={pubId} onChange={(e) => setPubId(e.target.value)} />
              <Input placeholder="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} />
              <Select value={action} onValueChange={(v) => setAction(v as Action)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prefer_id">Prefer ID</SelectItem>
                  <SelectItem value="suppress_id">Suppress ID</SelectItem>
                  <SelectItem value="trust_source">Trust source</SelectItem>
                  <SelectItem value="distrust_source">Distrust source</SelectItem>
                  <SelectItem value="canonical_field">Canonical field value</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder='value or {"field":"x"}' value={valueText} onChange={(e) => setValueText(e.target.value)} />
              <Button onClick={add}><Plus className="w-4 h-4 mr-1" />Add</Button>
              <Input className="md:col-span-6" placeholder="Reason (audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
            </CardContent>
          </Card>

          <Card className="bg-surface border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Active overrides</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {!rows.length && <p className="text-xs text-muted-foreground">None yet.</p>}
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-2 border border-border rounded-md p-2 text-xs">
                  <Badge variant="outline">{r.entity_type}</Badge>
                  <code className="truncate max-w-[16ch]">{r.pub_id}</code>
                  <Badge variant="outline">{r.platform}</Badge>
                  <Badge>{r.action}</Badge>
                  <code className="truncate flex-1">{JSON.stringify(r.value)}</code>
                  <span className="text-muted-foreground">{r.reason}</span>
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminGate>
  );
}