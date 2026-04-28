import { useEffect, useState } from "react";
import { Loader2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function SpotifyCredentialsPanel() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [autoLookup, setAutoLookup] = useState(true);
  const [hasExisting, setHasExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("spotify_credentials")
        .select("client_id,auto_lookup_enabled")
        .eq("user_id", user.id).maybeSingle();
      if (data) {
        setClientId(data.client_id || "");
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
      const payload: any = { user_id: user.id, client_id: clientId, auto_lookup_enabled: autoLookup };
      if (clientSecret) payload.client_secret = clientSecret;
      const { error } = hasExisting
        ? await supabase.from("spotify_credentials").update(payload).eq("user_id", user.id)
        : await supabase.from("spotify_credentials").insert(payload);
      if (error) throw error;
      setHasExisting(true);
      setClientSecret("");
      toast({ title: "Spotify credentials saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("spotify-verify", {
        body: { title: "Bohemian Rhapsody", artist: "Queen" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Test failed");
      toast({ title: `Spotify OK (${data.usedCreds})`, description: `Returned ${data.candidates?.length ?? 0} candidate(s).` });
    } catch (e: any) {
      toast({ title: "Connection failed", description: String(e?.message || e), variant: "destructive" });
    } finally { setTesting(false); }
  }

  if (loading) return <div className="text-xs text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Music className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold">Spotify Web API credentials</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Create an app at <a className="underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com</a> and paste its Client ID + Secret.
        Stored privately to your account; only you can read them.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Client ID</Label>
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <Label className="text-xs">{hasExisting ? "Client Secret (leave blank to keep)" : "Client Secret"}</Label>
          <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={autoLookup} onCheckedChange={setAutoLookup} id="spotify-auto" />
          <Label htmlFor="spotify-auto" className="text-xs">Enable Spotify lookup</Label>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Test
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !clientId || (!hasExisting && !clientSecret)}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            {hasExisting ? "Update" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}