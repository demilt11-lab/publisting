import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BarChart3, Save, Trash2, RefreshCw, Plus, FileJson,
  DollarSign, Music, TrendingUp, AlertTriangle, ChevronRight, Loader2
} from "lucide-react";
import {
  SPOTIFY_PUB_RATE, YOUTUBE_PUB_RATE,
  estimateSpotifyStreams, parseYouTubeViews, formatCurrency
} from "@/lib/publishingRevenue";

/* ─── Region presets ─── */
const REGION_PRESETS: Record<string, { label: string; spotifyRate: number; ytRate: number }> = {
  us: { label: "United States", spotifyRate: 0.004, ytRate: 0.002 },
  uk: { label: "United Kingdom", spotifyRate: 0.0038, ytRate: 0.0018 },
  de: { label: "Germany (DACH)", spotifyRate: 0.0042, ytRate: 0.0015 },
  latam: { label: "Latin America", spotifyRate: 0.0015, ytRate: 0.0008 },
  sea: { label: "Southeast Asia", spotifyRate: 0.001, ytRate: 0.0005 },
  global: { label: "Global Average", spotifyRate: 0.003, ytRate: 0.0014 },
};

/* ─── Types ─── */
interface CatalogSongInput {
  title: string;
  artist: string;
  spotifyPopularity?: number;
  spotifyStreams?: number;
  youtubeViews?: string;
  publishingShare?: number;
  releaseDate?: string;
  excluded?: boolean;
  overrideSpotifyRate?: number;
  overrideYtRate?: number;
}

interface AnalysisConfig {
  region: string;
  blendedRegions?: { region: string; weight: number }[];
  useBlended: boolean;
  discountRate: number;
  projectionYears: number;
  catalogJson: string;
}

interface SongResult {
  title: string;
  artist: string;
  estSpotifyStreams: number;
  youtubeViews: number;
  totalPubRevenue: number;
  ownerShare: number;
  annualRate: number;
  projectedValue: number;
  excluded: boolean;
}

interface AnalysisResults {
  songs: SongResult[];
  totalCatalogValue: number;
  totalAnnualRate: number;
  totalProjectedValue: number;
  songCount: number;
  excludedCount: number;
}

interface SavedAnalysis {
  id: string;
  name: string;
  config: AnalysisConfig;
  results: AnalysisResults;
  created_at: string;
  updated_at: string;
}

const DEFAULT_CONFIG: AnalysisConfig = {
  region: "us",
  useBlended: false,
  blendedRegions: [
    { region: "us", weight: 60 },
    { region: "uk", weight: 20 },
    { region: "global", weight: 20 },
  ],
  discountRate: 10,
  projectionYears: 3,
  catalogJson: "",
};

