import { useMemo, useState } from "react";
import { TrendingUp, BarChart3, Shield, Zap, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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

function calculateDCF(annualRevenue: number, growthRate: number, discountRate: number, years: number) {
  let pv = 0;
  for (let y = 1; y <= years; y++) {
    const cf = annualRevenue * Math.pow(1 + growthRate / 100, y);
    pv += cf / Math.pow(1 + discountRate / 100, y);
  }
  return pv;
}

function calculateRiskAdjustedNPV(
  annualRevenue: number,
  songs: Song[],
  growth: number,
  discount: number,
) {
  const songCount = songs.length || 1;
  const concentrationRisk = songCount < 5 ? 0.85 : songCount < 10 ? 0.92 : 0.97;
  const scenarios = {
    pessimistic: { growth: growth - 5, riskMult: concentrationRisk * 0.8 },
    realistic: { growth, riskMult: concentrationRisk },
    optimistic: { growth: growth + 3, riskMult: Math.min(1, concentrationRisk * 1.1) },
  };

  const npv = (g: number, riskMult: number) => {
    let pv = 0;
    for (let y = 1; y <= 10; y++) {
      const cashFlow = annualRevenue * Math.pow(1 + g / 100, y) * riskMult;
      pv += cashFlow / Math.pow(1 + discount / 100, y);
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
  // Per-model overrides
  const [dcfGrowth, setDcfGrowth] = useState(growthRate);
  const [dcfDiscount, setDcfDiscount] = useState(discountRate);
  const [marketMult, setMarketMult] = useState(multiple);
  const [npvGrowth, setNpvGrowth] = useState(growthRate);
  const [npvDiscount, setNpvDiscount] = useState(discountRate);

  // Expanded state per card
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  // Recalculate with per-model params
  const dcfValue = useMemo(
    () => calculateDCF(annualRevenue, dcfGrowth, dcfDiscount, 10),
    [annualRevenue, dcfGrowth, dcfDiscount]
  );
  const marketMultipleValue = annualRevenue * marketMult;
  const riskNPV = useMemo(
    () => calculateRiskAdjustedNPV(annualRevenue, songs, npvGrowth, npvDiscount),
    [annualRevenue, songs, npvGrowth, npvDiscount]
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
      tooltip: "Discounted Cash Flow estimates your catalog's worth by projecting future royalty income and discounting it back to today's value using a risk-adjusted rate.",
      sliders: [
        { label: "Growth", value: dcfGrowth, set: setDcfGrowth, min: -10, max: 50, suffix: "%" },
        { label: "Discount", value: dcfDiscount, set: setDcfDiscount, min: 5, max: 30, suffix: "%" },
      ],
    },
    {
      id: "market",
      name: "Market Comp",
      icon: BarChart3,
      value: marketMultipleValue,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10 border-blue-500/20",
      description: `Based on ${marketMult}x revenue multiple`,
      tooltip: "Market Comparable values your catalog by applying an industry revenue multiple based on recent catalog sale transactions.",
      sliders: [
        { label: "Multiple", value: marketMult, set: setMarketMult, min: 4, max: 40, suffix: "x" },
      ],
    },
    {
      id: "npv",
      name: "Risk-Adjusted NPV",
      icon: Shield,
      value: riskNPV.realistic,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10 border-purple-500/20",
      description: "Risk-weighted 10-year net present value",
      tooltip: "Risk-Adjusted NPV runs three scenarios weighted by probability, factoring in concentration risk and market volatility.",
      sliders: [
        { label: "Growth", value: npvGrowth, set: setNpvGrowth, min: -10, max: 50, suffix: "%" },
        { label: "Discount", value: npvDiscount, set: setNpvDiscount, min: 5, max: 30, suffix: "%" },
      ],
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
              Three different methods to estimate your catalog&apos;s value. Click each card to adjust its parameters independently.
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {models.map((m) => (
            <Card key={m.id} className={cn("border transition-all", m.bgColor)}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <m.icon className={cn("w-3.5 h-3.5", m.color)} />
                    <span className="text-[10px] font-medium text-foreground">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px] text-xs">
                        {m.tooltip}
                      </TooltipContent>
                    </Tooltip>
                    <button onClick={() => toggle(m.id)} className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
                      {expanded[m.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <p className={cn("text-lg font-bold font-mono", m.color)}>
                  {formatCurrency(m.value)}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{m.description}</p>

                {/* Per-model sliders */}
                {expanded[m.id] && (
                  <div className="mt-3 space-y-2.5 pt-2.5 border-t border-border/30">
                    {m.sliders.map((s) => (
                      <div key={s.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-muted-foreground">{s.label}</span>
                          <span className="text-[9px] font-mono text-foreground">{s.value}{s.suffix}</span>
                        </div>
                        <Slider
                          value={[s.value]}
                          onValueChange={([v]) => s.set(v)}
                          min={s.min}
                          max={s.max}
                          step={1}
                          className="h-4"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-card/30 border-border/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <p className="text-[10px] font-medium text-muted-foreground">NPV Scenarios</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-xs">
                  Three probability-weighted outcomes (pessimistic, realistic, optimistic) showing the range of possible catalog values based on different growth assumptions and risk factors.
                </TooltipContent>
              </Tooltip>
            </div>
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
