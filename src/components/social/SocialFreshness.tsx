import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

const STATUS_LABEL: Record<string, string> = {
  not_found: "Profile not found",
  rate_limited: "Temporarily unavailable",
  error: "Refresh failed",
};

interface Props {
  lastFetchedAt: string;
  status?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function SocialFreshness({
  lastFetchedAt,
  status,
  onRefresh,
  refreshing,
}: Props) {
  const ok = !status || status === "success";
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Last updated {relativeTime(lastFetchedAt)}</span>
      {!ok && (
        <Badge variant="outline" className="text-xs">
          {STATUS_LABEL[status!] ?? status}
        </Badge>
      )}
      {onRefresh && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span className="ml-1">Refresh</span>
        </Button>
      )}
    </div>
  );
}