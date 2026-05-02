import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlaskConical, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  listTemplates, listMyTemplateSubs, subscribeTemplate, unsubscribeTemplate, type TemplateRow,
} from "@/lib/api/trackEntity";

/** One-click starter saved-query templates. Lives on the homepage and Hub. */
export function StarterTemplates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [subs, setSubs] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = await listTemplates();
      if (alive) setTemplates(t);
      if (user?.id) {
        const s = await listMyTemplateSubs(user.id);
        if (alive) setSubs(s);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const toggle = async (t: TemplateRow) => {
    if (!user?.id) { toast({ title: "Sign in required", variant: "destructive" }); return; }
    setBusy(t.id);
    if (subs.has(t.id)) {
      await unsubscribeTemplate(user.id, t.id);
      setSubs((cur) => { const n = new Set(cur); n.delete(t.id); return n; });
      toast({ title: "Unsubscribed" });
    } else {
      await subscribeTemplate(user.id, t.id);
      setSubs((cur) => new Set(cur).add(t.id));
      toast({ title: `Subscribed to "${t.title}"`, description: "Alerts will start populating after the next run." });
    }
    setBusy(null);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
          <FlaskConical className="w-3.5 h-3.5" /> Starter alert templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? <div className="text-xs text-muted-foreground">Loading…</div>
         : templates.length === 0 ? <div className="text-xs text-muted-foreground">No templates yet.</div>
         : templates.map((t) => {
          const subscribed = subs.has(t.id);
          return (
            <div key={t.id} className="flex items-center gap-2 border border-border/40 rounded-md px-2 py-1.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate">{t.title}</span>
                  {t.category && <Badge variant="outline" className="text-[9px] capitalize">{t.category}</Badge>}
                </div>
                {t.description && <div className="text-[10px] text-muted-foreground truncate">{t.description}</div>}
              </div>
              <Button size="sm" variant={subscribed ? "secondary" : "outline"} className="h-7 text-[10px] gap-1"
                onClick={() => toggle(t)} disabled={busy === t.id}>
                {busy === t.id ? <Loader2 className="w-3 h-3 animate-spin" />
                 : subscribed ? <><Check className="w-3 h-3" /> Subscribed</>
                 : "Subscribe"}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}