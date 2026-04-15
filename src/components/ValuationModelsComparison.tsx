import { useState, useMemo } from "react";
import { DollarSign, TrendingUp, BarChart3, Shield, Music, Zap, Info } from "lucide-react";
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
  is_explicit?: boolean;
  tempo?: number;
  sync_placements?: number;
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

function calculateSyncScore(songs: Song[]): { score: number; factors: string[] } {
  if (songs.length === 0) return { score: 0, factors: [] };
  const factors: string[] = [];
  let score = 50; // Baseline

  // Genre fit for sync
  const syncFriendlyGenres = ["pop", "electronic", "rock", "r&b", "country", "indie"];
  const genres = songs.map(s => (s.genre || "").toLowerCase());
  const syncGenreCount = genres.filter(g => syncFriendlyGenres.some(sg => g.includes(sg))).length;
  const syncGenrePct = syncGenreCount / songs.length;
  score += syncGenrePct * 15;
  if (syncGenrePct > 0.5) factors.push("Sync-friendly genres");

  // Explicit content penalty
  const explicitCount = songs.filter(s => s.is_explicit).length;
  const explicitPct = explicitCount / songs.length;
  score -= explicitPct * 15;
  if (explicitPct > 0.3) factors.push("Explicit content reduces sync potential");

  // Tempo suitability (mid-tempo 90-130 BPM ideal for advertising)
  const tempoSongs = songs.filter(s => s.tempo);
  if (tempoSongs.length > 0) {
    const avgTempo = tempoSongs.reduce((s, t) => s + (t.tempo || 0), 0) / tempoSongs.length;
    if (avgTempo >= 90 && avgTempo <= 130) {
      score += 10;
      factors.push("Ideal tempo range for advertising");
    }
  }

  // Existing sync placements bonus
  const syncPlacements = songs.reduce((s, t) => s + (t.sync_placements || 0), 0);
  if (syncPlacements > 0) {
    score += Math.min(15, syncPlacements * 3);
    factors.push(`${syncPlacements} existing sync placements`);
  }

  // Catalog diversity bonus
  const uniqueGenres = new Set(genres.filter(Boolean));
  if (uniqueGenres.size >= 3) {
    score += 5;
    factors.push("Genre diversity appeals to multiple licensors");
  }

  return { score: Math.round(Math.max(0, Math.min(100, score))), factors };
}

function calculateRiskAdjustedNPV(
  annualRevenue: number,
  songs: Song[],
  growthRate: number,
  discountRate: number
): { pessimistic: number; realistic: number; optimistic: number; probabilities: { p: number; r: number; o: number } } {
  // Risk factors
  const avgAge = songs.reduce((s, t) => {
    const year = t.release_year || new Date().getFullYear();
    return s + (new Date().getFullYear() - year);
  }, 0) / (songs.length || 1);

  const genres = new Set(songs.map(s => s.genre).filter(Boolean));
  const genreSaturation = genres.size < 2 ? 0.9 : genres.size < 4 ? 1.0 : 1.05;

  // Career trajectory risk
  const careerRisk = avgAge > 10 ? 0.85 : avgAge > 5 ? 0.95 : 1.05;

  // Catalog age risk
  const catalogAgeRisk = avgAge > 15 ? 0.80 : avgAge > 8 ? 0.90 : 1.0;

  // Calculate NPV for each scenario
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
  const syncScore = useMemo(() => calculateSyncScore(songs), [songs]);
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
    },
    {
      id: "market",
      name: "Market Comp",
      icon: BarChart3,
      value: marketMultipleValue,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10 border-blue-500/20",
      description: `Based on ${multiple}x revenue multiple`,
    },
    {
      id: "npv",
      name: "Risk-Adjusted NPV",
      icon: Shield,
      value: riskNPV.realistic,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10 border-purple-500/20",
      description: "Risk-weighted 10-year net present value",
    },
    {
      id: "sync",
      name: "Sync Score",
      icon: Music,
      value: syncScore.score,
      color: syncScore.score >= 70 ? "text-emerald-400" : syncScore.score >= 50 ? "text-amber-400" : "text-red-400",
      bgColor: syncScore.score >= 70 ? "bg-emerald-500/10 border-emerald-500/20" : syncScore.score >= 50 ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20",
      description: syncScore.score >= 70 ? "High potential for TV/film licensing" : syncScore.score >= 50 ? "Moderate sync licensing potential" : "Limited sync licensing fit",
      isScore: true,
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
              Four different methods to estimate your catalog's value. Each model uses different assumptions and data points.
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 4-model comparison grid */}
        <div className="grid grid-cols-2 gap-2">
          {models.map((m) => (
            <Card key={m.id} className={cn("border", m.bgColor)}>
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <m.icon className={cn("w-3.5 h-3.5", m.color)} />
                  <span className="text-[10px] font-medium text-foreground">{m.name}</span>
                </div>
                <p className={cn("text-lg font-bold font-mono", m.color)}>
                  {m.isScore ? `${m.value}/100` : formatCurrency(m.value)}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{m.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Risk-Adjusted NPV Scenarios */}
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

        {/* Sync Score Details */}
        {syncScore.factors.length > 0 && (
          <Card className="bg-card/30 border-border/30">
            <CardContent className="p-3">
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5">
                Sync Score: {syncScore.score}/100 — {syncScore.score >= 70 ? "High" : syncScore.score >= 50 ? "Moderate" : "Low"} potential for advertising & TV placement
              </p>
              <div className="flex flex-wrap gap-1">
                {syncScore.factors.map((f, i) => (
                  <Badge key={i} variant="outline" className="text-[8px] px-1.5 py-0">{f}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
