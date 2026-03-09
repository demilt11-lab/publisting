import { Info, AlertTriangle } from "lucide-react";
import { GapMessage } from "@/lib/confidence";

interface GapsMessageProps {
  gaps: GapMessage[];
}

export function GapsMessage({ gaps }: GapsMessageProps) {
  if (gaps.length === 0) return null;

  return (
    <div className="space-y-2">
      {gaps.map((gap, index) => (
        <div
          key={index}
          className={`flex gap-2.5 p-3 rounded-lg text-xs ${
            gap.type === "warning"
              ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
              : "bg-blue-500/10 border border-blue-500/20 text-blue-400"
          }`}
        >
          {gap.type === "warning" ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1 min-w-0">
            <p className="font-medium leading-tight">{gap.message}</p>
            {gap.action && (
              <p className="text-muted-foreground leading-tight">{gap.action}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}