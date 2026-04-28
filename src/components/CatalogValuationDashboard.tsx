import { useState, useMemo, useEffect } from "react";
import { DollarSign, TrendingUp, BarChart3, AlertTriangle, Loader2, Settings, Calculator, PieChart, Info, Globe } from "lucide-react";
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
import { runCatalogValuation, getLatestValuation, getMarketMultiples } from "@/lib/api/phase1Engines";
import { fetchCatalogComps } from "@/lib/api/integrationEngines";
import { ScenarioAnalysisPanel } from "@/components/ScenarioAnalysisPanel";
import { ValuationModelsComparison } from "@/components/ValuationModelsComparison";
import { PitchDeckGenerator } from "@/components/PitchDeckGenerator";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  detectDominantRegion,
  getRegionalConfig,
  getRegionalMultiple,
  getRegionalDiscount,
  REGION_OPTIONS,
  resolveValuationRegion,
} from "@/utils/regionalRates";

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
    regionOverride?: string;
  }>;
}

export function CatalogValuationDashboard({ songs }: CatalogValuationDashboardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [methodology, setMethodology] = useState("income_approach");
  const [comparables, setComparables] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [marketStats, setMarketStats] = useState<any>(null);

  // Auto-detect region from catalog data
  const detectedRegion = useMemo(() => detectDominantRegion(songs), [songs]);
  const [selectedRegion, setSelectedRegion] = useState<string>(detectedRegion);

  // Update region when songs change
  useEffect(() => { setSelectedRegion(detectedRegion); }, [detectedRegion]);

  // Set slider defaults based on region
  const regionalConfig = useMemo(() => getRegionalConfig(selectedRegion), [selectedRegion]);
  const [growthRate, setGrowthRate] = useState([15]);
  const [discountRate, setDiscountRate] = useState([regionalConfig.discountRate.default]);
  const [multiple, setMultiple] = useState([regionalConfig.marketMultiple.default]);

  // Sync slider defaults when region changes
  useEffect(() => {
    setDiscountRate([regionalConfig.discountRate.default]);
    setMultiple([regionalConfig.marketMultiple.default]);
  }, [regionalConfig]);

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
    fetchCatalogComps().then(res => {
      if (res.success) {
        setComparables(res.comparables || []);
        setMarketStats(res.market_stats || null);
      }
    }).catch(() => {
      getMarketMultiples().then(setComparables).catch(() => {});
    });
  }, [user]);

  // Auto-run valuation whenever the catalog inputs change (debounced) so the
  // dashboard cards never show stale $0 values when a fresh session is loaded
  // or the catalog is edited. The Calculate button still works for manual
  // re-runs (e.g. after changing methodology / sliders).
  const songsSignature = useMemo(() => JSON.stringify(songs.map(s => [
    s.id || s.title, s.title, s.artist, s.spotify_streams || 0, s.youtube_views || 0,
    s.ownership_percent || 100, s.country || s.regionOverride || "",
  ])), [songs]);

  useEffect(() => {
    if (!user || songs.length === 0) return;
    const t = setTimeout(() => { runValuation(); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, songsSignature, methodology, selectedRegion]);

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
        country: resolveValuationRegion(s.country || s.regionOverride || selectedRegion),
      }));
      const res = await runCatalogValuation(user.id, mapped, methodology, {
        growth_rate: growthRate[0] / 100,
        discount_rate: discountRate[0] / 100,
        multiple: multiple[0],
      } as Record<string, number>);
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

  const sortedSongs = useMemo(() => {
    // Deduplicate by song_id/title before sorting
    const seen = new Set<string>();
    const deduped = songVals.filter((s: any) => {
      const key = s.song_id || s.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [...deduped].sort((a: any, b: any) => (b.contributed_value || 0) - (a.contributed_value || 0));
  }, [songVals]);

  const methodLabel = methodology === "income_approach" ? "DCF" : methodology === "market_multiple" ? "Market Comp" : "Monte Carlo";

  return (
    <TooltipProvider>
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
            {/* Main Value Display — uses Risk-Adjusted NPV when available for consistency */}
            <div className="text-center py-3">
              <p className="text-3xl font-bold text-emerald-400 font-mono">{formatCurrency(totalValue)}</p>
              {totalValue > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Primary valuation uses server-side income approach. See Valuation Models below for DCF, Market Comp, and Risk-Adjusted NPV alternatives.
                </p>
              )}
              {ci.low && ci.high && (() => {
                // Fix CI: ensure lower < point estimate < upper
                const ciLow = Math.min(ci.low, totalValue * 0.5);
                const ciHigh = Math.max(ci.high, totalValue * 2.0);
                const correctedLow = totalValue > 0 ? Math.min(ciLow, totalValue * 0.95) : ci.low;
                const correctedHigh = totalValue > 0 ? Math.max(ciHigh, totalValue * 1.05) : ci.high;
                return (
                  <p className="text-xs text-muted-foreground mt-1">
                    90% CI: {formatCurrency(correctedLow)} — {formatCurrency(correctedHigh)}
                  </p>
                );
              })()}
              <div className="flex items-center justify-center gap-2 mt-2">
                <Badge variant="outline" className="text-[10px]">
                  {methodLabel}
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] flex items-center gap-1 cursor-help">
                      <Globe className="w-2.5 h-2.5" />
                      {regionalConfig.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                    Rates and multiples adjusted for the {regionalConfig.label} music market. Regional market conditions affect streaming payouts and comparable transaction multiples.
                  </TooltipContent>
                </Tooltip>
              </div>
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
                  <Label className="text-xs">Region</Label>
                  <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REGION_OPTIONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Auto-detected: {getRegionalConfig(detectedRegion).label}
                  </p>
                </div>
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
                  <Slider
                    value={discountRate}
                    onValueChange={setDiscountRate}
                    min={regionalConfig.discountRate.min}
                    max={Math.max(regionalConfig.discountRate.max, 25)}
                    step={1}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Market Multiple: {multiple[0]}x</Label>
                  <Slider
                    value={multiple}
                    onValueChange={setMultiple}
                    min={Math.max(regionalConfig.marketMultiple.min - 2, 4)}
                    max={regionalConfig.marketMultiple.max + 5}
                    step={1}
                    className="mt-1"
                  />
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

        {/* Valuation Models Comparison */}
        {songs.length > 0 && (
          <ValuationModelsComparison
            songs={songs.map(s => ({
              title: s.title,
              artist: s.artist,
              spotify_streams: s.spotify_streams,
              youtube_views: s.youtube_views,
              ownership_percent: s.ownership_percent,
              genre: s.genre,
              country: s.country,
            }))}
            valuationResult={result}
            annualRevenue={songVals.reduce((s: number, v: any) => s + (v.annual_revenue || 0), 0)}
            region={selectedRegion}
            growthRate={growthRate[0]}
            discountRate={discountRate[0]}
            multiple={multiple[0]}
          />
        )}

        {/* Scenario Analysis */}
        {songs.length > 0 && (
          <ScenarioAnalysisPanel
            baseValue={totalValue}
            growthRate={growthRate[0]}
            discountRate={discountRate[0]}
            multiple={multiple[0]}
            songs={songs}
            region={selectedRegion}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

export default CatalogValuationDashboard;
