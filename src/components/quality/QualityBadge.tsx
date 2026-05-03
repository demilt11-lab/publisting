import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, AlertCircle, ShieldAlert } from "lucide-react";
import type { QualityRecord } from "@/lib/api/dataQuality";

interface Props {
  quality?: QualityRecord | null;
  size?: "xs" | "sm";
}

/** Compact data-quality badge for search result cards and entity headers. */
export function QualityBadge({ quality, size = "xs" }: Props) {
  if (!quality) {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-muted-foreground border-border">
        <ShieldAlert className="h-3 w-3 mr-1" /> Unscored
      </Badge>
    );
  }
  const score = quality.completeness_score ?? 0;
  const flags = quality.validation_flags ?? [];
  let tone = "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  let Icon = CheckCircle2;
  let label = "High quality";
  if (score < 50 || flags.length >= 3) {
    tone = "bg-rose-500/15 text-rose-300 border-rose-500/30";
    Icon = AlertCircle; label = "Low quality";
  } else if (score < 75 || flags.length >= 1) {
    tone = "bg-amber-500/15 text-amber-300 border-amber-500/30";
    Icon = AlertTriangle; label = "Partial data";
  }
  const cls = size === "xs" ? "text-[10px] px-1.5 py-0 h-5" : "text-xs px-2 py-0.5";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${cls} ${tone}`}>
            <Icon className="h-3 w-3 mr-1" /> {label} · {score}%
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1">
          <div>Completeness: <span className="font-mono">{score}%</span></div>
          <div>Confidence: <span className="font-mono">{quality.confidence_score}%</span></div>
          {quality.missing_fields?.length ? (
            <div>Missing: {quality.missing_fields.join(", ")}</div>
          ) : null}
          {flags.length ? <div>Flags: {flags.join(", ")}</div> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}