import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { X, Zap } from "lucide-react";

export interface BulkTarget {
  entity_type: "artist" | "track" | "creator" | "album";
  pub_id: string;
}

export type BulkAction =
  | "refresh"
  | "subscribe"
  | "unsubscribe"
  | "add_to_watchlist"
  | "tag";

interface Props {
  targets: BulkTarget[];
  onClear: () => void;
  onComplete?: (result: any) => void;
}

export function BulkActionsBar({ targets, onClear, onComplete }: Props) {
  const { toast } = useToast();
  const [action, setAction] = useState<BulkAction>("refresh");
  const [tag, setTag] = useState("");
  const [running, setRunning] = useState(false);
  if (!targets.length) return null;

  async function run() {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("bulk-entity-actions", {
      body: { action, targets, payload: action === "tag" ? { tag } : {} },
    });
    setRunning(false);
    if (error) {
      toast({ title: "Bulk action failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Bulk action complete",
      description: `${data?.succeeded ?? 0}/${targets.length} succeeded`,
    });
    onComplete?.(data);
    onClear();
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
      <Card className="bg-surface border-border px-4 py-3 flex items-center gap-3 shadow-lg">
        <Badge variant="outline">{targets.length} selected</Badge>
        <Select value={action} onValueChange={(v) => setAction(v as BulkAction)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="refresh">Refresh all providers</SelectItem>
            <SelectItem value="subscribe">Subscribe to alerts</SelectItem>
            <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
            <SelectItem value="add_to_watchlist">Add to watchlist</SelectItem>
            <SelectItem value="tag">Apply tag…</SelectItem>
          </SelectContent>
        </Select>
        {action === "tag" && (
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="tag"
            className="bg-background border border-border rounded px-2 py-1 text-sm w-32"
          />
        )}
        <Button size="sm" onClick={run} disabled={running}>
          <Zap className="w-3.5 h-3.5 mr-1" />{running ? "Running…" : "Run"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </Card>
    </div>
  );
}