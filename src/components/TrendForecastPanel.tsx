import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, Zap, Globe, BarChart3, Activity, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getTrendingMetrics, getTrendPredictions, fetchTrendForecast } from "@/lib/api/phase1Engines";
import { cn } from "@/lib/utils";

interface TrendingBadgeProps { personId: string; personName: string; compact?: boolean; }

export function TrendingBadge({ personId, personName, compact = false }: TrendingBadgeProps) {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    if (!personId) return;
    getTrendingMetrics(personId).then(data => { if (data.length > 0) setMetrics(data[0]); }).catch(() => {});
  }, [personId]);

  if (!metrics || metrics.breakout_probability < 0.2) return null;
  const isHot = metrics.breakout_probability > 0.6;
  const isTrending = metrics.stream_velocity > 50;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 gap-0.5",
              isHot ? "border-orange-500/50 text-orange-400 bg-orange-500/10" :
              isTrending ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" :
              "border-blue-500/50 text-blue-400 bg-blue-500/10")}>
              {isHot ? <Zap className="w-2.5 h-2.5" /> : <TrendingUp className="w-2.5 h-2.5" />}
              {isHot ? "Hot" : "Trending"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-52">
            <p className="font-medium">{metrics.stream_velocity > 0 ? "+" : ""}{metrics.stream_velocity?.toFixed(0)}% velocity</p>
            <p className="text-muted-foreground">{(metrics.breakout_probability * 100).toFixed(0)}% breakout probability</p>
            {metrics.trending_regions?.length > 0 && (
              <p className="text-muted-foreground">Trending in {metrics.trending_regions.join(", ")}</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Badge variant="outline" className={cn("gap-1",
      isHot ? "border-orange-500/50 text-orange-400 bg-orange-500/10" :
      isTrending ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" :
      "border-blue-500/50 text-blue-400 bg-blue-500/10")}>
      {isHot ? <Zap className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {isHot ? "Hot" : "Trending"} · {metrics.stream_velocity > 0 ? "+" : ""}{metrics.stream_velocity?.toFixed(0)}%
    </Badge>
  );
}

// Sparkline velocity chart
interface VelocitySparklineProps { personId: string; }

export function VelocitySparkline({ personId }: VelocitySparklineProps) {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    if (!personId) return;
    getTrendingMetrics(personId).then(setData).catch(() => {});
  }, [personId]);

  if (data.length < 2) return null;
  const velocities = data.slice(0, 14).reverse().map(d => d.stream_velocity || 0);
  const max = Math.max(...velocities, 1);
  const min = Math.min(...velocities, 0);
  const range = max - min || 1;
  const width = 80, height = 24;
  const points = velocities.map((v, i) => {
    const x = (i / (velocities.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none"
        stroke={velocities[velocities.length - 1] > velocities[0] ? "hsl(var(--primary))" : "hsl(0 70% 55%)"}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Breakout Alert Banner
interface BreakoutAlertProps { personId: string; personName: string; }

export function BreakoutAlert({ personId, personName }: BreakoutAlertProps) {
  const [prediction, setPrediction] = useState<any>(null);

  useEffect(() => {
    if (!personId) return;
    getTrendPredictions(personId).then(preds => {
      const breakout = preds.find((p: any) => p.confidence_score > 0.5 && !p.realized);
      if (breakout) setPrediction(breakout);
    }).catch(() => {});
  }, [personId]);

  if (!prediction) return null;
  const est = prediction.predicted_value?.estimated_streams;
  const fmt = est ? (est >= 1e6 ? `${(est / 1e6).toFixed(1)}M` : est >= 1e3 ? `${(est / 1e3).toFixed(0)}K` : est.toString()) : null;

  return (
    <Card className="border-orange-500/30 bg-orange-500/5">
      <CardContent className="p-3 flex items-center gap-3">
        <Zap className="w-5 h-5 text-orange-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-orange-300">
            ⚡ {personName} is trending to hit {fmt || "breakout"} streams
            {prediction.predicted_date && ` by ${new Date(prediction.predicted_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{prediction.reasoning}</p>
        </div>
        <Badge variant="outline" className="border-orange-500/30 text-orange-400 shrink-0">
          {(prediction.confidence_score * 100).toFixed(0)}% confidence
        </Badge>
      </CardContent>
    </Card>
  );
}

// ---- Regional Heatmap ----
// Simplified world map regions with SVG paths
const REGION_PATHS: Record<string, { path: string; cx: number; cy: number; label: string }> = {
  north_america: { path: "M50,30 L130,30 L140,55 L135,80 L110,95 L85,90 L60,75 L45,55 Z", cx: 90, cy: 60, label: "N. America" },
  latin_america: { path: "M85,95 L110,95 L120,120 L115,155 L105,170 L90,165 L80,140 L75,115 Z", cx: 95, cy: 135, label: "L. America" },
  europe: { path: "M185,25 L235,20 L245,35 L240,55 L225,60 L210,55 L195,55 L185,40 Z", cx: 215, cy: 40, label: "Europe" },
  africa: { path: "M195,65 L230,60 L240,75 L235,110 L225,130 L210,135 L195,120 L185,95 Z", cx: 215, cy: 95, label: "Africa" },
  asia: { path: "M250,20 L320,25 L340,45 L335,70 L310,80 L285,75 L265,65 L245,50 L245,35 Z", cx: 290, cy: 50, label: "Asia" },
  oceania: { path: "M300,120 L340,115 L350,130 L345,145 L330,150 L310,145 L300,135 Z", cx: 325, cy: 132, label: "Oceania" },
};

// Map country codes to regions
const COUNTRY_TO_REGION: Record<string, string> = {
  US: "north_america", CA: "north_america", MX: "latin_america",
  BR: "latin_america", AR: "latin_america", CO: "latin_america", CL: "latin_america",
  GB: "europe", DE: "europe", FR: "europe", ES: "europe", IT: "europe", NL: "europe", SE: "europe", PL: "europe", PT: "europe",
  IN: "asia", JP: "asia", KR: "asia", CN: "asia", ID: "asia", PH: "asia", TH: "asia", VN: "asia", MY: "asia", SG: "asia", PK: "asia",
  NG: "africa", ZA: "africa", KE: "africa", EG: "africa", GH: "africa",
  AU: "oceania", NZ: "oceania",
};

function getGrowthColor(growth: number): string {
  if (growth >= 3.0) return "hsl(0 85% 55%)";      // Hot red
  if (growth >= 2.0) return "hsl(25 90% 55%)";     // Orange
  if (growth >= 1.0) return "hsl(45 90% 55%)";     // Yellow
  if (growth >= 0.5) return "hsl(142 60% 45%)";    // Green
  if (growth > 0) return "hsl(200 60% 45%)";       // Blue
  return "hsl(var(--muted))";                        // Neutral
}

function getGrowthOpacity(growth: number): number {
  if (growth >= 3.0) return 0.9;
  if (growth >= 2.0) return 0.7;
  if (growth >= 1.0) return 0.55;
  if (growth >= 0.5) return 0.4;
  if (growth > 0) return 0.3;
  return 0.15;
}

interface RegionalHeatmapProps {
  regionalGrowth: Record<string, number>;
  trendingRegions: string[];
}

function RegionalHeatmap({ regionalGrowth, trendingRegions }: RegionalHeatmapProps) {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  // Normalize country codes to region keys
  const normalizedGrowth: Record<string, number> = {};
  for (const [key, value] of Object.entries(regionalGrowth)) {
    const regionKey = COUNTRY_TO_REGION[key] || key;
    normalizedGrowth[regionKey] = Math.max(normalizedGrowth[regionKey] || 0, value);
  }

  return (
    <div className="relative">
      <svg viewBox="0 0 380 180" className="w-full h-auto" style={{ maxHeight: 160 }}>
        {/* Background */}
        <rect x="0" y="0" width="380" height="180" fill="transparent" />

        {/* Region paths */}
        {Object.entries(REGION_PATHS).map(([regionId, region]) => {
          const growth = normalizedGrowth[regionId] || 0;
          const isTrending = trendingRegions.includes(regionId);
          const isHovered = hoveredRegion === regionId;

          return (
            <g key={regionId}
              onMouseEnter={() => setHoveredRegion(regionId)}
              onMouseLeave={() => setHoveredRegion(null)}
              className="cursor-pointer transition-all"
            >
              <path
                d={region.path}
                fill={getGrowthColor(growth)}
                fillOpacity={isHovered ? Math.min(getGrowthOpacity(growth) + 0.2, 1) : getGrowthOpacity(growth)}
                stroke={isTrending ? "hsl(var(--primary))" : "hsl(var(--border))"}
                strokeWidth={isTrending ? 1.5 : 0.5}
                strokeOpacity={0.6}
              />
              {/* Region label */}
              <text
                x={region.cx}
                y={region.cy}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-foreground"
                fontSize="7"
                fontWeight={growth > 0 ? "600" : "400"}
                opacity={growth > 0 ? 0.9 : 0.4}
              >
                {region.label}
              </text>
              {/* Growth value */}
              {growth > 0 && (
                <text
                  x={region.cx}
                  y={region.cy + 10}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="6"
                  fontWeight="700"
                  fill={getGrowthColor(growth)}
                >
                  +{(growth * 100).toFixed(0)}%
                </text>
              )}
              {/* Trending pulse */}
              {isTrending && (
                <circle
                  cx={region.cx + 18}
                  cy={region.cy - 8}
                  r="3"
                  fill="hsl(var(--primary))"
                  opacity="0.8"
                >
                  <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0.3;0.8" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredRegion && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-2 py-1 text-[10px] shadow-lg z-10">
          <span className="font-medium">{REGION_PATHS[hoveredRegion]?.label}</span>
          <span className="text-muted-foreground ml-1.5">
            {normalizedGrowth[hoveredRegion]
              ? `+${(normalizedGrowth[hoveredRegion] * 100).toFixed(0)}% growth`
              : "No data"}
          </span>
          {trendingRegions.includes(hoveredRegion) && (
            <Badge variant="outline" className="ml-1.5 text-[8px] px-1 py-0 border-primary/30 text-primary">
              Trending
            </Badge>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-1">
        {[
          { label: "Low", color: "hsl(200 60% 45%)" },
          { label: "Med", color: "hsl(45 90% 55%)" },
          { label: "High", color: "hsl(25 90% 55%)" },
          { label: "Hot", color: "hsl(0 85% 55%)" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: l.color, opacity: 0.7 }} />
            <span className="text-[9px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Trend Forecast Panel
interface TrendForecastPanelProps { personId: string; personName: string; }

export function TrendForecastPanel({ personId, personName }: TrendForecastPanelProps) {
  const [forecast, setForecast] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runForecast = async () => {
    setLoading(true);
    try {
      const result = await fetchTrendForecast(personId, personName);
      setForecast(result.forecast);
      setMetrics(result.metrics);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    if (!personId) return;
    getTrendingMetrics(personId).then(data => { if (data.length > 0) setMetrics(data[0]); }).catch(() => {});
  }, [personId]);

  const formatNumber = (n: number) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toString();
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Trend Forecast
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={runForecast} disabled={loading} className="h-7 text-xs">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Run Forecast"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {metrics && (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 rounded bg-muted/30">
              <p className="text-xs text-muted-foreground">Velocity</p>
              <p className={cn("text-sm font-mono font-bold", metrics.stream_velocity > 0 ? "text-emerald-400" : "text-red-400")}>
                {metrics.stream_velocity > 0 ? "+" : ""}{(metrics.stream_velocity || 0).toFixed(1)}%
              </p>
            </div>
            <div className="text-center p-2 rounded bg-muted/30">
              <p className="text-xs text-muted-foreground">Breakout</p>
              <p className="text-sm font-mono font-bold text-orange-400">
                {((metrics.breakout_probability || 0) * 100).toFixed(0)}%
              </p>
            </div>
            <div className="text-center p-2 rounded bg-muted/30">
              <p className="text-xs text-muted-foreground">Regions</p>
              <p className="text-sm font-mono font-bold text-blue-400">
                {(metrics.trending_regions || []).length || "—"}
              </p>
            </div>
          </div>
        )}

        {/* Regional Heatmap */}
        {metrics && (metrics.regional_growth && Object.keys(metrics.regional_growth).length > 0 || (metrics.trending_regions || []).length > 0) && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
              <Globe className="w-3 h-3" /> Regional Growth
            </p>
            <RegionalHeatmap
              regionalGrowth={metrics.regional_growth || {}}
              trendingRegions={metrics.trending_regions || []}
            />
          </div>
        )}

        {forecast && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Projected Streams</p>
            {[
              { label: "30d", data: forecast.day_30 },
              { label: "60d", data: forecast.day_60 },
              { label: "90d", data: forecast.day_90 },
            ].map(({ label, data }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground w-8">{label}</span>
                <div className="flex-1 mx-2 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                  <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.min(data.confidence * 100, 100)}%` }} />
                </div>
                <span className="font-mono text-foreground w-16 text-right">{formatNumber(data.streams)}</span>
                <span className="text-muted-foreground w-12 text-right">{(data.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}

        {metrics?.trending_regions?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Trending Regions</p>
            <div className="flex flex-wrap gap-1">
              {metrics.trending_regions.map((r: string) => (
                <Badge key={r} variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                  <Globe className="w-2.5 h-2.5 mr-0.5" />
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
