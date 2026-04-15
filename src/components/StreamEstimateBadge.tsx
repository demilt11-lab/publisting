import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreamEstimateBadgeProps {
  estimate: {
    low: number;
    high: number;
    confidence: number;
    confidence_label: string;
    display: string;
    is_estimate: boolean;
  };
  className?: string;
}

function formatStreams(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function StreamEstimateBadge({ estimate, className }: StreamEstimateBadgeProps) {
  if (!estimate?.is_estimate) return null;

  const confidenceColor = estimate.confidence >= 70
    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
    : estimate.confidence >= 50
    ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
    : "text-red-400 border-red-500/30 bg-red-500/10";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] px-1.5 py-0 gap-1 cursor-help",
              confidenceColor,
              className
            )}
          >
            <Brain className="w-2.5 h-2.5" />
            Est. {formatStreams(estimate.low)}-{formatStreams(estimate.high)}
            <span className="opacity-70">({estimate.confidence}%)</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs">
          <p className="font-medium mb-1">Estimated Stream Count</p>
          <p className="text-muted-foreground">
            Real streaming data isn't available for this song. This estimate is based on
            playlist placements, chart history, social media activity, and genre averages.
          </p>
          <p className="mt-1 font-mono text-[10px]">
            Confidence: {estimate.confidence_label} ({estimate.confidence}%)
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
