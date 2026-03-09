import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { ConfidenceLevel, ConfidenceResult } from "@/lib/confidence";

interface ConfidenceBadgeProps {
  confidence: ConfidenceResult;
  size?: "sm" | "md";
  showTooltip?: boolean;
}

const confidenceConfig = {
  high: {
    icon: CheckCircle2,
    label: "High",
    className: "badge-subtle badge-confidence-high",
    description: "This section is based on complete, consistent data from our sources."
  },
  medium: {
    icon: AlertTriangle,
    label: "Medium", 
    className: "badge-subtle badge-confidence-medium",
    description: "Some data in this section may be missing or partial."
  },
  low: {
    icon: AlertCircle,
    label: "Low",
    className: "badge-subtle badge-confidence-low", 
    description: "Very limited data available; double-check with external sources."
  }
};

export function ConfidenceBadge({ confidence, size = "sm", showTooltip = true }: ConfidenceBadgeProps) {
  const config = confidenceConfig[confidence.level];
  const Icon = config.icon;
  
  const badge = (
    <span className={`${config.className} inline-flex items-center gap-1`}>
      <Icon className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
      <span className="sr-only">Confidence:</span>
      {config.label}
    </span>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs p-3">
          <div className="space-y-2">
            <p className="text-xs font-medium">{config.description}</p>
            {confidence.reasons.length > 0 && (
              <div className="text-2xs text-muted-foreground">
                <p className="font-medium mb-1">Factors:</p>
                <ul className="space-y-0.5">
                  {confidence.reasons.slice(0, 3).map((reason, i) => (
                    <li key={i}>• {reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ConfidenceIcon({ level, size = "sm" }: { level: ConfidenceLevel; size?: "sm" | "md" }) {
  const config = confidenceConfig[level];
  const Icon = config.icon;
  
  const iconClass = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  
  switch (level) {
    case "high":
      return <Icon className={`${iconClass} text-emerald-400/80`} />;
    case "medium":
      return <Icon className={`${iconClass} text-amber-400/80`} />;
    case "low":
      return <Icon className={`${iconClass} text-red-400/80`} />;
  }
}