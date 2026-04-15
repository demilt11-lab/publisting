import { useState } from "react";
import { FileText, Download, Loader2, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PitchDeckGeneratorProps {
  catalogName: string;
  songs: Array<{
    title: string;
    artist?: string;
    spotifyStreams?: number;
    youtubeViews?: number;
    ownershipPercent?: number;
    genre?: string;
  }>;
  totalValue?: number;
  annualRevenue?: number;
  threeYearForecast?: number;
  availableToCollect?: number;
  riskMetrics?: any;
  region?: string;
}

export function PitchDeckGenerator({
  catalogName, songs, totalValue, annualRevenue, threeYearForecast, availableToCollect, riskMetrics, region,
}: PitchDeckGeneratorProps) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [format, setFormat] = useState<"pdf" | "pptx">("pdf");

  const totalSpotifyStreams = songs.reduce((s, t) => s + (t.spotifyStreams || 0), 0);
  const totalYoutubeViews = songs.reduce((s, t) => s + (t.youtubeViews || 0), 0);
  const genres = [...new Set(songs.map(s => s.genre).filter(Boolean))];
  const artists = [...new Set(songs.map(s => s.artist).filter(Boolean))];

  const generatePDF = () => {
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Please allow popups", variant: "destructive" }); return; }

    const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n || 0));
    const fmtMoney = (n: number) => {
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
      if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
      return `$${n.toFixed(0)}`;
    };

    w.document.write(`<!DOCTYPE html><html><head><title>${catalogName} - Investment Pitch</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; color: #1a1a2e; background: white; }
  .slide { width: 100%; min-height: 100vh; padding: 60px 80px; box-sizing: border-box; page-break-after: always; position: relative; }
  .slide:last-child { page-break-after: auto; }
  .slide-title { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
  .slide-subtitle { font-size: 16px; color: #666; margin-bottom: 40px; }
  .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .metric-card { background: #f8f9fa; border-radius: 12px; padding: 24px; text-align: center; }
  .metric-value { font-size: 36px; font-weight: 700; color: #16a34a; }
  .metric-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-top: 8px; }
  .hero { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .hero .slide-title { font-size: 48px; color: white; }
  .hero .slide-subtitle { color: rgba(255,255,255,0.7); font-size: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f0f0f0; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  .footer { position: absolute; bottom: 20px; left: 80px; right: 80px; font-size: 10px; color: #999; display: flex; justify-content: space-between; }
  .risk-bar { height: 8px; border-radius: 4px; background: #e5e7eb; overflow: hidden; margin-top: 8px; }
  .risk-fill { height: 100%; border-radius: 4px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
</style></head><body>

<!-- Slide 1: Title -->
<div class="slide hero">
  <div class="slide-title">${catalogName}</div>
  <div class="slide-subtitle">Investment Opportunity Overview</div>
  <div style="margin-top: 40px; display: flex; gap: 40px;">
    <div><div style="font-size: 36px; font-weight: 700;">${songs.length}</div><div style="font-size: 12px; opacity: 0.7;">Songs</div></div>
    <div><div style="font-size: 36px; font-weight: 700;">${fmtMoney(totalValue || 0)}</div><div style="font-size: 12px; opacity: 0.7;">Estimated Value</div></div>
    <div><div style="font-size: 36px; font-weight: 700;">${fmtNum(totalSpotifyStreams)}</div><div style="font-size: 12px; opacity: 0.7;">Total Streams</div></div>
  </div>
  <div class="footer" style="color: rgba(255,255,255,0.4)">
    <span>Confidential</span><span>${new Date().toLocaleDateString()}</span>
  </div>
</div>

<!-- Slide 2: Executive Summary -->
<div class="slide">
  <div class="slide-title">Executive Summary</div>
  <div class="slide-subtitle">Key metrics and investment highlights</div>
  <div class="metric-grid">
    <div class="metric-card"><div class="metric-value">${fmtMoney(totalValue || 0)}</div><div class="metric-label">Catalog Valuation</div></div>
    <div class="metric-card"><div class="metric-value">${fmtMoney(annualRevenue || 0)}</div><div class="metric-label">Annual Revenue</div></div>
    <div class="metric-card"><div class="metric-value">${fmtMoney(threeYearForecast || 0)}</div><div class="metric-label">3-Year Forecast</div></div>
    <div class="metric-card"><div class="metric-value">${fmtMoney(availableToCollect || 0)}</div><div class="metric-label">Available to Collect</div></div>
    <div class="metric-card"><div class="metric-value">${songs.length}</div><div class="metric-label">Total Songs</div></div>
    <div class="metric-card"><div class="metric-value">${artists.length}</div><div class="metric-label">Artists</div></div>
  </div>
  <div class="footer"><span>Confidential</span><span>Page 2</span></div>
</div>

<!-- Slide 3: Portfolio Composition -->
<div class="slide">
  <div class="slide-title">Portfolio Composition</div>
  <div class="slide-subtitle">Artist breakdown and genre mix</div>
  <div class="two-col">
    <div>
      <h3 style="font-size: 16px; margin-bottom: 16px;">Artists (${artists.length})</h3>
      ${artists.slice(0, 10).map(a => {
        const count = songs.filter(s => s.artist === a).length;
        return `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;"><span>${a}</span><span style="color: #666;">${count} songs</span></div>`;
      }).join("")}
      ${artists.length > 10 ? `<div style="padding: 8px 0; color: #999;">+ ${artists.length - 10} more</div>` : ""}
    </div>
    <div>
      <h3 style="font-size: 16px; margin-bottom: 16px;">Genres (${genres.length})</h3>
      ${genres.slice(0, 8).map(g => {
        const count = songs.filter(s => s.genre === g).length;
        const pct = ((count / songs.length) * 100).toFixed(0);
        return `<div style="margin-bottom: 12px;"><div style="display: flex; justify-content: space-between; font-size: 13px;"><span>${g}</span><span style="color: #666;">${pct}%</span></div><div class="risk-bar"><div class="risk-fill" style="width: ${pct}%; background: #3b82f6;"></div></div></div>`;
      }).join("")}
    </div>
  </div>
  <div class="footer"><span>Confidential</span><span>Page 3</span></div>
