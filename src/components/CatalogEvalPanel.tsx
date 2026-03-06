import { memo, useMemo } from "react";
import { TrendingUp, BarChart3, Shield, Star, Building2, Users, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Credit } from "./CreditsSection";

interface CatalogEvalPanelProps {
  credits: Credit[];
  streamCount?: number;
  chartPlacementsCount?: number;
  recordLabel?: string;
}

type CatalogTier = "Evergreen" | "Trending" | "Emerging" | "Legacy" | "Unknown";

function getCatalogTier(score: number, streamCount: number): CatalogTier {
  if (streamCount > 1_000_000_000) return "Evergreen";
  if (score >= 75 && streamCount > 100_000_000) return "Evergreen";
  if (score >= 60 && streamCount > 10_000_000) return "Trending";
  if (score >= 30) return "Emerging";
  if (streamCount > 500_000_000) return "Legacy";
  return "Unknown";
}

const tierConfig: Record<CatalogTier, { color: string; description: string }> = {
  Evergreen: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25", description: "Proven catalog with sustained streaming & commercial value" },
  Trending: { color: "bg-blue-500/15 text-blue-400 border-blue-500/25", description: "Strong momentum — rising streaming and chart activity" },
  Emerging: { color: "bg-amber-500/15 text-amber-400 border-amber-500/25", description: "Early-stage catalog with growth potential" },
  Legacy: { color: "bg-purple-500/15 text-purple-400 border-purple-500/25", description: "Classic catalog — high historical value" },
  Unknown: { color: "bg-muted text-muted-foreground border-border", description: "Insufficient data to evaluate" },
};

export const CatalogEvalPanel = memo(({ credits, streamCount = 0, chartPlacementsCount = 0, recordLabel }: CatalogEvalPanelProps) => {
  const evaluation = useMemo(() => {
    if (credits.length === 0) return null;

    // Scoring components
    const streamPts = Math.min(35, Math.round((streamCount / 1_000_000_000) * 35));
    const chartPts = Math.min(20, (chartPlacementsCount || 0) * 5);
    const signed = credits.filter(c => c.publisher).length;
    const signedPts = credits.length > 0 ? Math.round((signed / credits.length) * 20) : 0;
    const proCount = credits.filter(c => c.pro).length;
    const proPts = credits.length > 0 ? Math.round((proCount / credits.length) * 15) : 0;
    const pubCount = new Set(credits.filter(c => c.publisher).map(c => c.publisher)).size;
    const dealPts = pubCount <= 1 ? 10 : pubCount <= 2 ? 7 : pubCount <= 3 ? 4 : 0;

    const score = Math.min(100, streamPts + chartPts + signedPts + proPts + dealPts);
    const tier = getCatalogTier(score, streamCount);

    // Admin type detection
    const publishers = [...new Set(credits.filter(c => c.publisher).map(c => c.publisher!))];
    const majorPubs = ["Sony", "Universal", "Warner", "BMG", "Kobalt", "Downtown"];
    const hasMajor = publishers.some(p => majorPubs.some(m => p.toLowerCase().includes(m.toLowerCase())));
    const adminType = publishers.length === 0 ? "Self-Published / Unregistered" : hasMajor ? "Major Publisher" : "Independent Publisher";

    return {
      score, tier, streamPts, chartPts, signedPts, proPts, dealPts,
      publisherCount: pubCount, adminType, publishers,
      signedRatio: credits.length > 0 ? `${signed}/${credits.length}` : "0/0",
      dealPotential: score >= 60 ? "High" : score >= 40 ? "Moderate" : "Low",
    };
  }, [credits, streamCount, chartPlacementsCount]);

  if (!evaluation) return null;

  const tierInfo = tierConfig[evaluation.tier];

  const breakdown = [
    { label: "Streaming Performance", pts: evaluation.streamPts, max: 35, icon: TrendingUp },
    { label: "Chart Placements", pts: evaluation.chartPts, max: 20, icon: BarChart3 },
    { label: "Publisher Coverage", pts: evaluation.signedPts, max: 20, icon: Building2 },
    { label: "PRO Registration", pts: evaluation.proPts, max: 15, icon: Globe },
    { label: "Deal Simplicity", pts: evaluation.dealPts, max: 10, icon: Users },
  ];

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="border-l-4 border-primary pl-4">
        <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <Star className="w-5 h-5 text-primary" />
          Catalog Evaluation
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Estimated catalog value, tier classification, and deal potential
        </p>
      </div>

      <div className="glass rounded-xl p-5 space-y-4">
        {/* Score & Tier */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-xl font-bold text-primary">{evaluation.score}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Catalog Score</p>
              <Badge variant="outline" className={`text-xs ${tierInfo.color}`}>
                {evaluation.tier}
              </Badge>
            </div>
          </div>
          <Badge variant="outline" className={`text-xs ${
            evaluation.dealPotential === "High" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
            evaluation.dealPotential === "Moderate" ? "bg-amber-500/15 text-amber-400 border-amber-500/25" :
            "bg-muted text-muted-foreground border-border"
          }`}>
            Deal Potential: {evaluation.dealPotential}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">{tierInfo.description}</p>

        {/* Breakdown */}
        <div className="space-y-2.5">
          {breakdown.map(item => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <item.icon className="w-3 h-3" />
                  {item.label}
                </span>
                <span className="text-foreground font-medium">{item.pts}/{item.max}</span>
              </div>
              <Progress value={(item.pts / item.max) * 100} className="h-1.5" />
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
          <div>
            <p className="text-xs text-muted-foreground">Admin Type</p>
            <p className="text-sm font-medium text-foreground">{evaluation.adminType}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Publisher Coverage</p>
            <p className="text-sm font-medium text-foreground">{evaluation.signedRatio} credited</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Unique Publishers</p>
            <p className="text-sm font-medium text-foreground">{evaluation.publisherCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Label</p>
            <p className="text-sm font-medium text-foreground">{recordLabel || "Independent"}</p>
          </div>
        </div>
      </div>
    </div>
  );
});

CatalogEvalPanel.displayName = "CatalogEvalPanel";
