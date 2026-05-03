import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CONTACT_STATUSES, type ContactStatus, bulkSetContactStatus } from "@/lib/api/outreachCrm";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { CheckSquare } from "lucide-react";

/**
 * Bulk action bar shown above the outreach lanes when records are selected.
 * Updates contact_status (and stamps last_contact_date) for many records at once.
 */
export function BulkContactStatusToolbar({
  selectedIds, onCleared, onUpdated,
}: {
  selectedIds: string[];
  onCleared: () => void;
  onUpdated: () => void;
}) {
  const [target, setTarget] = useState<ContactStatus>("contacted");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  if (!selectedIds.length) return null;

  async function apply() {
    setBusy(true);
    try {
      const n = await bulkSetContactStatus(selectedIds, target);
      toast({ title: `Updated ${n} contact${n === 1 ? "" : "s"}`, description: `Status set to ${target.replace("_", " ")}` });
      onUpdated();
      onCleared();
    } catch (e: any) {
      toast({ title: "Bulk update failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border border-primary/40 rounded-md p-2 flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-sm">
        <CheckSquare className="h-4 w-4 text-primary" />
        <Badge>{selectedIds.length} selected</Badge>
      </div>
      <Select value={target} onValueChange={(v) => setTarget(v as ContactStatus)}>
        <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          {CONTACT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={apply} disabled={busy}>Apply</Button>
      <Button size="sm" variant="ghost" onClick={onCleared}>Clear</Button>
    </div>
  );
}