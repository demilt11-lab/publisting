import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ConflictBadgeProps {
  conflictCount: number;
}

export const ConflictBadge = ({ conflictCount }: ConflictBadgeProps) => {
  if (conflictCount === 0) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-medium cursor-help">
          <AlertTriangle className="h-2.5 w-2.5" />
          {conflictCount}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {conflictCount} data conflict{conflictCount > 1 ? "s" : ""} — sources disagree
      </TooltipContent>
    </Tooltip>
  );
};
