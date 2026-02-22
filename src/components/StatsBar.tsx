import { useMemo, memo } from "react";
import { CheckCircle, AlertCircle, HelpCircle } from "lucide-react";
import { Credit } from "./CreditsSection";

interface StatsBarProps {
  credits: Credit[];
}

export const StatsBar = memo(({ credits }: StatsBarProps) => {
  const { signed, unsigned, unknown, total } = useMemo(() => ({
    signed: credits.filter(c => c.publishingStatus === "signed").length,
    unsigned: credits.filter(c => c.publishingStatus === "unsigned").length,
    unknown: credits.filter(c => c.publishingStatus === "unknown").length,
    total: credits.length,
  }), [credits]);

  const stats = [
    { label: "Signed", value: signed, icon: CheckCircle, color: "text-success" },
    { label: "Unsigned", value: unsigned, icon: AlertCircle, color: "text-warning" },
    { label: "Unknown", value: unknown, icon: HelpCircle, color: "text-muted-foreground" },
  ];

  return (
    <div className="glass rounded-xl p-4 animate-fade-up" style={{ animationDelay: "0.05s" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
              <span className="text-foreground font-medium">{stat.value}</span>
              <span className="text-muted-foreground text-sm">{stat.label}</span>
            </div>
          ))}
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{total}</span> total credits
        </div>
      </div>
    </div>
  );
});

StatsBar.displayName = "StatsBar";
