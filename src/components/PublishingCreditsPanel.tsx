import { memo, useMemo } from "react";
import { FileText, Building2, Globe, PieChart, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Credit } from "./CreditsSection";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { GapsMessage } from "@/components/ui/gaps-message";
import { calculatePublishingConfidence, detectPublishingGaps } from "@/lib/confidence";


interface PublishingCreditsPanelProps {
  credits: Credit[];
  recordLabel?: string;
  isLoadingShares?: boolean;
}

export const PublishingCreditsPanel = memo(({ credits, recordLabel, isLoadingShares }: PublishingCreditsPanelProps) => {
  const writers = useMemo(() => credits.filter(c => c.role === "writer"), [credits]);
  const hasShares = writers.some(c => c.publishingShare);

  const confidence = useMemo(() => calculatePublishingConfidence(credits), [credits]);
  const gaps = useMemo(() => detectPublishingGaps(credits), [credits]);

  if (writers.length === 0) return null;

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="border-l-4 border-primary pl-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Publishing Credits & Splits
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Writer publishing affiliations and ownership percentages
            </p>
          </div>
          <ConfidenceBadge confidence={confidence} />
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left p-3 text-xs text-muted-foreground font-medium">Writer</th>
                <th className="text-left p-3 text-xs text-muted-foreground font-medium">Publisher / Admin</th>
                <th className="text-left p-3 text-xs text-muted-foreground font-medium">Signing Status</th>
                <th className="text-left p-3 text-xs text-muted-foreground font-medium">PRO</th>
                {hasShares && <th className="text-right p-3 text-xs text-muted-foreground font-medium">Split %</th>}
              </tr>
            </thead>
            <tbody>
              {writers.map((w, i) => (
                <tr key={`${w.name}-${i}`} className="border-b border-border/50 hover:bg-accent/30">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{w.name}</span>
                      {w.ipi && (
                        <span className="text-[10px] font-mono text-muted-foreground">IPI: {w.ipi}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {w.publisher ? (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 text-primary" />
                        <span className="text-foreground">{w.publisher}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic text-xs">Unknown</span>
                    )}
                  </td>
                  <td className="p-3">
                    {w.publisher ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/25">Pub: Signed</Badge>
                    ) : w.pro ? (
                      <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/25">Pub: Unknown</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-400 border-red-500/25">Pub: Unsigned</Badge>
                    )}
                  <td className="p-3">
                    {w.pro ? (
                      <Badge variant="outline" className="text-xs">{w.pro}</Badge>
                    ) : (
                      <span className="text-muted-foreground italic text-xs">—</span>
                    )}
                  </td>
                  {hasShares && (
                    <td className="p-3 text-right">
                      {w.publishingShare ? (
                        <Badge variant="outline" className="text-xs bg-violet-500/15 text-violet-400 border-violet-500/25">
                          <PieChart className="w-3 h-3 mr-1" />
                          {w.publishingShare}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Master & Label info */}
        <div className="border-t border-border/50 p-3 flex flex-wrap gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Record Label: </span>
            <span className="text-foreground font-medium">{recordLabel || "Unknown"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Master Rights: </span>
            <span className="text-foreground font-medium">{recordLabel || "Unknown"}</span>
          </div>
        </div>

        {isLoadingShares && (
          <div className="p-3 border-t border-border/50 text-xs text-primary flex items-center gap-1.5">
            <div className="w-3 h-3 border border-primary/50 border-t-primary rounded-full animate-spin" />
            Looking up publishing splits...
          </div>
        )}
      </div>
      {/* Gaps and next steps */}
      <GapsMessage gaps={gaps} />
    </div>
  );
});

PublishingCreditsPanel.displayName = "PublishingCreditsPanel";
