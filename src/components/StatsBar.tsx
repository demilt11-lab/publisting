import { useMemo, memo, useState } from "react";
import { CheckCircle, AlertCircle, HelpCircle, ChevronDown, ChevronUp, Percent, Hash } from "lucide-react";
import { Credit } from "./CreditsSection";

interface StatsBarProps {
  credits: Credit[];
}

export const StatsBar = memo(({ credits }: StatsBarProps) => {
  const [collapsed, setCollapsed] = useState(false);

  const { signed, unsigned, unknown, total, pctSigned } = useMemo(() => {
    const s = credits.filter(c => c.publishingStatus === "signed").length;
    const u = credits.filter(c => c.publishingStatus === "unsigned").length;
    const uk = credits.filter(c => c.publishingStatus === "unknown").length;
    const t = credits.length;
    return {
      signed: s, unsigned: u, unknown: uk, total: t,
      pctSigned: t > 0 ? Math.round((s / t) * 100) : 0,
    };
  }, [credits]);

  const stats = [
    { label: "Signed", value: signed, icon: CheckCircle, color: "text-success" },
    { label: "Unsigned", value: unsigned, icon: AlertCircle, color: "text-warning" },
    { label: "Unknown", value: unknown, icon: HelpCircle, color: "text-muted-foreground" },
    { label: "% Signed", value: `${pctSigned}%`, icon: Percent, color: "text-primary" },
    { label: "Total", value: total, icon: Hash, color: "text-foreground" },
  ];

  return (
    <div className="glass rounded-xl p-4 animate-fade-up" style={{ animationDelay: "0.05s" }}>
      <div className="flex items-center justify-between">
        {/* Mobile toggle */}
        <button
          className="sm:hidden flex items-center gap-1 text-sm text-muted-foreground"
          onClick={() => setCollapsed(v => !v)}
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          Stats
        </button>

        <div className={`flex items-center gap-4 sm:gap-6 flex-wrap ${collapsed ? "hidden sm:flex" : "flex"}`}>
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-1.5">
              <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color}`} />
              <span className="text-foreground font-medium text-sm">{stat.value}</span>
              <span className="text-muted-foreground text-xs">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

StatsBar.displayName = "StatsBar";
