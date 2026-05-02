import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import type { PubAlert } from "@/lib/api/pubAlerts";

/**
 * Show why this alert fired: source provider, confidence, payload-specific signal context.
 * Reads from alert.payload — falls back gracefully when fields are absent.
 */
export function AlertProvenance({ alert }: { alert: PubAlert }) {
  const p = (alert.payload ?? {}) as Record<string, any>;
  const source: string | undefined = p.source ?? p.provider ?? p.platform ?? p.source_used;
  const confidence: number | undefined = typeof p.confidence === "number" ? p.confidence : undefined;
  const conflict: string[] | undefined = Array.isArray(p.conflict_reasons) ? p.conflict_reasons : undefined;
  const signal: string | undefined = p.kind_label ?? p.role ?? p.chart_type ?? p.platform;
  const trustState: string | undefined = p.trust_state ?? p.conflict_state;

  const empty = !source && confidence == null && !conflict?.length && !signal && !trustState;
  if (empty) return null;

  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap text-[10px]">
      <ShieldCheck className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">Why:</span>
      {source && <Badge variant="outline" className="text-[10px] capitalize">{source}</Badge>}
      {signal && signal !== source && (
        <Badge variant="outline" className="text-[10px] capitalize">{signal}</Badge>
      )}
      {confidence != null && (
        <Badge
          variant="outline"
          className={`text-[10px] ${confidence >= 0.8 ? "text-emerald-300 border-emerald-500/40"
            : confidence >= 0.5 ? "text-amber-300 border-amber-500/40"
            : "text-red-300 border-red-500/40"}`}
        >
          {Math.round(confidence * 100)}% conf
        </Badge>
      )}
      {trustState && (
        <Badge variant="outline" className="text-[10px] capitalize">trust: {trustState}</Badge>
      )}
      {conflict?.slice(0, 2).map((c, i) => (
        <Badge key={i} variant="outline" className="text-[10px] text-amber-300 border-amber-500/40">
          {c}
        </Badge>
      ))}
    </div>
  );
}