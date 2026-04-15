import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, Zap, Globe, BarChart3, Activity, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getTrendingMetrics, getTrendPredictions, fetchTrendForecast } from "@/lib/api/phase1Engines";
import { cn } from "@/lib/utils";

interface TrendingBadgeProps {
  personId: string;
  personName: string;
  compact?: boolean;
}

export function TrendingBadge({ personId, personName, compact = false }: TrendingBadgeProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!personId) return;
    getTrendingMetrics(personId).then(data => {
      if (data.length > 0) setMetrics(data[0]);
    }).catch(() => {});
  }, [personId]);

  if (!metrics || metrics.breakout_probability < 0.2) return null;

  const isHot = metrics.breakout_probability > 0.6;
  const isTrending = metrics.stream_velocity > 50;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className={cn(
              "text-[10px] px-1.5 py-0 gap-0.5",
              isHot ? "border-orange-500/50 text-orange-400 bg-orange-500/10" :
              isTrending ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" :
              "border-blue-500/50 text-blue-400 bg-blue-500/10"
            )}>
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
    <Badge variant="outline" className={cn(
      "gap-1",
      isHot ? "border-orange-500/50 text-orange-400 bg-orange-500/10" :
      isTrending ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10" :
      "border-blue-500/50 text-blue-400 bg-blue-500/10"
    )}>
      {isHot ? <Zap className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {isHot ? "Hot" : "Trending"} · {metrics.stream_velocity > 0 ? "+" : ""}{metrics.stream_velocity?.toFixed(0)}%
    </Badge>
  );
}

// Sparkline velocity chart
interface VelocitySparklineProps {
  personId: string;
}

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

  const width = 80;
  const height = 24;
  const points = velocities.map((v, i) => {
    const x = (i / (velocities.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  const isPositive = velocities[velocities.length - 1] > velocities[0];

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? "hsl(var(--primary))" : "hsl(0 70% 55%)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Breakout Alert Banner
interface BreakoutAlertProps {
  personId: string;
  personName: string;
}

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

  const estimatedStreams = prediction.predicted_value?.estimated_streams;
  const formattedStreams = estimatedStreams
    ? estimatedStreams >= 1000000 ? `${(estimatedStreams / 1000000).toFixed(1)}M`
    : estimatedStreams >= 1000 ? `${(estimatedStreams / 1000).toFixed(0)}K`
    : estimatedStreams.toString()
    : null;

  return (
    <Card className="border-orange-500/30 bg-orange-500/5">
      <CardContent className="p-3 flex items-center gap-3">
        <Zap className="w-5 h-5 text-orange-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-orange-300">
            ⚡ {personName} is trending to hit {formattedStreams || "breakout"} streams
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

// Trend Forecast Panel
interface TrendForecastPanelProps {
  personId: string;
  personName: string;
}

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
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!personId) return;
    getTrendingMetrics(personId).then(data => {
      if (data.length > 0) setMetrics(data[0]);
    }).catch(() => {});
  }, [personId]);

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
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
                  <div
                    className="h-full bg-primary/60 rounded-full"
                    style={{ width: `${Math.min(data.confidence * 100, 100)}%` }}
                  />
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
