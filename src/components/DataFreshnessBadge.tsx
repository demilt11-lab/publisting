import { Clock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DataFreshnessBadgeProps {
  lastVerifiedAt?: string | null;
  source?: string;
  cacheTtlHours?: number;
  onRefresh?: () => void;
  className?: string;
}

function getAge(dateStr: string): { label: string; stale: boolean; ageHours: number } {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = ms / (1000 * 60 * 60);
  const days = Math.floor(hours / 24);

  if (hours < 1) return { label: "Just now", stale: false, ageHours: hours };
  if (hours < 24) return { label: `${Math.floor(hours)}h ago`, stale: false, ageHours: hours };
  if (days < 7) return { label: `${days}d ago`, stale: days > 3, ageHours: hours };
  return { label: `${Math.floor(days / 7)}w ago`, stale: true, ageHours: hours };
}

export function DataFreshnessBadge({ lastVerifiedAt, source, cacheTtlHours = 168, onRefresh, className }: DataFreshnessBadgeProps) {
  if (!lastVerifiedAt) return null;

  const { label, stale, ageHours } = getAge(lastVerifiedAt);
  const isExpired = ageHours > cacheTtlHours;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] px-1.5 py-0 gap-0.5 cursor-default",
            isExpired ? "border-red-500/30 text-red-400" :
            stale ? "border-amber-500/30 text-amber-400" :
            "border-border text-muted-foreground",
            onRefresh && "cursor-pointer hover:bg-secondary/30",
            className
          )}
          onClick={onRefresh}
        >
          {onRefresh && isExpired ? (
            <RefreshCw className="w-2.5 h-2.5" />
          ) : (
            <Clock className="w-2.5 h-2.5" />
          )}
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>{source ? `${source} data` : "Data"} last verified {label}</p>
        {isExpired && <p className="text-red-400">Cache expired — click to refresh</p>}
      </TooltipContent>
    </Tooltip>
  );
}
