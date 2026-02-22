import { useMemo, memo } from "react";
import { CheckCircle, AlertCircle, HelpCircle, Building2, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Credit } from "./CreditsSection";

interface RightsStatusSummaryProps {
  credits: Credit[];
}

export const RightsStatusSummary = memo(({ credits }: RightsStatusSummaryProps) => {
  const summary = useMemo(() => {
    const signed = credits.filter(c => c.publishingStatus === "signed").length;
    const unsigned = credits.filter(c => c.publishingStatus === "unsigned").length;
    const unknown = credits.filter(c => c.publishingStatus === "unknown").length;
    const total = credits.length;

    // Top publisher (most frequent)
    const publisherCounts = new Map<string, number>();
    credits.forEach(c => {
      if (c.publisher) {
        const count = publisherCounts.get(c.publisher) || 0;
        publisherCounts.set(c.publisher, count + 1);
      }
    });
    const topPublisher = [...publisherCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Top PRO (most frequent)
    const proCounts = new Map<string, number>();
    credits.forEach(c => {
      if (c.pro) {
        const count = proCounts.get(c.pro) || 0;
        proCounts.set(c.pro, count + 1);
      }
    });
    const topPro = [...proCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const signedPct = total > 0 ? Math.round((signed / total) * 100) : 0;

    return { signed, unsigned, unknown, total, topPublisher, topPro, signedPct };
  }, [credits]);

  if (credits.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4 animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-foreground">Rights Status Summary</h3>
      </div>
      
      {/* Progress bar */}
      <div className="h-2 rounded-full bg-secondary overflow-hidden mb-3">
        <div className="flex h-full">
          <div
            className="bg-success transition-all duration-500"
            style={{ width: `${(summary.signed / summary.total) * 100}%` }}
          />
          <div
            className="bg-warning transition-all duration-500"
            style={{ width: `${(summary.unsigned / summary.total) * 100}%` }}
          />
          <div
            className="bg-muted-foreground/30 transition-all duration-500"
            style={{ width: `${(summary.unknown / summary.total) * 100}%` }}
          />
        </div>
      </div>
      
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-success" />
            <span className="font-semibold text-foreground">{summary.signed}/{summary.total}</span>
            <span className="text-muted-foreground">signed ({summary.signedPct}%)</span>
          </div>
          {summary.unsigned > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-warning" />
              <span className="text-muted-foreground">{summary.unsigned} unsigned</span>
            </div>
          )}
          {summary.unknown > 0 && (
            <div className="flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">{summary.unknown} unknown</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {summary.topPublisher && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {summary.topPublisher}
            </Badge>
          )}
          {summary.topPro && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {summary.topPro}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
});

RightsStatusSummary.displayName = "RightsStatusSummary";