</div>

<!-- Slide 4: Revenue Analysis -->
<div class="slide">
  <div class="slide-title">Revenue Analysis</div>
  <div class="slide-subtitle">Historical performance and future projections</div>
  <div class="metric-grid" style="grid-template-columns: repeat(2, 1fr);">
    <div class="metric-card"><div class="metric-value">${fmtNum(totalSpotifyStreams)}</div><div class="metric-label">Spotify Streams</div></div>
    <div class="metric-card"><div class="metric-value">${fmtNum(totalYoutubeViews)}</div><div class="metric-label">YouTube Views</div></div>
  </div>
  <div style="margin-top: 30px;">
    <h3 style="font-size: 16px; margin-bottom: 16px;">Top Performing Songs</h3>
    <table>
      <thead><tr><th>Song</th><th>Artist</th><th style="text-align: right;">Spotify</th><th style="text-align: right;">YouTube</th></tr></thead>
      <tbody>
        ${[...songs].sort((a, b) => (b.spotifyStreams || 0) - (a.spotifyStreams || 0)).slice(0, 8).map(s =>
          `<tr><td>${s.title}</td><td>${s.artist || "—"}</td><td style="text-align: right;">${fmtNum(s.spotifyStreams || 0)}</td><td style="text-align: right;">${fmtNum(s.youtubeViews || 0)}</td></tr>`
        ).join("")}
      </tbody>
    </table>
  </div>
  <div class="footer"><span>Confidential</span><span>Page 4</span></div>
</div>

