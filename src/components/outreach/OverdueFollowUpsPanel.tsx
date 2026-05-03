import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Send, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listOverdueFollowUps, bulkSetContactStatus, type OutreachRecord } from "@/lib/api/outreachCrm";
import { useToast } from "@/hooks/use-toast";

/**
 * Inline alert panel for overdue follow-ups, used on /outreach.
 * Shows count badge + per-record "Send reminder" quick action that
 * stamps last_contact_date and bumps contact_status to "contacted".
 */
export function OverdueFollowUpsPanel({ teamId }: { teamId: string }) {
  const [items, setItems] = useState<OutreachRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listOverdueFollowUps(teamId)); }
    catch (e: any) { toast({ title: "Failed to load follow-ups", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [teamId, toast]);

  useEffect(() => { load(); }, [load]);

  async function sendReminder(rec: OutreachRecord) {
    try {
      await bulkSetContactStatus([rec.id], "contacted", { stampLastContact: true });
      toast({ title: "Marked as contacted", description: `${rec.entity_name} updated.` });
      setItems((p) => p.filter((r) => r.id !== rec.id));
    } catch (e: any) {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    }
  }

  if (!items.length && !loading) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-300" />
        <h3 className="text-sm font-semibold">Follow-ups overdue</h3>
        <Badge variant="outline" className="border-amber-500/40 text-amber-200">{items.length}</Badge>
      </div>
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {items.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded bg-background/40">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{r.entity_name}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Due {r.next_follow_up_date} · {r.contact_status.replace("_", " ")}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => sendReminder(r)} className="gap-1">
              <Send className="h-3 w-3" /> Send reminder
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}