import { Badge } from "@/components/ui/badge";
import { ArrowRight, Sparkles } from "lucide-react";
import type { PubAlert } from "@/lib/api/pubAlerts";

/**
 * Structured "what changed" summary for an alert. Reads diff-shaped fields off
 * alert.payload (old/new, prev/curr, before/after, delta). Renders nothing when
 * no diff signal is present.
 */
export function ChangeSummary({ alert }: { alert: PubAlert }) {
  const p = (alert.payload ?? {}) as Record<string, any>;
  const rows: { field: string; before?: any; after?: any; delta?: any }[] = [];

  // Generic prev/curr or old/new at top level
  const pairs: [string, string, string][] = [
    ["value", "old_value", "new_value"],
    ["confidence", "prev_confidence", "confidence"],
    ["rank", "prev_rank", "rank"],
    ["share", "prev_share", "share"],
    ["status", "prev_status", "status"],
  ];
  for (const [field, oldKey, newKey] of pairs) {
    if (oldKey in p || newKey in p) {
      rows.push({ field, before: p[oldKey], after: p[newKey] });
    }
  }
  if (Array.isArray(p.changes)) {
    for (const c of p.changes.slice(0, 4)) {
      if (c && typeof c === "object") {
        rows.push({ field: String(c.field ?? c.key ?? "field"), before: c.before ?? c.from, after: c.after ?? c.to, delta: c.delta });
      }
    }
  }
  if (typeof p.delta === "number") {
    rows.push({ field: "delta", delta: p.delta });
  }

  if (!rows.length) return null;
  const importance: string | undefined = p.importance ?? p.severity_hint;
  const source: string | undefined = p.source ?? p.provider ?? p.platform;

  return (
    <div className="mt-2 rounded-md border border-border/40 bg-surface/40 p-2 space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Sparkles className="w-3 h-3" /> What changed
        {source && <Badge variant="outline" className="text-[9px] capitalize ml-1">{source}</Badge>}
        {importance && <Badge variant="outline" className="text-[9px] capitalize">{importance}</Badge>}
      </div>
      <div className="space-y-0.5">
        {rows.slice(0, 4).map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground capitalize w-20 shrink-0 truncate">{r.field}</span>
            {r.before !== undefined && (
              <span className="font-mono text-muted-foreground/80 truncate">{String(r.before)}</span>
            )}
            {r.before !== undefined && r.after !== undefined && (
              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            )}
            {r.after !== undefined && (
              <span className="font-mono text-foreground truncate">{String(r.after)}</span>
            )}
            {r.delta !== undefined && (
              <Badge
                variant="outline"
                className={`text-[9px] ${Number(r.delta) > 0 ? "text-emerald-300 border-emerald-500/40" : "text-rose-300 border-rose-500/40"}`}
              >
                {Number(r.delta) > 0 ? "+" : ""}{r.delta}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}