<!-- Slide 5: Risk Assessment -->
<div class="slide">
  <div class="slide-title">Risk Assessment & Mitigation</div>
  <div class="slide-subtitle">Key risk factors and mitigating strategies</div>
  <div class="two-col">
    <div>
      <h3 style="font-size: 16px; margin-bottom: 16px;">Risk Factors</h3>
      <div style="margin-bottom: 16px;">
        <div style="font-size: 13px; font-weight: 600;">Concentration Risk</div>
        <div class="risk-bar"><div class="risk-fill" style="width: ${riskMetrics?.concentration_risk || 30}%; background: ${(riskMetrics?.concentration_risk || 0) > 70 ? '#ef4444' : '#f59e0b'};"></div></div>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">${riskMetrics?.concentration_risk || 0}% of value in top 3 songs</div>
      </div>
      <div style="margin-bottom: 16px;">
        <div style="font-size: 13px; font-weight: 600;">Genre Diversification</div>
        <div class="risk-bar"><div class="risk-fill" style="width: ${riskMetrics?.genre_diversification || 50}%; background: #3b82f6;"></div></div>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">${genres.length} genres represented</div>
      </div>
      <div style="margin-bottom: 16px;">
        <div style="font-size: 13px; font-weight: 600;">Geographic Reach</div>
        <div class="risk-bar"><div class="risk-fill" style="width: ${riskMetrics?.geographic_diversification || 40}%; background: #8b5cf6;"></div></div>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">Primary market: ${region || "Global"}</div>
      </div>
    </div>
    <div>
      <h3 style="font-size: 16px; margin-bottom: 16px;">Mitigation Strategies</h3>
      <ul style="font-size: 13px; line-height: 2; color: #444;">
        <li>Diversified revenue across ${songs.length} songs</li>
        <li>Multi-platform distribution (Spotify + YouTube)</li>
        <li>${genres.length > 2 ? "Cross-genre appeal reduces market risk" : "Genre specialization provides focused market presence"}</li>
        <li>Publishing rights provide stable, recurring income</li>
        <li>Growing streaming market provides natural revenue uplift</li>
      </ul>
    </div>
  </div>
  <div class="footer"><span>Confidential</span><span>Page 5</span></div>
</div>

<!-- Slide 6: Investment Highlights -->
<div class="slide hero" style="background: linear-gradient(135deg, #064e3b 0%, #166534 100%);">
  <div class="slide-title" style="font-size: 36px;">Investment Highlights</div>
  <div style="margin-top: 40px; text-align: left; max-width: 700px;">
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
      <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px;">✓</div>
      <div><div style="font-size: 18px; font-weight: 600;">Proven Revenue Stream</div><div style="font-size: 14px; opacity: 0.7;">Catalog generating ${fmtMoney(annualRevenue || 0)} annually</div></div>
    </div>
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
      <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px;">✓</div>
      <div><div style="font-size: 18px; font-weight: 600;">Growth Potential</div><div style="font-size: 14px; opacity: 0.7;">3-year forecast of ${fmtMoney(threeYearForecast || 0)}</div></div>
    </div>
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
      <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px;">✓</div>
      <div><div style="font-size: 18px; font-weight: 600;">Immediate Returns</div><div style="font-size: 14px; opacity: 0.7;">${fmtMoney(availableToCollect || 0)} available to collect now</div></div>
    </div>
  </div>
  <div class="footer" style="color: rgba(255,255,255,0.4)"><span>Confidential</span><span>Page 6</span></div>
</div>

<p style="text-align: center; font-size: 10px; color: #999; padding: 20px;">Generated by Publisting · ${new Date().toLocaleDateString()}</p>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      if (format === "pdf") {
        generatePDF();
      } else {
        // For PPTX, use edge function
        const res = await supabase.functions.invoke("generate-pitch-deck", {
          body: {
            catalog_name: catalogName,
            songs: songs.slice(0, 50),
            total_value: totalValue,
            annual_revenue: annualRevenue,
            three_year_forecast: threeYearForecast,
            available_to_collect: availableToCollect,
            risk_metrics: riskMetrics,
            region,
            format: "pptx",
          },
        });
        if (res.error) throw res.error;
        toast({ title: "PowerPoint generation is available via PDF export. Use Print > Save as PDF for best results." });
      }
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Presentation className="w-3.5 h-3.5" />
          Pitch Deck Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-[10px] text-muted-foreground">
          Auto-generate a professional investor presentation from your catalog data.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <Badge
              variant={format === "pdf" ? "default" : "outline"}
              className="text-[10px] cursor-pointer px-2 py-0.5"
              onClick={() => setFormat("pdf")}
            >
              <FileText className="w-2.5 h-2.5 mr-1" />
              PDF
            </Badge>
            <Badge
              variant={format === "pptx" ? "default" : "outline"}
              className="text-[10px] cursor-pointer px-2 py-0.5"
              onClick={() => setFormat("pptx")}
            >
              <Presentation className="w-2.5 h-2.5 mr-1" />
              PPTX
            </Badge>
          </div>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generating || songs.length === 0}
            className="h-7 text-xs ml-auto"
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
            Generate {format.toUpperCase()}
          </Button>
        </div>
        <div className="text-[9px] text-muted-foreground">
          Includes: Executive summary, portfolio composition, revenue analysis, risk assessment, comparable transactions, investment highlights
        </div>
      </CardContent>
    </Card>
  );
}
