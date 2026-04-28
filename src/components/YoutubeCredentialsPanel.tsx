import { useEffect, useState } from "react";
import { Loader2, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function YoutubeCredentialsPanel() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
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
        .from("youtube_credentials")
        .select("auto_lookup_enabled")
        .eq("user_id", user.id).maybeSingle();
      if (data) {
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
      const payload: any = { user_id: user.id, auto_lookup_enabled: autoLookup };
      if (apiKey) payload.api_key = apiKey;
      const { error } = hasExisting
        ? await supabase.from("youtube_credentials").update(payload).eq("user_id", user.id)
        : await supabase.from("youtube_credentials").insert(payload);
      if (error) throw error;
      setHasExisting(true);
      setApiKey("");
      toast({ title: "YouTube API key saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("youtube-verify", {
        body: { title: "Bohemian Rhapsody", artist: "Queen" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Test failed");
      toast({ title: `YouTube OK (${data.usedCreds})`, description: `Returned ${data.candidates?.length ?? 0} video(s).` });
    } catch (e: any) {
      toast({ title: "Connection failed", description: String(e?.message || e), variant: "destructive" });
    } finally { setTesting(false); }
  }

  if (loading) return <div className="text-xs text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Youtube className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold">YouTube Data API v3 key</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        Create an API key in <a className="underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud Console</a> with YouTube Data API v3 enabled.
        Stored privately to your account.
      </p>
      <div>
        <Label className="text-xs">{hasExisting ? "API key (leave blank to keep)" : "API key"}</Label>
        <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={autoLookup} onCheckedChange={setAutoLookup} id="yt-auto" />
          <Label htmlFor="yt-auto" className="text-xs">Enable YouTube lookup</Label>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Test
          </Button>
          <Button size="sm" onClick={save} disabled={saving || (!hasExisting && !apiKey)}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            {hasExisting ? "Update" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}