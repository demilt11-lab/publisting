import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { AppShell, NavSection } from "@/components/layout/AppShell";
import { ArrowLeft, Upload, RefreshCw, TrendingUp, TrendingDown, Minus, Globe, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchActiveRates, StreamingRate, getCurrentQuarter, getRatesByRegion } from "@/lib/api/streamingRates";
import { formatRate } from "@/lib/publishingRevenue";

const regionLabels: Record<string, string> = {
  north_america: "North America",
  europe: "Europe",
  asia: "Asia",
  latin_america: "Latin America",
  africa: "Africa",
  middle_east: "Middle East",
  oceania: "Oceania",
  global: "Default Tiers",
};

const platformColors: Record<string, string> = {
  spotify: "bg-success/15 text-success border-success/25",
  youtube: "bg-destructive/15 text-destructive border-destructive/25",
};

export default function AdminStreamingRates() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rates, setRates] = useState<StreamingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchActiveRates(true).then(data => {
      setRates(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return rates.filter(r => {
      if (platformFilter !== "all" && r.platform !== platformFilter) return false;
      if (regionFilter !== "all" && r.region !== regionFilter) return false;
      if (searchTerm && !r.country_code.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [rates, platformFilter, regionFilter, searchTerm]);

  const platforms = [...new Set(rates.map(r => r.platform))];
  const regions = [...new Set(rates.filter(r => r.region).map(r => r.region!))];
  const quarter = getCurrentQuarter();

  const stats = useMemo(() => {
    const spotifyRates = rates.filter(r => r.platform === "spotify" && !r.country_code.startsWith("DEFAULT"));
    const youtubeRates = rates.filter(r => r.platform === "youtube" && !r.country_code.startsWith("DEFAULT"));
    const avgSpotify = spotifyRates.length > 0 ? spotifyRates.reduce((s, r) => s + r.rate_per_stream, 0) / spotifyRates.length : 0;
    const avgYoutube = youtubeRates.length > 0 ? youtubeRates.reduce((s, r) => s + r.rate_per_stream, 0) / youtubeRates.length : 0;
    const maxSpotify = spotifyRates.length > 0 ? Math.max(...spotifyRates.map(r => r.rate_per_stream)) : 0;
    const minSpotify = spotifyRates.length > 0 ? Math.min(...spotifyRates.map(r => r.rate_per_stream)) : 0;
    return { avgSpotify, avgYoutube, maxSpotify, minSpotify, totalCountries: spotifyRates.length, totalRates: rates.length };
  }, [rates]);

  const cardClass = "rounded-xl border border-border/50 bg-card p-4";
  const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary";

  return (
    <AppShell activeSection={"home" as NavSection} onSectionChange={() => {}}>
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground">Streaming Rate Database</h1>
              <p className="text-sm text-muted-foreground">
                {quarter} · {stats.totalCountries} countries · {stats.totalRates} rates
              </p>
            </div>
            <Badge variant="outline" className="text-xs">{quarter}</Badge>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={cardClass}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Spotify Rate</p>
              <p className="text-lg font-bold text-foreground mt-1">{formatRate(stats.avgSpotify)}</p>
            </div>
            <div className={cardClass}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg YouTube Rate</p>
              <p className="text-lg font-bold text-foreground mt-1">{formatRate(stats.avgYoutube)}</p>
            </div>
            <div className={cardClass}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Highest (Spotify)</p>
              <p className="text-lg font-bold text-success mt-1">{formatRate(stats.maxSpotify)}</p>
            </div>
            <div className={cardClass}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Lowest (Spotify)</p>
              <p className="text-lg font-bold text-warning mt-1">{formatRate(stats.minSpotify)}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select className={inputClass + " max-w-[160px]"} value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}>
              <option value="all">All platforms</option>
              {platforms.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
            <select className={inputClass + " max-w-[180px]"} value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
              <option value="all">All regions</option>
              {regions.map(r => <option key={r} value={r}>{regionLabels[r] || r}</option>)}
            </select>
            <input className={inputClass + " max-w-[200px]"} placeholder="Search country code..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          {/* Rate table */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading rates...</div>
          ) : (
            <div className={cardClass + " overflow-x-auto"}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Platform</th>
                    <th className="pb-2 pr-4">Country</th>
                    <th className="pb-2 pr-4">Region</th>
                    <th className="pb-2 pr-4 text-right">Rate/Stream</th>
                    <th className="pb-2 pr-4">Quarter</th>
                    <th className="pb-2 pr-4">Source</th>
                    <th className="pb-2">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(rate => (
                    <tr key={rate.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className={`text-[10px] ${platformColors[rate.platform] || ""}`}>
                          {rate.platform}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{rate.country_code}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{regionLabels[rate.region || ""] || rate.region || "—"}</td>
                      <td className="py-2 pr-4 text-right font-mono text-xs font-medium">{formatRate(rate.rate_per_stream)}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{rate.quarter}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{rate.source || "—"}</td>
                      <td className="py-2">
                        {rate.verified ? (
                          <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">✓</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">?</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">No rates match your filters</p>
              )}
            </div>
          )}

          {/* Info footer */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <p>
              Rates are industry estimates based on publicly available data from Spotify Loud & Clear, Digital Music News, and Songtrust reports. 
              Per-stream rates vary based on subscription tier, country, and time period. These are publishing royalty rates, not total platform payouts.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
