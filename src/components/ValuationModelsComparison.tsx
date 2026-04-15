import { useMemo } from "react";
import { TrendingUp, BarChart3, Shield, Zap, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Song {
  title: string;
  artist?: string;
  spotify_streams?: number;
  youtube_views?: number;
  ownership_percent?: number;
  genre?: string;
  country?: string;
  release_year?: number;
}

interface ValuationModelsComparisonProps {
  songs: Song[];
  valuationResult: any;
  annualRevenue: number;
  region: string;
  growthRate: number;
  discountRate: number;
  multiple: number;
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function calculateRiskAdjustedNPV(
  annualRevenue: number,
  songs: Song[],
  growthRate: number,
  discountRate: number
): { pessimistic: number; realistic: number; optimistic: number; probabilities: { p: number; r: number; o: number } } {
  const avgAge = songs.reduce((s, t) => {
    const year = t.release_year || new Date().getFullYear();
    return s + (new Date().getFullYear() - year);
  }, 0) / (songs.length || 1);

  const genres = new Set(songs.map(s => s.genre).filter(Boolean));
  const genreSaturation = genres.size < 2 ? 0.9 : genres.size < 4 ? 1.0 : 1.05;
  const careerRisk = avgAge > 10 ? 0.85 : avgAge > 5 ? 0.95 : 1.05;
  const catalogAgeRisk = avgAge > 15 ? 0.80 : avgAge > 8 ? 0.90 : 1.0;

  const scenarios = {
    pessimistic: { growth: growthRate * 0.3, riskMult: careerRisk * catalogAgeRisk * 0.8 },
    realistic: { growth: growthRate * 0.7, riskMult: careerRisk * genreSaturation },
    optimistic: { growth: growthRate * 1.3, riskMult: careerRisk * genreSaturation * 1.15 },
  };

  const npv = (growth: number, riskMult: number) => {
    let pv = 0;
    for (let y = 1; y <= 10; y++) {
      const cashFlow = annualRevenue * Math.pow(1 + growth / 100, y) * riskMult;
      pv += cashFlow / Math.pow(1 + discountRate / 100, y);
    }
    return pv;
  };

  return {
    pessimistic: npv(scenarios.pessimistic.growth, scenarios.pessimistic.riskMult),
    realistic: npv(scenarios.realistic.growth, scenarios.realistic.riskMult),
    optimistic: npv(scenarios.optimistic.growth, scenarios.optimistic.riskMult),
    probabilities: { p: 20, r: 60, o: 20 },
  };
}

export function ValuationModelsComparison({
  songs, valuationResult, annualRevenue, region, growthRate, discountRate, multiple,
}: ValuationModelsComparisonProps) {
  const dcfValue = valuationResult?.valuation?.total_value || 0;
  const marketMultipleValue = annualRevenue * multiple;
  const riskNPV = useMemo(
    () => calculateRiskAdjustedNPV(annualRevenue, songs, growthRate, discountRate),
    [annualRevenue, songs, growthRate, discountRate]
  );

  const models = [
    {
      id: "dcf",
      name: "DCF (Income)",
      icon: TrendingUp,
      value: dcfValue,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10 border-emerald-500/20",
      description: "Present value of projected future cash flows",
      tooltip: "Discounted Cash Flow estimates your catalog's worth by projecting future royalty income and discounting it back to today's value using a risk-adjusted rate. Higher discount rates = more conservative valuation.",
    },
    {
      id: "market",
      name: "Market Comp",
      icon: BarChart3,
      value: marketMultipleValue,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10 border-blue-500/20",
      description: `Based on ${multiple}x revenue multiple`,
      tooltip: "Market Comparable values your catalog by applying an industry revenue multiple (e.g. 15x annual earnings) based on recent catalog sale transactions. The multiple varies by genre, age, and market conditions.",
    },
    {
      id: "npv",
      name: "Risk-Adjusted NPV",
      icon: Shield,
      value: riskNPV.realistic,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10 border-purple-500/20",
      description: "Risk-weighted 10-year net present value",
      tooltip: "Risk-Adjusted NPV runs three scenarios (pessimistic, realistic, optimistic) weighted by probability. It factors in concentration risk, catalog age, and market volatility to give a balanced 10-year outlook.",
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-foreground">Valuation Models</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3 h-3 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs">
              Three different methods to estimate your catalog&apos;s value. Each model uses different assumptions and data points.
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {models.map((m) => (
            <Card key={m.id} className={cn("border", m.bgColor)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <m.icon className={cn("w-3.5 h-3.5", m.color)} />
                    <span className="text-[10px] font-medium text-foreground">{m.name}</span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-xs">
                      {m.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className={cn("text-lg font-bold font-mono", m.color)}>
                  {formatCurrency(m.value)}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{m.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-card/30 border-border/30">
          <CardContent className="p-3">
            <p className="text-[10px] font-medium text-muted-foreground mb-2">NPV Scenarios</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[9px] text-muted-foreground">Pessimistic</p>
                <p className="text-xs font-bold font-mono text-red-400">{formatCurrency(riskNPV.pessimistic)}</p>
                <Badge variant="outline" className="text-[8px] px-1 py-0 mt-0.5">{riskNPV.probabilities.p}%</Badge>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">Realistic</p>
                <p className="text-xs font-bold font-mono text-emerald-400">{formatCurrency(riskNPV.realistic)}</p>
                <Badge variant="outline" className="text-[8px] px-1 py-0 mt-0.5">{riskNPV.probabilities.r}%</Badge>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">Optimistic</p>
                <p className="text-xs font-bold font-mono text-blue-400">{formatCurrency(riskNPV.optimistic)}</p>
                <Badge variant="outline" className="text-[8px] px-1 py-0 mt-0.5">{riskNPV.probabilities.o}%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