/* ─── Component ─── */
export default function CatalogAnalysis() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<any>("catalog-analysis");
  const [config, setConfig] = useState<AnalysisConfig>(DEFAULT_CONFIG);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysisName, setAnalysisName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ─── Load saved analyses ─── */
  const loadAnalyses = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("catalog_analyses")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setSavedAnalyses((data as any[]) || []);
    } catch {
      // Table might not exist yet — graceful fallback
      setSavedAnalyses([]);
    }
  }, [user]);

  useEffect(() => { loadAnalyses(); }, [loadAnalyses]);

  /* ─── Compute effective rates ─── */
  const effectiveRates = useMemo(() => {
    if (!config.useBlended) {
      const preset = REGION_PRESETS[config.region] || REGION_PRESETS.us;
      return { spotifyRate: preset.spotifyRate, ytRate: preset.ytRate };
    }
    const blend = config.blendedRegions || [];
    const totalWeight = blend.reduce((s, b) => s + b.weight, 0) || 1;
    let sr = 0, yr = 0;
    blend.forEach(b => {
      const p = REGION_PRESETS[b.region] || REGION_PRESETS.us;
      sr += p.spotifyRate * (b.weight / totalWeight);
      yr += p.ytRate * (b.weight / totalWeight);
    });
    return { spotifyRate: sr, ytRate: yr };
  }, [config.region, config.useBlended, config.blendedRegions]);

  /* ─── Run analysis ─── */
  const runAnalysis = useCallback(() => {
    let songs: CatalogSongInput[];
    try {
      const parsed = JSON.parse(config.catalogJson);
      songs = Array.isArray(parsed) ? parsed : parsed.songs || [];
    } catch {
      toast.error("Invalid JSON. Paste an array of songs.");
      return;
    }
    if (songs.length === 0) {
      toast.error("No songs found in JSON.");
      return;
    }

    const { spotifyRate, ytRate } = effectiveRates;
    const songResults: SongResult[] = songs.map(s => {
      const excluded = !!s.excluded;
      const streams = s.spotifyStreams ?? estimateSpotifyStreams(s.spotifyPopularity || 0);
      const views = parseYouTubeViews(s.youtubeViews || "0");
      const sr = s.overrideSpotifyRate ?? spotifyRate;
      const yr = s.overrideYtRate ?? ytRate;
      const totalPub = streams * sr + views * yr;
      const share = s.publishingShare ?? 100;
      const ownerShare = totalPub * (share / 100);

      let yearsSinceRelease = 1;
      if (s.releaseDate) {
        const d = new Date(s.releaseDate);
        if (!isNaN(d.getTime())) {
          yearsSinceRelease = Math.max(1, (Date.now() - d.getTime()) / (365.25 * 86400000));
        }
      }
      const annualRate = totalPub / yearsSinceRelease;
      const disc = config.discountRate / 100;
      let projected = 0;
      for (let y = 1; y <= config.projectionYears; y++) {
        projected += annualRate / Math.pow(1 + disc, y);
      }

      return { title: s.title, artist: s.artist, estSpotifyStreams: streams, youtubeViews: views, totalPubRevenue: totalPub, ownerShare, annualRate, projectedValue: projected, excluded };
    });

    const active = songResults.filter(s => !s.excluded);
    const res: AnalysisResults = {
      songs: songResults,
      totalCatalogValue: active.reduce((s, r) => s + r.totalPubRevenue, 0),
      totalAnnualRate: active.reduce((s, r) => s + r.annualRate, 0),
      totalProjectedValue: active.reduce((s, r) => s + r.projectedValue, 0),
      songCount: active.length,
      excludedCount: songResults.length - active.length,
    };
    setResults(res);
    toast.success(`Analyzed ${res.songCount} songs`);
  }, [config, effectiveRates]);

  /* ─── Save / Update ─── */
  const handleSave = async () => {
    if (!user) { toast.error("Sign in to save analyses."); return; }
    if (!analysisName.trim()) { toast.error("Enter a name for this analysis."); return; }
    if (!results) { toast.error("Run an analysis first."); return; }
    setSaving(true);
    try {
      if (selectedId) {
        const { error } = await supabase
          .from("catalog_analyses")
          .update({ name: analysisName, config: config as any, results: results as any })
          .eq("id", selectedId);
        if (error) throw error;
        toast.success("Analysis updated");
      } else {
        const { error } = await supabase
          .from("catalog_analyses")
          .insert({ user_id: user.id, name: analysisName, config: config as any, results: results as any });
        if (error) throw error;
        toast.success("Analysis saved");
      }
      await loadAnalyses();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally { setSaving(false); }
  };

  /* ─── Delete ─── */
  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("catalog_analyses").delete().eq("id", id);
      if (error) throw error;
      if (selectedId === id) { setSelectedId(null); setAnalysisName(""); setResults(null); setConfig(DEFAULT_CONFIG); }
      toast.success("Deleted");
      await loadAnalyses();
    } catch { toast.error("Failed to delete"); }
  };

  /* ─── Load saved ─── */
  const loadSaved = (a: SavedAnalysis) => {
    setSelectedId(a.id);
    setAnalysisName(a.name);
    setConfig(a.config);
    setResults(a.results);
  };

  const regionLabel = REGION_PRESETS[config.region]?.label || config.region;

  return (
    <AppShell activeSection={activeSection} onSectionChange={setActiveSection as any}>
      <ScrollArea className="h-full">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              Catalog Analysis
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Analyze Spotify and YouTube publishing estimates by region, with multi-market blending and song-level overrides.
            </p>
          </div>

          <Separator />

          {/* 3-col layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* ── Left: Saved Analyses ── */}
            <div className="lg:col-span-3 space-y-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Saved Analyses</CardTitle>
                  <CardDescription className="text-xs">Click to load a previous analysis</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5 max-h-[400px] overflow-auto">
                  {!user && (
                    <p className="text-xs text-muted-foreground italic">Sign in to save analyses.</p>
                  )}
                  {user && savedAnalyses.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No saved analyses yet.</p>
                  )}
                  {savedAnalyses.map(a => (
                    <div
                      key={a.id}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors group",
                        selectedId === a.id ? "bg-primary/10 text-primary" : "hover:bg-secondary/60 text-muted-foreground"
                      )}
                      onClick={() => loadSaved(a)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{a.name}</p>
                        <p className="text-[10px] opacity-70">{new Date(a.updated_at).toLocaleDateString()}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 text-xs"
                    onClick={() => { setSelectedId(null); setAnalysisName(""); setConfig(DEFAULT_CONFIG); setResults(null); }}
                  >
                    <Plus className="w-3 h-3 mr-1" /> New Analysis
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* ── Middle: Settings & Input ── */}
            <div className="lg:col-span-4 space-y-4">
              {/* Name */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Analysis Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Analysis Name</label>
                    <Input
                      placeholder="e.g. Q4 Deal Evaluation"
                      value={analysisName}
                      onChange={e => setAnalysisName(e.target.value)}
                      className="text-sm"
                    />
                  </div>

                  {/* Region */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Region Model</label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={config.useBlended ? "__blended" : config.region}
                        onValueChange={v => {
                          if (v === "__blended") {
                            setConfig(c => ({ ...c, useBlended: true }));
                          } else {
                            setConfig(c => ({ ...c, region: v, useBlended: false }));
                          }
                        }}
                      >
                        <SelectTrigger className="text-sm flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(REGION_PRESETS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v.label}</SelectItem>
                          ))}
                          <SelectItem value="__blended">Blended (Custom)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Blended weights */}
                  {config.useBlended && (
                    <div className="space-y-2 p-3 bg-secondary/30 rounded-lg">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Blended Region Weights</p>
                      {(config.blendedRegions || []).map((br, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Select
                            value={br.region}
                            onValueChange={v => {
                              const updated = [...(config.blendedRegions || [])];
                              updated[i] = { ...updated[i], region: v };
                              setConfig(c => ({ ...c, blendedRegions: updated }));
                            }}
                          >
                            <SelectTrigger className="text-xs h-8 flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(REGION_PRESETS).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            className="w-16 h-8 text-xs"
                            value={br.weight}
                            onChange={e => {
                              const updated = [...(config.blendedRegions || [])];
                              updated[i] = { ...updated[i], weight: Number(e.target.value) || 0 };
                              setConfig(c => ({ ...c, blendedRegions: updated }));
                            }}
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Discount & Projection */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Discount Rate</label>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[config.discountRate]}
                          onValueChange={([v]) => setConfig(c => ({ ...c, discountRate: v }))}
                          min={0} max={30} step={1}
                          className="flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-8 text-right">{config.discountRate}%</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Projection (yrs)</label>
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[config.projectionYears]}
                          onValueChange={([v]) => setConfig(c => ({ ...c, projectionYears: v }))}
                          min={1} max={10} step={1}
                          className="flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-6 text-right">{config.projectionYears}</span>
                      </div>
                    </div>
                  </div>

                  {/* Active Assumptions */}
                  <div className="p-3 bg-secondary/30 rounded-lg space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Active Assumptions</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        Spotify: ${effectiveRates.spotifyRate.toFixed(4)}/stream
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        YouTube: ${effectiveRates.ytRate.toFixed(4)}/view
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Discount: {config.discountRate}%
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {config.projectionYears}yr projection
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Catalog JSON */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileJson className="w-4 h-4" /> Catalog JSON
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Paste an array of songs with title, artist, spotifyPopularity or spotifyStreams, youtubeViews, publishingShare, releaseDate
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder={`[\n  {\n    "title": "Song Name",\n    "artist": "Artist",\n    "spotifyPopularity": 65,\n    "youtubeViews": "5,000,000",\n    "publishingShare": 50,\n    "releaseDate": "2022-03-15"\n  }\n]`}
                    className="min-h-[200px] font-mono text-xs"
                    value={config.catalogJson}
                    onChange={e => setConfig(c => ({ ...c, catalogJson: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button onClick={runAnalysis} className="flex-1 text-sm">
                      <TrendingUp className="w-4 h-4 mr-1" /> Run Analysis
                    </Button>
                    <Button onClick={handleSave} variant="outline" className="text-sm" disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                      {selectedId ? "Update" : "Save"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Right: Results ── */}
            <div className="lg:col-span-5 space-y-4">
              {!results ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Paste catalog JSON and run analysis to see results.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <Card>
                      <CardContent className="py-4 px-4">
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="w-4 h-4 text-primary" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Pub Revenue</span>
                        </div>
                        <p className="text-xl font-bold text-foreground">{formatCurrency(results.totalCatalogValue)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-4 px-4">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="w-4 h-4 text-primary" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{config.projectionYears}yr NPV</span>
                        </div>
                        <p className="text-xl font-bold text-foreground">{formatCurrency(results.totalProjectedValue)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-4 px-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Music className="w-4 h-4 text-primary" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Songs Analyzed</span>
                        </div>
                        <p className="text-xl font-bold text-foreground">{results.songCount}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="py-4 px-4">
                        <div className="flex items-center gap-2 mb-1">
                          <RefreshCw className="w-4 h-4 text-primary" />
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Annual Rate</span>
                        </div>
                        <p className="text-xl font-bold text-foreground">{formatCurrency(results.totalAnnualRate)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Excluded */}
                  {results.excludedCount > 0 && (
                    <Card className="border-destructive/30">
                      <CardContent className="py-3 px-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <span className="text-xs text-muted-foreground">
                          {results.excludedCount} song{results.excludedCount > 1 ? "s" : ""} excluded from totals
                        </span>
                      </CardContent>
                    </Card>
                  )}

                  {/* Results Table */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Song-Level Results</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[500px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Song</TableHead>
                              <TableHead className="text-xs text-right">Streams</TableHead>
                              <TableHead className="text-xs text-right">Pub Rev</TableHead>
                              <TableHead className="text-xs text-right">Annual</TableHead>
                              <TableHead className="text-xs text-right">NPV</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {results.songs.map((s, i) => (
                              <TableRow key={i} className={cn(s.excluded && "opacity-40 line-through")}>
                                <TableCell className="text-xs">
                                  <p className="font-medium truncate max-w-[140px]">{s.title}</p>
                                  <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{s.artist}</p>
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono">
                                  {s.estSpotifyStreams >= 1_000_000
                                    ? (s.estSpotifyStreams / 1_000_000).toFixed(1) + "M"
                                    : s.estSpotifyStreams >= 1_000
                                    ? (s.estSpotifyStreams / 1_000).toFixed(0) + "K"
                                    : s.estSpotifyStreams}
                                </TableCell>
                                <TableCell className="text-xs text-right font-mono">{formatCurrency(s.totalPubRevenue)}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{formatCurrency(s.annualRate)}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{formatCurrency(s.projectedValue)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </AppShell>
  );
}
