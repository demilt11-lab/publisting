import { useState, useEffect, ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ModuleLoaderProps {
  isLoading: boolean;
  onRetry?: () => void;
  timeoutMs?: number;
  label?: string;
  skeletonRows?: number;
  children: ReactNode;
}

export function ModuleLoader({
  isLoading,
  onRetry,
  timeoutMs = 7000,
  label = "Loading data",
  skeletonRows = 3,
  children,
}: ModuleLoaderProps) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      return;
    }
    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(t);
  }, [isLoading, timeoutMs]);

  if (!isLoading) return <>{children}</>;

  if (timedOut) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
        <p className="text-xs text-muted-foreground max-w-[300px]">
          This data is taking longer than usual. You can try again or continue using other sections.
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 text-xs">
            <RefreshCw className="w-3 h-3" /> Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {label}…
      </div>
      {Array.from({ length: skeletonRows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}
