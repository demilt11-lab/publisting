import { CheckCircle2, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface EnrichmentProgressProps {
  isLoadingPro?: boolean;
  isLoadingShares?: boolean;
  hasCredits: boolean;
  hasProData: boolean;
  hasSharesData: boolean;
}

const phases = [
  { key: "credits", label: "Credits" },
  { key: "pro", label: "PRO & Publisher" },
  { key: "shares", label: "Ownership Shares" },
  { key: "social", label: "Social & Links" },
] as const;

export function EnrichmentProgress({
  isLoadingPro,
  isLoadingShares,
  hasCredits,
  hasProData,
  hasSharesData,
}: EnrichmentProgressProps) {
  if (!hasCredits) return null;

  const getStatus = (key: string) => {
    switch (key) {
      case "credits": return "done";
      case "pro": return isLoadingPro ? "loading" : hasProData ? "done" : "pending";
      case "shares": return isLoadingShares ? "loading" : hasSharesData ? "done" : "pending";
      case "social": return hasProData && hasSharesData ? "done" : "pending";
      default: return "pending";
    }
  };

  const allDone = phases.every(p => getStatus(p.key) === "done");
  if (allDone) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/10 border border-border/20">
      <span className="text-[10px] text-muted-foreground mr-1">Enriching:</span>
      {phases.map((phase) => {
        const status = getStatus(phase.key);
        return (
          <div key={phase.key} className="flex items-center gap-0.5">
            {status === "done" ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            ) : status === "loading" ? (
              <Loader2 className="w-3 h-3 text-primary animate-spin" />
            ) : (
              <Circle className="w-3 h-3 text-muted-foreground/40" />
            )}
            <span className={cn("text-[9px]",
              status === "done" ? "text-emerald-400" :
              status === "loading" ? "text-primary" : "text-muted-foreground/40"
            )}>
              {phase.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
