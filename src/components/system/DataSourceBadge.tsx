import { AlertTriangle, CheckCircle2, CloudOff, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface DataSourceBadgeProps {
  source?: string | null;
  degraded?: boolean;
  servedFromCache?: boolean;
  cacheAgeSeconds?: number | null;
  unavailableSources?: string[];
  className?: string;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m old`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h old`;
  return `${Math.floor(seconds / 86_400)} days old`;
}

export function DataSourceBadge({
  source, degraded, servedFromCache, cacheAgeSeconds, unavailableSources, className,
}: DataSourceBadgeProps) {
  if (servedFromCache) {
    return (
      <Badge variant="outline" className={cn("gap-1 border-amber-500/50 text-amber-300", className)}>
        <CloudOff className="h-3 w-3" />
        From cache{typeof cacheAgeSeconds === "number" ? ` (${formatAge(cacheAgeSeconds)})` : ""}
      </Badge>
    );
  }
  if (degraded) {
    return (
      <Badge variant="outline" className={cn("gap-1 border-amber-500/50 text-amber-300", className)}>
        <AlertTriangle className="h-3 w-3" />
        Partial data{unavailableSources?.length ? ` (${unavailableSources.join(", ")} unavailable)` : ""}
      </Badge>
    );
  }
  if (source) {
    return (
      <Badge variant="outline" className={cn("gap-1 border-emerald-500/40 text-emerald-300", className)}>
        <CheckCircle2 className="h-3 w-3" />
        Live · {source}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("gap-1 text-muted-foreground", className)}>
      <Database className="h-3 w-3" /> Unknown source
    </Badge>
  );
}