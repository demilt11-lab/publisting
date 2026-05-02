import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldCheck, ShieldAlert, AlertTriangle, GitMerge, MapPin, HelpCircle, Sparkles } from "lucide-react";

/**
 * Shared trust signal module. Show on every result card, recommendation card,
 * and detail-page header to surface confidence + provenance at a glance.
 */
export type TrustState =
  | "verified"        // Multiple high-confidence sources agree
  | "high"            // ≥0.8 confidence, ≥2 sources
  | "partial"         // Some credits/fields missing
  | "conflict"        // Sources disagree
  | "fallback"        // Regional / heuristic fallback used
  | "needs_review"    // Low confidence or flagged
  | "unknown";        // No data

export interface TrustSignal {
  state: TrustState;
  confidence?: number;          // 0..1
  sources?: string[];           // platforms / providers used
  agreeing?: string[];          // sources that agreed
  conflicting?: string[];       // sources that disagreed
  fallbackUsed?: string | null; // e.g. "regional", "ai-parse"
  completeness?: number;        // 0..1 of expected fields populated
}

const STYLE: Record<TrustState, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  verified:     { label: "Verified",        cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", Icon: ShieldCheck },
  high:         { label: "High confidence", cls: "bg-teal-500/10 text-teal-300 border-teal-500/30",         Icon: Sparkles },
  partial:      { label: "Partial credits", cls: "bg-amber-500/10 text-amber-300 border-amber-500/30",      Icon: ShieldAlert },
  conflict:     { label: "Source conflict", cls: "bg-rose-500/10 text-rose-300 border-rose-500/30",         Icon: GitMerge },
  fallback:     { label: "Regional fallback", cls: "bg-violet-500/10 text-violet-300 border-violet-500/30", Icon: MapPin },
  needs_review: { label: "Needs review",    cls: "bg-orange-500/10 text-orange-300 border-orange-500/30",   Icon: AlertTriangle },
  unknown:      { label: "Unknown",         cls: "bg-muted text-muted-foreground border-border",            Icon: HelpCircle },
};

export function deriveTrustState(input: {
  sources?: string[];
  agreeing?: string[];
  conflicting?: string[];
  confidence?: number;
  completeness?: number;
  fallbackUsed?: string | null;
}): TrustState {
  const conf = input.confidence ?? 0;
  const sourceCount = input.sources?.length ?? 0;
  if ((input.conflicting?.length ?? 0) >= 1 && sourceCount >= 2) return "conflict";
  if (input.fallbackUsed) return "fallback";
  if (conf >= 0.9 && sourceCount >= 3) return "verified";
  if (conf >= 0.75 && sourceCount >= 2) return "high";
  if ((input.completeness ?? 1) < 0.6) return "partial";
  if (conf > 0 && conf < 0.4) return "needs_review";
  if (sourceCount === 0 && conf === 0) return "unknown";
  return conf >= 0.5 ? "high" : "partial";
}

interface Props {
  signal: TrustSignal;
  size?: "sm" | "xs";
  showConfidence?: boolean;
  className?: string;
}

export function TrustBadge({ signal, size = "sm", showConfidence = true, className }: Props) {
  const s = STYLE[signal.state];
  const Icon = s.Icon;
  const heightCls = size === "xs" ? "h-4 text-[9px] px-1" : "h-5 text-[10px] px-1.5";
  const conf = typeof signal.confidence === "number" ? Math.round(signal.confidence * 100) : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`${s.cls} ${heightCls} gap-1 ${className ?? ""}`}>
          <Icon className="h-3 w-3" />
          <span>{s.label}</span>
          {showConfidence && conf !== null && <span className="opacity-70">· {conf}%</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <div className="space-y-1">
          <div className="font-medium">{s.label}{conf !== null ? ` · ${conf}% confidence` : ""}</div>
          {(signal.sources?.length ?? 0) > 0 && (
            <div className="text-muted-foreground">
              <span className="text-foreground">Sources:</span> {signal.sources!.join(", ")}
            </div>
          )}
          {(signal.agreeing?.length ?? 0) > 0 && (
            <div className="text-emerald-300">Agree: {signal.agreeing!.join(", ")}</div>
          )}
          {(signal.conflicting?.length ?? 0) > 0 && (
            <div className="text-rose-300">Conflict: {signal.conflicting!.join(", ")}</div>
          )}
          {signal.fallbackUsed && (
            <div className="text-violet-300">Fallback: {signal.fallbackUsed}</div>
          )}
          {typeof signal.completeness === "number" && (
            <div className="text-muted-foreground">
              Completeness: {Math.round(signal.completeness * 100)}%
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** Compact horizontal stack of trust + source chips for cards */
export function TrustRow({ signal }: { signal: TrustSignal }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <TrustBadge signal={signal} size="xs" />
      {(signal.sources ?? []).slice(0, 4).map((s) => (
        <Badge key={s} variant="outline" className="h-4 text-[9px] px-1 capitalize">
          {s}
        </Badge>
      ))}
      {(signal.sources?.length ?? 0) > 4 && (
        <span className="text-[9px] text-muted-foreground">+{signal.sources!.length - 4}</span>
      )}
    </div>
  );
}