import { Info, AlertTriangle } from "lucide-react";
import { GapMessage } from "@/lib/confidence";

interface GapsMessageProps {
  gaps: GapMessage[];
}

export function GapsMessage({ gaps }: GapsMessageProps) {
  if (gaps.length === 0) return null;

  return (
    <div className="space-y-2 mt-4">
      {gaps.map((gap, index) => (
        <div
          key={index}
          className={`flex gap-2.5 p-3 rounded-md text-xs ${
            gap.type === "warning"
              ? "bg-warning/5 border border-warning/10 text-warning"
              : "bg-primary/5 border border-primary/10 text-muted-foreground"
          }`}
        >
          {gap.type === "warning" ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/70" />
          )}
          <div className="space-y-1 min-w-0">
            <p className={`leading-tight ${gap.type === "warning" ? "" : "text-foreground/80"}`}>
              {gap.message}
            </p>
            {gap.action && (
              <p className="text-muted-foreground leading-tight text-2xs">
                {gap.action}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}