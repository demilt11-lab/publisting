import { CheckCircle, AlertCircle, HelpCircle } from "lucide-react";
import { Credit } from "./CreditsSection";

interface StatsBarProps {
  credits: Credit[];
}

export const StatsBar = ({ credits }: StatsBarProps) => {
  const signed = credits.filter(c => c.publishingStatus === "signed").length;
  const unsigned = credits.filter(c => c.publishingStatus === "unsigned").length;
  const unknown = credits.filter(c => c.publishingStatus === "unknown").length;
  const total = credits.length;

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
};
