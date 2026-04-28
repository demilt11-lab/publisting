import { useEffect, useState } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function MlcCredentialsPanel() {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [autoLookup, setAutoLookup] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("mlc_credentials")
        .select("username,auto_lookup_enabled")
        .eq("user_id", user.id).maybeSingle();
      if (data) {
        setUsername(data.username || "");
        setAutoLookup(!!data.auto_lookup_enabled);
        setHasExisting(true);
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast({ title: "Sign in required", variant: "destructive" }); return; }
      const payload: any = { user_id: user.id, username, auto_lookup_enabled: autoLookup };
      if (password) payload.password = password;
      const { error } = hasExisting
        ? await supabase.from("mlc_credentials").update(payload).eq("user_id", user.id)
        : await supabase.from("mlc_credentials").insert(payload);
      if (error) throw error;
      setHasExisting(true);
      setPassword("");
      toast({ title: "MLC credentials saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  if (loading) return <div className="text-xs text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold">MLC Public API credentials</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Get credentials at <a className="underline" href="https://www.cognitoforms.com/TheMLC1/TheMLCBulkDataFeedAndPublicAPI" target="_blank" rel="noreferrer">themlc.com</a>.
        Stored privately to your account; only you can read them.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <Label className="text-xs">{hasExisting ? "Password (leave blank to keep)" : "Password"}</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={autoLookup} onCheckedChange={setAutoLookup} id="mlc-auto" />
          <Label htmlFor="mlc-auto" className="text-xs">Enable automatic MLC lookup</Label>
        </div>
        <Button size="sm" onClick={save} disabled={saving || !username || (!hasExisting && !password)}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          {hasExisting ? "Update" : "Save"}
        </Button>
      </div>
    </div>
  );
}