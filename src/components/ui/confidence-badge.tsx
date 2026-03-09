import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
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
    // #22C55E text, #052E16 bg, #14532D border
    className: "badge-subtle badge-confidence-high",
    description: "This section is based on complete, consistent data from our sources."
  },
  medium: {
    icon: AlertTriangle,
    label: "Medium", 
    // #EAB308 text, #3A2102 bg, #4A2F05 border
    className: "badge-subtle badge-confidence-medium",
    description: "Some data in this section may be missing or partial."
  },
  low: {
    icon: AlertCircle,
    label: "Low",
    // #F97373 text, #451A0A bg, #7F1D1D border
    className: "badge-subtle badge-confidence-low", 
    description: "Very limited data available; double-check with external sources."
  }
};

export function ConfidenceBadge({ confidence, size = "sm", showTooltip = true }: ConfidenceBadgeProps) {
  const config = confidenceConfig[confidence.level];
  const Icon = config.icon;
  
  const badge = (
    <span className={`${config.className} inline-flex items-center gap-1`}>
      <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
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
              <div className="text-xs text-muted-foreground">
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
      return <Icon className={`${iconClass}`} style={{ color: '#22C55E' }} />;
    case "medium":
      return <Icon className={`${iconClass}`} style={{ color: '#EAB308' }} />;
    case "low":
      return <Icon className={`${iconClass}`} style={{ color: '#F97373' }} />;
  }
}
