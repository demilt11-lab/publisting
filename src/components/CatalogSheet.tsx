import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Loader2, Music, FileSpreadsheet, RefreshCw, Search, DollarSign, TrendingUp, PiggyBank, BarChart3, Calendar, Clock, Users } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { CatalogSong, CatalogCreditInfo, CatalogData, fetchCatalog } from "@/lib/api/catalogLookup";
import { fetchStreamingStats } from "@/lib/api/streamingStats";
import { lookupPro } from "@/lib/api/songLookup";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateSongRevenue,
  formatCurrency,
  SongRevenue,
  SPOTIFY_PUB_RATE,
  YOUTUBE_PUB_RATE,
} from "@/lib/publishingRevenue";
import * as XLSX from "xlsx";

interface CatalogSheetProps {
  name: string;
  role: string;
  onClose: () => void;
}

function formatNumber(num: number | null | undefined): string {
  if (num == null || isNaN(num)) return "—";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString();
}

function formatNumberWithCommas(num: number | null | undefined): string {
  if (num == null || isNaN(num)) return "";
  return num.toLocaleString();
}

function formatDateDMY(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getUTCDate();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return dateStr;
  }
}

export const CatalogSheet = ({ name, role, onClose }: CatalogSheetProps) => {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [enrichedSongs, setEnrichedSongs] = useState<CatalogSong[]>([]);
  const [enrichingCount, setEnrichingCount] = useState(0);
  const [totalToEnrich, setTotalToEnrich] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [revenueView, setRevenueView] = useState<"lifetime" | "annual">("lifetime");
  const cancelledRef = useRef(false);

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return enrichedSongs;
    const q = searchQuery.toLowerCase();
    return enrichedSongs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.album && s.album.toLowerCase().includes(q)) ||
        (s.releaseDate && s.releaseDate.toLowerCase().includes(q))
    );
  }, [enrichedSongs, searchQuery]);

  // Compute per-song revenue and portfolio totals
  const songRevenues = useMemo(() => {
    const map = new Map<number, SongRevenue>();
    enrichedSongs.forEach((song) => {
      // YouTube fallback: if no Spotify data, estimate streams from YouTube views (YT views * 3)
      let ytFallbackStreams: number | undefined;
      if (!song.spotifyStreamCount && !song.spotifyStreams && song.youtubeViews) {
        const ytViews = parseInt((song.youtubeViews || '0').replace(/,/g, ''), 10);
        if (ytViews > 0) ytFallbackStreams = ytViews * 3;
      }

      const rev = song.spotifyStreamCount || ytFallbackStreams
        ? calculateSongRevenue(
            song.spotifyStreams,
            song.youtubeViews,
            song.publishingShare,
            song.releaseDate,
            song.spotifyStreamCount ?? ytFallbackStreams
          )
        : calculateSongRevenue(
            song.spotifyStreams,
            song.youtubeViews,
            song.publishingShare,
            song.releaseDate
          );
      if (rev) map.set(song.id, rev);
    });
    return map;
  }, [enrichedSongs]);

  const portfolioTotals = useMemo(() => {
    let totalRevenue = 0;
    let ownerCollected = 0;
    let available = 0;
    let threeYear = 0;
    let annualRevenue = 0;
    let annualOwner = 0;
    let annualAvailable = 0;
    songRevenues.forEach((rev) => {
      totalRevenue += rev.totalPubRevenue;
      ownerCollected += rev.ownerShare;
      available += rev.availableToCollect;
      threeYear += rev.threeYearProjection;
      annualRevenue += rev.annualRate;
      const totalSafe = rev.totalPubRevenue || 1;
      annualOwner += rev.annualRate * (rev.ownerShare / totalSafe);
      annualAvailable += rev.annualRate * (rev.availableToCollect / totalSafe);
    });
    return { totalRevenue, ownerCollected, available, threeYear, annualRevenue, annualOwner, annualAvailable };
  }, [songRevenues]);

  // Top 10 earning tracks for chart
  const topEarningTracks = useMemo(() => {
    const isAnnual = revenueView === "annual";
    return enrichedSongs
      .map((song) => {
        const rev = songRevenues.get(song.id);
        if (!rev) return null;
        const total = isAnnual ? rev.annualRate : rev.totalPubRevenue;
        if (!isFinite(total) || isNaN(total) || total <= 0) return null;
        const ownerRatio = rev.totalPubRevenue > 0 ? rev.ownerShare / rev.totalPubRevenue : 0;
        const availRatio = rev.totalPubRevenue > 0 ? rev.availableToCollect / rev.totalPubRevenue : 0;
        return {
          title: song.title.length > 20 ? song.title.slice(0, 18) + "…" : song.title,
          totalPubRevenue: total,
          ownerShare: total * ownerRatio,
          available: total * availRatio,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.totalPubRevenue - a.totalPubRevenue)
      .slice(0, 10);
  }, [enrichedSongs, songRevenues, revenueView]);

  // Platform revenue split for pie chart
  const platformRevenue = useMemo(() => {
    let spotify = 0;
    let youtube = 0;
    songRevenues.forEach((rev) => {
      spotify += rev.estSpotifyStreams * SPOTIFY_PUB_RATE;
      youtube += rev.youtubeViews * YOUTUBE_PUB_RATE;
    });
    if (spotify === 0 && youtube === 0) return [];
    return [
      { name: "Spotify", value: spotify, color: "hsl(141, 73%, 42%)" },
      { name: "YouTube", value: youtube, color: "hsl(0, 72%, 51%)" },
    ];
  }, [songRevenues]);

  const isEnrichmentDone = enrichingCount >= totalToEnrich && totalToEnrich > 0;


  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setEnrichedSongs([]);
    setEnrichingCount(0);
    cancelledRef.current = false;

    const data = await fetchCatalog(name, role);
    if (cancelledRef.current) return;

    if (!data || data.songs.length === 0) {
      setError(data ? `No catalog data found for "${name}". Try searching for a song by this artist first.` : `Failed to fetch catalog for "${name}". Please try again.`);
      setIsLoading(false);
      return;
    }

    setCatalog(data);
    setEnrichedSongs(data.songs);
    setIsLoading(false);

    // Phase 0: Cross-reference all unique credit names with PRO lookup for publisher/IPI info
    const proDataMap = new Map<string, { publisher?: string; pro?: string; ipi?: string }>();
    if (data.allCreditNames && data.allCreditNames.length > 0) {
      console.log(`PRO cross-referencing ${data.allCreditNames.length} unique credit names...`);
      try {
        // Batch PRO lookup in chunks of 20 names
        const PRO_BATCH = 20;
        for (let i = 0; i < data.allCreditNames.length; i += PRO_BATCH) {
          if (cancelledRef.current) return;
          const nameBatch = data.allCreditNames.slice(i, i + PRO_BATCH);
          const proResult = await lookupPro(nameBatch);
          if (proResult.success && proResult.data) {
            for (const [creditName, info] of Object.entries(proResult.data)) {
              proDataMap.set(creditName.toLowerCase(), {
                publisher: info.publisher,
                pro: info.pro,
                ipi: info.ipi,
              });
            }
          }
        }
        console.log(`PRO data found for ${proDataMap.size} credits`);

        // Apply PRO data to song credits
        const updatedSongs = data.songs.map(song => {
          if (!song.credits) return song;
          const enrichedCredits: CatalogCreditInfo[] = song.credits.map(credit => {
            const proInfo = proDataMap.get(credit.name.toLowerCase());
            return {
              ...credit,
              publisher: proInfo?.publisher || credit.publisher,
              pro: proInfo?.pro || credit.pro,
              ipi: proInfo?.ipi || credit.ipi,
            };
          });
          return { ...song, credits: enrichedCredits };
        });
        setEnrichedSongs([...updatedSongs]);
        // Update enriched reference for streaming stats phase
        for (let i = 0; i < updatedSongs.length; i++) {
          data.songs[i] = updatedSongs[i];
        }
      } catch (e) {
        console.error('PRO cross-reference failed:', e);
      }
    }

    // Phase 1: Progressively enrich with streaming stats and publishing shares
    setTotalToEnrich(data.songs.length);
    const BATCH_SIZE = 8;
    const enriched = [...data.songs];
    const enrichedKeys = new Set<string>();

    for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
      if (cancelledRef.current) return;

      const batch = enriched.slice(i, i + BATCH_SIZE).filter((song) => {
        const key = `${song.title.toLowerCase()}::${song.artist.toLowerCase()}`;
        if (enrichedKeys.has(key)) return false;
        enrichedKeys.add(key);
        return true;
      });

      if (batch.length === 0) {
        setEnrichingCount(Math.min(i + BATCH_SIZE, enriched.length));
        continue;
      }

      const results = await Promise.allSettled(
        batch.map(async (song) => {
          if (cancelledRef.current) throw new Error("cancelled");

          const stats = await fetchStreamingStats(song.title, song.artist);

          let publishingShare: number | null = song.publishingShare ?? null;
          // Also pass all credit names for better MLC matching
          const creditNames = song.credits
            ? song.credits.map(c => c.name)
            : [name];
          try {
            const { data: sharesData } = await supabase.functions.invoke("mlc-shares-lookup", {
              body: {
                songTitle: song.title,
                artist: song.artist,
                writerNames: creditNames,
              },
            });
            if (sharesData?.success && sharesData?.data?.shares) {
              // Find share for the catalog owner
              const match = sharesData.data.shares.find(
                (s: any) => s.name.toLowerCase() === name.toLowerCase()
              );
              if (match) publishingShare = match.share;

              // Also apply shares to individual credits
              if (song.credits && sharesData.data.shares.length > 0) {
                song.credits = song.credits.map((credit: CatalogCreditInfo) => {
                  const shareMatch = sharesData.data.shares.find(
                    (s: any) => s.name.toLowerCase() === credit.name.toLowerCase()
                  );
                  return shareMatch?.share
                    ? { ...credit, share: shareMatch.share }
                    : credit;
                });
              }
            }
          } catch {
            // ignore share lookup failures
          }

          return {
            ...song,
            spotifyStreams: stats?.spotify?.popularity != null
              ? `${stats.spotify.popularity}/100`
              : null,
            spotifyStreamCount: stats?.spotify?.streamCount ?? stats?.spotify?.estimatedStreams ?? null,
            isExactSpotifyCount: stats?.spotify?.isExactStreamCount ?? false,
            youtubeViews: stats?.youtube?.viewCount || null,
            publishingShare,
          };
        })
      );

      if (cancelledRef.current) return;

      results.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          const songId = batch[idx].id;
          const enrichedIdx = enriched.findIndex((s) => s.id === songId);
          if (enrichedIdx >= 0) {
            enriched[enrichedIdx] = result.value;
          }
        }
      });

      setEnrichedSongs([...enriched]);
      setEnrichingCount(Math.min(i + BATCH_SIZE, enriched.length));
    }
    if (!cancelledRef.current) {
      setEnrichingCount(enriched.length);
    }
  }, [name, role]);

  useEffect(() => {
    loadCatalog();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadCatalog]);

  const handleClose = useCallback(() => {
    cancelledRef.current = true;
    onClose();
  }, [onClose]);

  const handleExportExcel = useCallback(() => {
    if (!enrichedSongs.length) return;

    const rows = enrichedSongs.map((song) => {
      const rev = songRevenues.get(song.id);
      const hasPubShare = song.publishingShare != null;
      const writers = song.credits?.filter(c => c.role === 'writer').map(c => {
        let info = c.name;
        if (c.publisher) info += ` (${c.publisher})`;
        if (c.share) info += ` [${c.share}%]`;
        return info;
      }).join('; ') || '';
      const producers = song.credits?.filter(c => c.role === 'producer').map(c => c.name).join('; ') || '';
      const publishers = [...new Set(song.credits?.filter(c => c.publisher).map(c => c.publisher) || [])].join('; ');

      return {
        "Song Title": song.title,
        Artist: song.artist,
        Album: song.album || "",
        "Release Date": formatDateDMY(song.releaseDate),
        "Credit Role": song.role,
        "Label / Company": song.recordLabel || "",
        "Writers": writers,
        "Producers": producers,
        "Publishers": publishers,
        [song.isExactSpotifyCount ? "Spotify Streams (Exact)" : "Est. Spotify Streams"]: rev ? formatNumberWithCommas(rev.estSpotifyStreams) : "",
        "YouTube Views": song.youtubeViews ? formatNumberWithCommas(parseInt(song.youtubeViews.replace(/,/g, ""))) : "",
        [`${name} Pub %`]: hasPubShare ? `${song.publishingShare}%` : "",
        [`${name} Collected`]: hasPubShare && rev ? `$${rev.ownerShare.toFixed(2)}` : "",
        "Available to Collect": hasPubShare && rev ? `$${rev.availableToCollect.toFixed(2)}` : "",
        "Est. Annual Rate": hasPubShare && rev ? `$${rev.annualRate.toFixed(2)}` : "",
        "3-Year Projection": hasPubShare && rev ? `$${rev.threeYearProjection.toFixed(2)}` : "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    const colWidths = Object.keys(rows[0]).map((key) => ({
      wch: Math.max(
        key.length,
        ...rows.map((r) => String((r as any)[key]).length)
      ) + 2,
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${name} Catalog`);
    XLSX.writeFile(wb, `${name.replace(/\s+/g, "_")}_Catalog.xlsx`);
  }, [enrichedSongs, songRevenues, name]);

  // Safe revenue value helper - guards against NaN/Infinity
  const safeRevenue = (val: number): string => {
    if (!isFinite(val) || isNaN(val)) return "$0";
    return formatCurrency(val);
  };

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 w-full max-w-full animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Music className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">{name}</h2>
            <p className="text-xs text-muted-foreground capitalize">
              {role} • {enrichedSongs.length} songs
              {enrichingCount < totalToEnrich && totalToEnrich > 0 && (
                <span className="ml-2 text-primary">
                  Enriching {enrichingCount}/{totalToEnrich}...
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Refresh failed rows button (3b) */}
          {isEnrichmentDone && enrichedSongs.some(s => s.spotifyStreams === null && s.youtubeViews === null) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Re-run enrichment for failed rows
                cancelledRef.current = false;
                const failedSongs = enrichedSongs.filter(s => s.spotifyStreams === null && s.youtubeViews === null);
                if (failedSongs.length === 0) return;
                setTotalToEnrich(prev => prev + failedSongs.length);
                setEnrichingCount(prev => prev - failedSongs.length);
                
                (async () => {
                  const BATCH = 8;
                  const enriched = [...enrichedSongs];
                  for (let i = 0; i < failedSongs.length; i += BATCH) {
                    if (cancelledRef.current) return;
                    const batch = failedSongs.slice(i, i + BATCH);
                    const results = await Promise.allSettled(
                      batch.map(async (song) => {
                        const stats = await fetchStreamingStats(song.title, song.artist);
                        return {
                          ...song,
                          spotifyStreams: stats?.spotify?.popularity != null ? `${stats.spotify.popularity}/100` : null,
                          spotifyStreamCount: stats?.spotify?.streamCount ?? stats?.spotify?.estimatedStreams ?? null,
                          isExactSpotifyCount: stats?.spotify?.isExactStreamCount ?? false,
                          youtubeViews: stats?.youtube?.viewCount || null,
                        };
                      })
                    );
                    results.forEach((result, idx) => {
                      if (result.status === 'fulfilled') {
                        const songId = batch[idx].id;
                        const eIdx = enriched.findIndex(s => s.id === songId);
                        if (eIdx >= 0) enriched[eIdx] = result.value;
                      }
                    });
                    setEnrichedSongs([...enriched]);
                    setEnrichingCount(prev => prev + batch.length);
                  }
                })();
              }}
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Refresh Failed
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={isLoading || enrichedSongs.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Export Excel
          </Button>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            Fetching catalog from Genius...
          </p>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={loadCatalog}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Revenue View Toggle + Summary Panel */}
      {!isLoading && enrichedSongs.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground font-medium">Revenue View</span>
            <div className="flex items-center gap-1 rounded-lg bg-secondary/60 border border-border/50 p-0.5">
              <button
                onClick={() => setRevenueView("lifetime")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${revenueView === "lifetime" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Clock className="w-3 h-3" /> Lifetime
              </button>
              <button
                onClick={() => setRevenueView("annual")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${revenueView === "annual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Calendar className="w-3 h-3" /> Annual
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="p-3 rounded-xl bg-secondary/60 border border-border/50">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">{revenueView === "lifetime" ? "Total Pub Revenue" : "Annual Revenue"}</span>
              </div>
              {!isEnrichmentDone ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-lg font-bold text-foreground">{safeRevenue(revenueView === "lifetime" ? portfolioTotals.totalRevenue : portfolioTotals.annualRevenue)}</p>
              )}
            </div>
            <div className="p-3 rounded-xl bg-secondary/60 border border-border/50">
              <div className="flex items-center gap-1.5 mb-1">
                <PiggyBank className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">{name}'s Share{revenueView === "annual" ? " /yr" : ""}</span>
              </div>
              {!isEnrichmentDone ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-lg font-bold text-foreground">{safeRevenue(revenueView === "lifetime" ? portfolioTotals.ownerCollected : portfolioTotals.annualOwner)}</p>
              )}
            </div>
            <div className="p-3 rounded-xl bg-secondary/60 border border-border/50">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">{revenueView === "lifetime" ? "Available to Collect" : "Available /yr"}</span>
              </div>
              {!isEnrichmentDone ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-lg font-bold text-foreground">{safeRevenue(revenueView === "lifetime" ? portfolioTotals.available : portfolioTotals.annualAvailable)}</p>
              )}
            </div>
            <div className="p-3 rounded-xl bg-secondary/60 border border-border/50">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">3-Year Projection</span>
              </div>
              {!isEnrichmentDone ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-lg font-bold text-foreground">{safeRevenue(portfolioTotals.threeYear)}</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Methodology note */}
      {isEnrichmentDone && portfolioTotals.totalRevenue > 0 && (
        <p className="text-[10px] text-muted-foreground mb-4 leading-relaxed">
          Estimates use industry-average publishing rates: Spotify ${SPOTIFY_PUB_RATE}/stream, YouTube ${YOUTUBE_PUB_RATE}/view.
          Spotify streams are estimated from popularity index. 3-year projection annualises lifetime revenue and multiplies by 3.
          These are rough estimates — actual royalties vary by territory, deal terms, and collection efficiency.
        </p>
      )}

      {/* Revenue Bar Chart - show skeleton during enrichment */}
      {!isEnrichmentDone && enrichedSongs.length > 0 && (
        <div className="mb-5 p-4 rounded-xl bg-secondary/40 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Top Earning Tracks</h3>
          </div>
          <div className="h-[220px] flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Building chart... {enrichingCount}/{totalToEnrich}</p>
            </div>
          </div>
        </div>
      )}
      {isEnrichmentDone && topEarningTracks.length > 0 && (
        <div className="mb-5 p-4 rounded-xl bg-secondary/40 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Top Earning Tracks</h3>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topEarningTracks} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="title" width={130} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  formatter={(value: number, n: string) => [formatCurrency(value), n === 'ownerShare' ? 'Collected' : n === 'available' ? 'Available' : 'Total']}
                  contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="ownerShare" stackId="a" name="Collected" radius={[0, 0, 0, 0]} fill="hsl(var(--primary))" />
                <Bar dataKey="available" stackId="a" name="Available" radius={[0, 4, 4, 0]} fill="hsl(var(--primary) / 0.35)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-2 rounded-sm bg-primary" /> Collected
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-2 rounded-sm bg-primary/35" /> Available
            </div>
          </div>
        </div>
      )}

      {/* Platform Revenue Pie Chart */}
      {isEnrichmentDone && platformRevenue.length > 0 && (
        <div className="mb-5 p-4 rounded-xl bg-secondary/40 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <Music className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Revenue by Platform</h3>
          </div>
          <div className="flex items-center justify-center gap-8">
            <div className="h-[180px] w-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={platformRevenue}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                  >
                    {platformRevenue.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--foreground))' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-3">
              {platformRevenue.map((p) => {
                const total = platformRevenue.reduce((s, x) => s + x.value, 0);
                const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
                return (
                  <div key={p.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(p.value)} ({pct}%)</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {!isLoading && enrichedSongs.length > 0 && (
        <>
          {/* Search / Filter */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Filter by title, artist, album, or date..."
              defaultValue={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                // Debounce filter by 200ms
                if ((window as any).__catalogFilterTimer) clearTimeout((window as any).__catalogFilterTimer);
                (window as any).__catalogFilterTimer = setTimeout(() => setSearchQuery(val), 200);
              }}
              className="pl-9"
            />
            {searchQuery && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {filteredSongs.length}/{enrichedSongs.length}
              </span>
            )}
          </div>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <Table className="min-w-[1600px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Song</TableHead>
                <TableHead>Artist</TableHead>
                <TableHead>Release</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Label / Company</TableHead>
                <TableHead>Writers / Producers</TableHead>
                <TableHead>Publisher(s)</TableHead>
                <TableHead className="text-right">Spotify</TableHead>
                <TableHead className="text-right">YouTube</TableHead>
                <TableHead className="text-right">Pub %</TableHead>
                <TableHead className="text-right">{revenueView === "lifetime" ? "Collected" : "Collected /yr"}</TableHead>
                <TableHead className="text-right">{revenueView === "lifetime" ? "Available" : "Available /yr"}</TableHead>
                <TableHead className="text-right">3yr Proj.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSongs.map((song, idx) => {
                const isEnrichmentEdge = enrichingCount < totalToEnrich && idx === enrichingCount - 1;
                const rev = songRevenues.get(song.id);
                const isEnrichingRow = song.spotifyStreams === undefined;
                return (
                <TableRow key={song.id}>
                  <TableCell className="text-muted-foreground text-xs">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-medium text-sm max-w-[180px] truncate">
                    {song.url ? (
                      <a
                        href={song.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary transition-colors"
                      >
                        {song.title}
                      </a>
                    ) : (
                      song.title
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                    {song.artist}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateDMY(song.releaseDate) || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className={`text-[10px] ${
                      song.role === 'writer' ? 'bg-blue-500/15 text-blue-400 border-blue-500/25' :
                      song.role === 'producer' ? 'bg-purple-500/15 text-purple-400 border-purple-500/25' :
                      song.role === 'featured' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
                      'bg-muted text-muted-foreground border-border'
                    }`}>
                      {song.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-[150px] truncate">
                    {song.recordLabel ? (
                      <span className="text-foreground">{song.recordLabel}</span>
                    ) : (
                      <span className="text-muted-foreground italic">Unknown</span>
                    )}
                  </TableCell>
                  {/* Credits columns */}
                  <TableCell className="text-xs max-w-[200px]">
                    {song.credits && song.credits.length > 0 ? (
                      <div className="space-y-0.5">
                        {song.credits.filter(c => c.role === 'writer').slice(0, 3).map((c, i) => (
                          <div key={`w-${i}`} className="flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                            <span className="truncate">{c.name}</span>
                            {c.share && <span className="text-violet-400 flex-shrink-0">{c.share}%</span>}
                          </div>
                        ))}
                        {song.credits.filter(c => c.role === 'producer').slice(0, 2).map((c, i) => (
                          <div key={`p-${i}`} className="flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-purple-400 flex-shrink-0" />
                            <span className="truncate text-muted-foreground">{c.name}</span>
                          </div>
                        ))}
                        {(song.credits.filter(c => c.role === 'writer').length > 3 || song.credits.filter(c => c.role === 'producer').length > 2) && (
                          <span className="text-[10px] text-muted-foreground">+{song.credits.length - 5} more</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-[150px]">
                    {(() => {
                      const publishers = [...new Set(song.credits?.filter(c => c.publisher).map(c => c.publisher) || [])];
                      if (publishers.length === 0) return <span className="text-muted-foreground italic">Unknown</span>;
                      return (
                        <div className="space-y-0.5">
                          {publishers.slice(0, 3).map((pub, i) => (
                            <div key={i} className="truncate text-foreground">{pub}</div>
                          ))}
                          {publishers.length > 3 && <span className="text-[10px] text-muted-foreground">+{publishers.length - 3} more</span>}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {(() => {
                      if (!song.credits || song.credits.length === 0) return <span className="text-muted-foreground">—</span>;
                      const total = song.credits.length;
                      const signed = song.credits.filter(c => c.publisher).length;
                      const pct = Math.round(signed / total * 100);
                      const color = pct >= 75 ? "text-emerald-400" : pct >= 40 ? "text-yellow-400" : "text-red-400";
                      return (
                        <Badge variant="outline" className={`text-[10px] ${color}`}>
                          {signed}/{total} ({pct}%)
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {isEnrichingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                    ) : song.spotifyStreamCount ? (
                      <span className={song.isExactSpotifyCount ? "text-green-400" : "text-muted-foreground"}>
                        {song.isExactSpotifyCount ? "" : "~"}{formatNumber(song.spotifyStreamCount)}{song.isExactSpotifyCount ? " ✓" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{song.spotifyStreams || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {isEnrichingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                    ) : (
                      <span className="text-muted-foreground">
                        {song.youtubeViews ? formatNumber(parseInt(song.youtubeViews.replace(/,/g, ""))) : "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {isEnrichingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                    ) : song.publishingShare != null ? (
                      <Badge
                        variant="outline"
                        className="text-xs bg-violet-500/20 text-violet-400 border-violet-500/30"
                      >
                        {song.publishingShare}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {/* Revenue columns - only show if pub % exists */}
                  {(() => {
                    const hasPubShare = song.publishingShare != null;
                    const isAnnual = revenueView === "annual";
                    const ownerRatio = rev && rev.totalPubRevenue > 0 ? rev.ownerShare / rev.totalPubRevenue : 0;
                    const availRatio = rev && rev.totalPubRevenue > 0 ? rev.availableToCollect / rev.totalPubRevenue : 0;
                    const totalVal = rev ? (isAnnual ? rev.annualRate : rev.totalPubRevenue) : 0;
                    const ownerVal = rev ? (isAnnual ? rev.annualRate * ownerRatio : rev.ownerShare) : 0;
                    const availVal = rev ? (isAnnual ? rev.annualRate * availRatio : rev.availableToCollect) : 0;
                    return (
                      <>
                        <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                          {isEnrichingRow ? (
                            <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                          ) : hasPubShare && rev ? (
                            <span className="text-emerald-400">{safeRevenue(totalVal)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                          {isEnrichingRow ? (
                            <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                          ) : hasPubShare && rev ? (
                            <span className="text-primary">{safeRevenue(ownerVal)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                          {isEnrichingRow ? (
                            <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                          ) : hasPubShare && rev ? (
                            <span className="text-amber-400">{safeRevenue(availVal)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                          {isEnrichingRow ? (
                            <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                          ) : hasPubShare && rev ? (
                            <span className="text-blue-400">{safeRevenue(rev.threeYearProjection)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </>
                    );
                  })()}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
      )}
    </div>
  );
};
