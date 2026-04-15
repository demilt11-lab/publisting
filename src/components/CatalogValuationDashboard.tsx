import { useState, useMemo, useCallback, useEffect } from "react";
import { DollarSign, TrendingUp, BarChart3, AlertTriangle, Loader2, Settings, Download, Calculator, PieChart, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { runCatalogValuation, getLatestValuation, getMarketMultiples, getValuationHistory } from "@/lib/api/phase1Engines";
import { fetchCatalogComps } from "@/lib/api/integrationEngines";
import { ScenarioAnalysisPanel } from "@/components/ScenarioAnalysisPanel";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CatalogValuationDashboardProps {
  songs: Array<{
    id?: string;
    title: string;
    artist?: string;
    spotify_streams?: number;
    youtube_views?: number;
    ownership_percent?: number;
    genre?: string;
    country?: string;
  }>;
}

export function CatalogValuationDashboard({ songs }: CatalogValuationDashboardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [methodology, setMethodology] = useState("income_approach");
  const [growthRate, setGrowthRate] = useState([15]);
  const [discountRate, setDiscountRate] = useState([12]);
  const [multiple, setMultiple] = useState([18]);
  const [comparables, setComparables] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const [marketStats, setMarketStats] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    getLatestValuation(user.id).then(v => {
      if (v) setResult({
        valuation: v,
        song_valuations: v.song_valuations || [],
        confidence_interval: v.confidence_interval || {},
        risk_metrics: {},
      });
    }).catch(() => {});
    // Fetch real comparables via catalog-comps edge function
    fetchCatalogComps().then(res => {
      if (res.success) {
        setComparables(res.comparables || []);
        setMarketStats(res.market_stats || null);
      }
    }).catch(() => {
      // Fallback to market_multiples table
      getMarketMultiples().then(setComparables).catch(() => {});
    });
  }, [user]);

  const runValuation = async () => {
    if (!user || songs.length === 0) return;
    setLoading(true);
    try {
      const mapped = songs.map(s => ({
        id: s.id || s.title,
        title: s.title,
        artist: s.artist,
        spotify_streams: s.spotify_streams || 0,
        youtube_views: s.youtube_views || 0,
        ownership_percent: s.ownership_percent || 100,
        genre: s.genre,
        country: s.country,
      }));
      const res = await runCatalogValuation(user.id, mapped, methodology, {
        growth_rate: growthRate[0] / 100,
        discount_rate: discountRate[0] / 100,
        multiple: multiple[0],
      });
      setResult(res);
      toast({ title: "Valuation calculated" });
    } catch {
      toast({ title: "Valuation failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (n: number) => {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  const totalValue = result?.valuation?.total_value || 0;
  const ci = result?.confidence_interval || {};
  const riskMetrics = result?.risk_metrics || {};
  const songVals = result?.song_valuations || [];

  // Sort songs by contribution
  const sortedSongs = useMemo(() =>
    [...songVals].sort((a: any, b: any) => (b.contributed_value || 0) - (a.contributed_value || 0)),
    [songVals]
  );

  return (
    <div className="space-y-4">
      {/* Value Ticker + Controls */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Catalog Valuation
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setShowSettings(!showSettings)} className="h-7">
                <Settings className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" onClick={runValuation} disabled={loading || songs.length === 0} className="h-7 text-xs">
                {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Calculator className="w-3 h-3 mr-1" />}
                Calculate
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Main Value Display */}
          <div className="text-center py-3">
            <p className="text-3xl font-bold text-emerald-400 font-mono">{formatCurrency(totalValue)}</p>
            {ci.low && ci.high && (
              <p className="text-xs text-muted-foreground mt-1">
                90% CI: {formatCurrency(ci.low)} — {formatCurrency(ci.high)}
              </p>
            )}
            <Badge variant="outline" className="mt-2 text-[10px]">
              {methodology === "income_approach" ? "DCF" : methodology === "market_multiple" ? "Market Comp" : "Monte Carlo"}
            </Badge>
          </div>

          {/* Confidence Band Visualization */}
          {ci.p5 && ci.p95 && (
            <div className="relative h-6 bg-muted/20 rounded-full overflow-hidden mt-2">
              <div
                className="absolute h-full bg-emerald-500/20 rounded-full"
                style={{
                  left: `${Math.max(0, (ci.low / ci.p95) * 100)}%`,
                  width: `${Math.min(100, ((ci.high - ci.low) / ci.p95) * 100)}%`,
                }}
              />
              <div
                className="absolute h-full w-0.5 bg-emerald-400"
                style={{ left: `${Math.min(100, (ci.mid / ci.p95) * 100)}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] text-muted-foreground">
                <span>{formatCurrency(ci.p5 || ci.low || 0)}</span>
                <span>{formatCurrency(ci.p95 || ci.high || 0)}</span>
              </div>
            </div>
          )}

          {/* Settings Panel */}
          {showSettings && (
            <div className="mt-4 space-y-3 p-3 rounded-lg bg-muted/10 border border-border/30">
              <div>
                <Label className="text-xs">Methodology</Label>
                <Select value={methodology} onValueChange={setMethodology}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income_approach">DCF (Income Approach)</SelectItem>
                    <SelectItem value="market_multiple">Market Multiple</SelectItem>
                    <SelectItem value="monte_carlo">Monte Carlo Simulation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Growth Rate: {growthRate[0]}%</Label>
                <Slider value={growthRate} onValueChange={setGrowthRate} min={-10} max={50} step={1} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Discount Rate: {discountRate[0]}%</Label>
                <Slider value={discountRate} onValueChange={setDiscountRate} min={5} max={20} step={1} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Market Multiple: {multiple[0]}x</Label>
                <Slider value={multiple} onValueChange={setMultiple} min={8} max={30} step={1} className="mt-1" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risk Metrics */}
      {(riskMetrics.concentration_risk !== undefined) && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-card/30 border-border/30">
              <CardContent className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Top 3 Share</p>
                <p className={cn("text-sm font-bold font-mono",
                  riskMetrics.concentration_risk > 70 ? "text-red-400" :
                  riskMetrics.concentration_risk > 50 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {riskMetrics.concentration_risk || 0}%
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/30 border-border/30">
              <CardContent className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Genre Diversity</p>
                <p className="text-sm font-bold font-mono text-blue-400">
                  {riskMetrics.genre_diversification || 0}%
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/30 border-border/30">
              <CardContent className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Geo Diversity</p>
                <p className={cn("text-sm font-bold font-mono",
                  (riskMetrics.geographic_diversification || 0) > 50 ? "text-emerald-400" : "text-amber-400"
                )}>
                  {riskMetrics.geographic_diversification || 0}%
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-card/30 border-border/30">
              <CardContent className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Decay Impact</p>
                <p className={cn("text-sm font-bold font-mono",
                  (riskMetrics.decay_factor || 0) > 20 ? "text-red-400" :
                  (riskMetrics.decay_factor || 0) > 10 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {riskMetrics.decay_factor || 0}%
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/30 border-border/30">
              <CardContent className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">©️ Expiry Risk</p>
                <p className={cn("text-sm font-bold font-mono",
                  (riskMetrics.copyright_expiry_impact || 0) > 10 ? "text-red-400" : "text-emerald-400"
                )}>
                  {riskMetrics.copyright_expiry_impact || 0}%
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card/30 border-border/30">
              <CardContent className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Songs</p>
                <p className="text-sm font-bold font-mono text-foreground">
                  {songs.length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Concentration Risk Warning */}
          {riskMetrics.concentration_risk > 70 && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-2.5 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-300">
                  <span className="font-medium">High concentration risk:</span> {riskMetrics.top_3_percentage}% of value in top 3 songs. Buyers apply 10-20% discount.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Song-level Breakdown */}
      {sortedSongs.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5" />
              Song Contribution
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-48">
              <div className="space-y-1.5">
                {sortedSongs.slice(0, 10).map((s: any, i: number) => {
                  const pct = totalValue > 0 ? (s.contributed_value / totalValue) * 100 : 0;
                  return (
                    <div key={s.song_id || i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-4 text-right">{i + 1}.</span>
                      <div className="flex-1 min-w-0 truncate">{s.title}</div>
                      <div className="w-20 h-1.5 bg-muted/30 rounded-full overflow-hidden shrink-0">
                        <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="font-mono text-foreground w-16 text-right shrink-0">{formatCurrency(s.contributed_value)}</span>
                      <span className="text-muted-foreground w-10 text-right shrink-0">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Market Comparables */}
      {comparables.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Market Comparables
              {marketStats?.avg_multiple && (
                <Badge variant="outline" className="ml-auto text-[9px] px-1.5 py-0">
                  Avg: {marketStats.avg_multiple}x
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {/* Market insight message */}
            {marketStats?.avg_multiple && totalValue > 0 && (
              <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-[10px] text-primary">
                  💡 Similar catalogs sold at <span className="font-bold">{marketStats.avg_multiple}x</span> revenue multiple
                  {marketStats.avg_sale_price && (
                    <> · Avg sale: <span className="font-mono font-bold">{formatCurrency(marketStats.avg_sale_price)}</span></>
                  )}
                  <span className="text-muted-foreground"> ({marketStats.total_transactions} transactions)</span>
                </p>
              </div>
            )}
            <ScrollArea className="max-h-36">
              <div className="space-y-1.5">
                {comparables.slice(0, 8).map((c: any) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-16 shrink-0">
                      {(c.sale_date || c.transaction_date) ? new Date(c.sale_date || c.transaction_date).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : "—"}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{c.catalog_name || c.buyer || "Unknown"}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{c.genre || "—"}</Badge>
                    {c.sale_price && (
                      <span className="font-mono text-emerald-400 w-16 text-right shrink-0">{formatCurrency(Number(c.sale_price))}</span>
                    )}
                    <span className="font-mono text-foreground w-10 text-right shrink-0">{c.multiple?.toFixed(1)}x</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Scenario Analysis */}
      {songs.length > 0 && (
        <ScenarioAnalysisPanel
          baseValue={totalValue}
          growthRate={growthRate[0]}
          discountRate={discountRate[0]}
          multiple={multiple[0]}
          songs={songs}
        />
      )}
    </div>
  );
}

export default CatalogValuationDashboard;
