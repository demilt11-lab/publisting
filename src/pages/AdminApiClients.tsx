import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, KeyRound, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AdminGate } from "@/components/admin/AdminGate";

export default function AdminApiClients() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function load() {
    const { data: c } = await supabase.from("api_clients").select("*").order("created_at", { ascending: false });
    setClients(c || []);
    const { data: l } = await supabase.from("api_request_log")
      .select("*").order("created_at", { ascending: false }).limit(100);
    setLogs(l || []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!user || !name.trim()) return;
    const { data, error } = await supabase.from("api_clients").insert({
      client_name: name.trim(),
      contact_email: email.trim() || null,
      user_id: user.id,
    }).select().single();
    if (error) {
      toast({ title: "Failed to create client", description: error.message, variant: "destructive" });
      return;
    }
    setName(""); setEmail("");
    toast({ title: "Client created", description: `API key (treat as secret): ${data.id}` });
    load();
  }

  async function toggle(c: any) {
    await supabase.from("api_clients").update({ is_active: !c.is_active }).eq("id", c.id);
    load();
  }
  async function remove(c: any) {
    if (!confirm(`Revoke ${c.client_name}? This deletes the key permanently.`)) return;
    await supabase.from("api_clients").delete().eq("id", c.id);
    load();
  }

  return (
    <AdminGate>
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Home</Button></Link>
            <h1 className="text-2xl font-semibold">API Clients</h1>
          </div>

          <Tabs defaultValue="clients">
            <TabsList>
              <TabsTrigger value="clients">Clients</TabsTrigger>
              <TabsTrigger value="logs">Request log</TabsTrigger>
            </TabsList>
            <TabsContent value="clients" className="space-y-4">
              <Card className="bg-surface border-border">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Create new client</CardTitle></CardHeader>
                <CardContent className="flex gap-2">
                  <Input placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} />
                  <Input placeholder="Contact email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Button onClick={create}><Plus className="w-4 h-4 mr-1" />Create</Button>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {clients.map((c) => (
                  <Card key={c.id} className="bg-surface border-border">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{c.client_name}</span>
                          <Badge variant={c.is_active ? "outline" : "destructive"}>{c.is_active ? "active" : "disabled"}</Badge>
                          <Badge variant="outline">{c.api_version}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <code>{c.id}</code> · {c.rate_limit_per_minute}/min · {c.quota_per_day}/day · scopes: {(c.scopes || []).join(", ") || "none"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => toggle(c)}>
                          <Power className="w-3.5 h-3.5 mr-1" />{c.is_active ? "Disable" : "Enable"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {!clients.length && <p className="text-sm text-muted-foreground">No clients yet.</p>}
              </div>
            </TabsContent>

            <TabsContent value="logs">
              <Card className="bg-surface border-border">
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left p-2">Time</th>
                        <th className="text-left p-2">Client</th>
                        <th className="text-left p-2">Method</th>
                        <th className="text-left p-2">Path</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => (
                        <tr key={l.id} className="border-b border-border/40">
                          <td className="p-2">{new Date(l.created_at).toLocaleString()}</td>
                          <td className="p-2"><code>{l.client_id?.slice(0, 8)}</code></td>
                          <td className="p-2">{l.method}</td>
                          <td className="p-2 truncate max-w-xs">{l.path}</td>
                          <td className="p-2">
                            <Badge variant={l.status_code && l.status_code < 400 ? "outline" : "destructive"}>
                              {l.status_code ?? "-"}
                            </Badge>
                          </td>
                          <td className="p-2">{l.latency_ms ?? "-"}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminGate>
  );
}