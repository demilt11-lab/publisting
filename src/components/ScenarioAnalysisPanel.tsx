import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Minus, BarChart3, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getRegionalRate } from "@/utils/regionalRates";

interface ScenarioAnalysisPanelProps {
  baseValue: number;
  growthRate: number;
  discountRate: number;
  multiple: number;
  songs: Array<{ spotify_streams?: number; youtube_views?: number; ownership_percent?: number; country?: string; regionOverride?: string }>;
  region?: string;
}

interface Scenario {
  name: string;
  icon: typeof TrendingUp;
  color: string;
  growthAdj: number;
  discountAdj: number;
  multipleAdj: number;
}

const scenarios: Scenario[] = [
  { name: "Bear Case", icon: TrendingDown, color: "text-red-400", growthAdj: -0.08, discountAdj: 0.03, multipleAdj: -5 },
  { name: "Base Case", icon: Minus, color: "text-foreground", growthAdj: 0, discountAdj: 0, multipleAdj: 0 },
  { name: "Bull Case", icon: TrendingUp, color: "text-emerald-400", growthAdj: 0.06, discountAdj: -0.02, multipleAdj: 4 },
];

function calculateScenarioValue(
  songs: ScenarioAnalysisPanelProps["songs"],
  growthRate: number,
  discountRate: number,
  multiple: number,
  region: string
): number {
  const spotifyRate = getRegionalRate(region, "spotify");
  const youtubeRate = getRegionalRate(region, "youtube");

  const totalAnnualRevenue = songs.reduce((sum, s) => {
    const spotifyRev = (s.spotify_streams || 0) * spotifyRate;
    const ytRev = (s.youtube_views || 0) * youtubeRate;
    const ownership = (s.ownership_percent || 100) / 100;
    return sum + (spotifyRev + ytRev) * ownership;
  }, 0);

  const projectionYears = 10;
  let dcfValue = 0;
  for (let y = 1; y <= projectionYears; y++) {
    const projectedRevenue = totalAnnualRevenue * Math.pow(1 + growthRate, y);
    dcfValue += projectedRevenue / Math.pow(1 + discountRate, y);
  }

  const marketValue = totalAnnualRevenue * multiple;
  return (dcfValue + marketValue) / 2;
}

export function ScenarioAnalysisPanel({ baseValue, growthRate, discountRate, multiple, songs, region = "Global" }: ScenarioAnalysisPanelProps) {
  const [sensitivityVar, setSensitivityVar] = useState<"growth" | "discount" | "multiple">("growth");
  const [sensitivityRange, setSensitivityRange] = useState([5]);

  const scenarioValues = useMemo(() =>
    scenarios.map(s => ({
      ...s,
      value: calculateScenarioValue(
        songs,
        growthRate / 100 + s.growthAdj,
        discountRate / 100 + s.discountAdj,
        multiple + s.multipleAdj,
        region
      ),
    })),
    [songs, growthRate, discountRate, multiple, region]
  );

  const sensitivityData = useMemo(() => {
    const steps = 5;
    const range = sensitivityRange[0];
    const results: { label: string; value: number }[] = [];

    for (let i = -steps; i <= steps; i++) {
      const pct = (i / steps) * range;
      let g = growthRate / 100, d = discountRate / 100, m = multiple;

      if (sensitivityVar === "growth") g += pct / 100;
      else if (sensitivityVar === "discount") d += pct / 100;
      else m += pct;

      results.push({
        label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}${sensitivityVar === "multiple" ? "x" : "%"}`,
        value: calculateScenarioValue(songs, g, d, m, region),
      });
    }
    return results;
  }, [songs, growthRate, discountRate, multiple, sensitivityVar, sensitivityRange, region]);

  const formatCurrency = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  const maxSensValue = Math.max(...sensitivityData.map(d => d.value));

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Scenario Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scenario Comparison */}
        <div className="grid grid-cols-3 gap-2">
          {scenarioValues.map(s => (
            <div key={s.name} className={cn("text-center p-2.5 rounded-lg border",
              s.name === "Base Case" ? "bg-primary/5 border-primary/20" : "bg-muted/10 border-border/30"
            )}>
              <s.icon className={cn("w-4 h-4 mx-auto mb-1", s.color)} />
              <p className={cn("text-xs font-bold font-mono", s.color)}>
                {formatCurrency(s.value)}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{s.name}</p>
              {s.name !== "Base Case" && baseValue > 0 && (
                <p className={cn("text-[9px] font-mono", s.color)}>
                  {s.value > baseValue ? "+" : ""}{(((s.value - baseValue) / baseValue) * 100).toFixed(1)}%
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Sensitivity Analysis */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />
              Sensitivity Analysis
            </Label>
            <div className="flex gap-1">
              {(["growth", "discount", "multiple"] as const).map(v => (
                <Badge
                  key={v}
                  variant={sensitivityVar === v ? "default" : "outline"}
                  className="text-[9px] px-1.5 py-0 cursor-pointer"
                  onClick={() => setSensitivityVar(v)}
                >
                  {v === "growth" ? "Growth" : v === "discount" ? "Discount" : "Multiple"}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[9px] text-muted-foreground">Range: ±{sensitivityRange[0]}{sensitivityVar === "multiple" ? "x" : "%"}</Label>
            <Slider value={sensitivityRange} onValueChange={setSensitivityRange} min={1} max={sensitivityVar === "multiple" ? 10 : 15} step={1} />
          </div>

          {/* Bar chart */}
          <div className="space-y-0.5">
            {sensitivityData.map((d, i) => {
              const width = maxSensValue > 0 ? (d.value / maxSensValue) * 100 : 0;
              const isBase = i === Math.floor(sensitivityData.length / 2);
              return (
                <div key={i} className="flex items-center gap-1.5 text-[9px]">
                  <span className="w-10 text-right text-muted-foreground font-mono">{d.label}</span>
                  <div className="flex-1 h-3 bg-muted/10 rounded-sm overflow-hidden">
                    <div
                      className={cn("h-full rounded-sm transition-all",
                        isBase ? "bg-primary/60" : d.value > baseValue ? "bg-emerald-500/40" : "bg-red-500/30"
                      )}
                      style={{ width: `${Math.max(width, 2)}%` }}
                    />
                  </div>
                  <span className={cn("w-14 text-right font-mono",
                    isBase ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {formatCurrency(d.value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
