import { useMemo } from "react";
import { Search, Briefcase, Shield } from "lucide-react";
import { SearchHistoryEntry } from "@/hooks/useSearchHistory";
import { Deal } from "@/components/DealsTracker";

interface QuickStatsWidgetProps {
  history: SearchHistoryEntry[];
  deals: Deal[];
}

export const QuickStatsWidget = ({ history, deals }: QuickStatsWidgetProps) => {
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = history.filter(h => h.timestamp >= today.getTime()).length;
    const activeDealCount = deals.filter(d => d.status !== "Signed" && d.status !== "Passed").length;

    let totalSigned = 0;
    let totalCredits = 0;
    history.forEach(h => {
      if (h.totalCount && h.totalCount > 0) {
        totalSigned += h.signedCount ?? 0;
        totalCredits += h.totalCount;
      }
    });
    const avgSync = totalCredits > 0 ? Math.round((totalSigned / totalCredits) * 100) : 0;

    return { todayCount, activeDealCount, avgSync };
  }, [history, deals]);

  if (stats.todayCount === 0 && stats.activeDealCount === 0) return null;

  return (
    <div className="flex items-center justify-center gap-4 sm:gap-6 text-xs text-muted-foreground animate-fade-up">
      <div className="flex items-center gap-1.5">
        <Search className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{stats.todayCount}</span> checked today
      </div>
      {stats.activeDealCount > 0 && (
        <div className="flex items-center gap-1.5">
          <Briefcase className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">{stats.activeDealCount}</span> in pipeline
        </div>
      )}
      {stats.avgSync > 0 && (
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">{stats.avgSync}%</span> avg sync
        </div>
      )}
    </div>
  );
};
