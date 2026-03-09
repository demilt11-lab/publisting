import { memo } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useSystemStatus, ServiceName } from "@/contexts/SystemStatusContext";
import { Button } from "@/components/ui/button";

const SERVICE_LABELS: Record<ServiceName, string> = {
  "song-lookup": "song lookup",
  "pro-lookup": "PRO data",
  "streaming-stats": "streaming stats",
  "radio-airplay": "radio airplay",
  "chart-lookup": "chart data",
};

export const SystemStatusBanner = memo(() => {
  const { degradedServices, dismissedServices, dismissAll } = useSystemStatus();

  // Filter out dismissed services
  const activeServices = Array.from(degradedServices).filter(
    (s) => !dismissedServices.has(s)
  );

  if (activeServices.length === 0) return null;

  const serviceList = activeServices.map((s) => SERVICE_LABELS[s]).join(", ");

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/25 px-4 py-2">
      <div className="container flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Some data sources are temporarily degraded ({serviceList}). 
            Results may be incomplete; please double-check before making decisions.
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/20"
          onClick={dismissAll}
        >
          <X className="w-4 h-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  );
});

SystemStatusBanner.displayName = "SystemStatusBanner";
