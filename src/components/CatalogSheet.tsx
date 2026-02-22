import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Loader2, Music, FileSpreadsheet, RefreshCw, Search, DollarSign, TrendingUp, PiggyBank, BarChart3 } from "lucide-react";
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
import { CatalogSong, CatalogData, fetchCatalog } from "@/lib/api/catalogLookup";
import { fetchStreamingStats } from "@/lib/api/streamingStats";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateSongRevenue,
  formatCurrency,
  estimateSpotifyStreams,
  parseSpotifyPopularity,
  parseYouTubeViews,
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
  if (!num) return "—";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

export const CatalogSheet = ({ name, role, onClose }: CatalogSheetProps) => {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [enrichedSongs, setEnrichedSongs] = useState<CatalogSong[]>([]);
  const [enrichingCount, setEnrichingCount] = useState(0);
  const [totalToEnrich, setTotalToEnrich] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastEnrichedRef = useRef<HTMLTableRowElement>(null);

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
      const rev = calculateSongRevenue(
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
    songRevenues.forEach((rev) => {
      totalRevenue += rev.totalPubRevenue;
      ownerCollected += rev.ownerShare;
      available += rev.availableToCollect;
      threeYear += rev.threeYearProjection;
    });
    return { totalRevenue, ownerCollected, available, threeYear };
  }, [songRevenues]);

  // Top 10 earning tracks for chart
  const topEarningTracks = useMemo(() => {
    return enrichedSongs
      .map((song) => {
        const rev = songRevenues.get(song.id);
        return { title: song.title.length > 20 ? song.title.slice(0, 18) + "…" : song.title, totalPubRevenue: rev?.totalPubRevenue ?? 0, ownerShare: rev?.ownerShare ?? 0, available: rev?.availableToCollect ?? 0 };
      })
      .filter((s) => s.totalPubRevenue > 0)
      .sort((a, b) => b.totalPubRevenue - a.totalPubRevenue)
      .slice(0, 10);
  }, [enrichedSongs, songRevenues]);

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

    const data = await fetchCatalog(name, role);
    if (!data || data.songs.length === 0) {
      setError(data ? "No catalog data found for this person." : "Failed to fetch catalog.");
      setIsLoading(false);
      return;
    }

    setCatalog(data);
    setEnrichedSongs(data.songs);
    setIsLoading(false);

    // Progressively enrich with streaming stats and publishing shares
    setTotalToEnrich(data.songs.length);
    const BATCH_SIZE = 3;
    const enriched = [...data.songs];

    for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
      const batch = enriched.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (song) => {
          const stats = await fetchStreamingStats(song.title, song.artist);

          let publishingShare: number | null = null;
          try {
            const { data: sharesData } = await supabase.functions.invoke("mlc-shares-lookup", {
              body: {
                songTitle: song.title,
                artist: song.artist,
                writerNames: [name],
              },
            });
            if (sharesData?.success && sharesData?.data?.shares) {
              const match = sharesData.data.shares.find(
                (s: any) => s.name.toLowerCase() === name.toLowerCase()
              );
              if (match) publishingShare = match.share;
            }
          } catch {
            // ignore
          }

          return {
            ...song,
            spotifyStreams: stats?.spotify?.popularity != null
              ? `${stats.spotify.popularity}/100`
              : null,
            youtubeViews: stats?.youtube?.viewCount || null,
            publishingShare,
          };
        })
      );

      results.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          enriched[i + idx] = result.value;
        }
      });

      setEnrichedSongs([...enriched]);
      setEnrichingCount(Math.min(i + BATCH_SIZE, enriched.length));

      requestAnimationFrame(() => {
        lastEnrichedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    setEnrichingCount(enriched.length);
  }, [name, role]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const handleExportExcel = () => {
    if (!enrichedSongs.length) return;

    const rows = enrichedSongs.map((song, idx) => {
      const rev = songRevenues.get(song.id);
      return {
        "#": idx + 1,
        "Song Title": song.title,
        Artist: song.artist,
        Album: song.album || "",
        "Release Date": song.releaseDate || "",
        "Credit Role": song.role,
        "Spotify Popularity": song.spotifyStreams || "",
        "Est. Spotify Streams": rev ? rev.estSpotifyStreams : "",
        "YouTube Views": song.youtubeViews || "",
        [`${name} Pub %`]: song.publishingShare != null ? `${song.publishingShare}%` : "",
        "Total Pub Revenue": rev ? `$${rev.totalPubRevenue.toFixed(2)}` : "",
        [`${name} Collected`]: rev ? `$${rev.ownerShare.toFixed(2)}` : "",
        "Available to Collect": rev ? `$${rev.availableToCollect.toFixed(2)}` : "",
        "Est. Annual Rate": rev ? `$${rev.annualRate.toFixed(2)}` : "",
        "3-Year Projection": rev ? `$${rev.threeYearProjection.toFixed(2)}` : "",
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
  };

  return (
    <div className="glass rounded-2xl p-6 max-w-5xl mx-auto animate-fade-up">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={isLoading || enrichedSongs.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Export Excel
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
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

      {/* Revenue Summary Panel */}
      {!isLoading && enrichedSongs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="p-3 rounded-xl bg-secondary/60 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Total Pub Revenue</span>
            </div>
            {!isEnrichmentDone ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-lg font-bold text-foreground">{formatCurrency(portfolioTotals.totalRevenue)}</p>
            )}
          </div>
          <div className="p-3 rounded-xl bg-secondary/60 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <PiggyBank className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">{name}'s Share</span>
            </div>
            {!isEnrichmentDone ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-lg font-bold text-foreground">{formatCurrency(portfolioTotals.ownerCollected)}</p>
            )}
          </div>
          <div className="p-3 rounded-xl bg-secondary/60 border border-border/50">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Available to Collect</span>
            </div>
            {!isEnrichmentDone ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-lg font-bold text-foreground">{formatCurrency(portfolioTotals.available)}</p>
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
              <p className="text-lg font-bold text-foreground">{formatCurrency(portfolioTotals.threeYear)}</p>
            )}
          </div>
        </div>
      )}

      {/* Methodology note */}
      {isEnrichmentDone && portfolioTotals.totalRevenue > 0 && (
        <p className="text-[10px] text-muted-foreground mb-4 leading-relaxed">
          Estimates use industry-average publishing rates: Spotify ${SPOTIFY_PUB_RATE}/stream, YouTube ${YOUTUBE_PUB_RATE}/view.
          Spotify streams are estimated from popularity index. 3-year projection annualises lifetime revenue and multiplies by 3.
          These are rough estimates — actual royalties vary by territory, deal terms, and collection efficiency.
        </p>
      )}

      {/* Revenue Bar Chart */}
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
                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {filteredSongs.length}/{enrichedSongs.length}
              </span>
            )}
          </div>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto" ref={scrollAreaRef}>
          <Table className="min-w-[1400px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Song</TableHead>
                <TableHead>Artist</TableHead>
                <TableHead>Release</TableHead>
                <TableHead className="text-right">Spotify</TableHead>
                <TableHead className="text-right">YouTube</TableHead>
                <TableHead className="text-right">Pub %</TableHead>
                <TableHead className="text-right">Total Pub $</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">3yr Proj.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSongs.map((song, idx) => {
                const isEnrichmentEdge = enrichingCount < totalToEnrich && idx === enrichingCount - 1;
                const rev = songRevenues.get(song.id);
                const isEnrichingRow = song.spotifyStreams === undefined;
                return (
                <TableRow key={song.id} ref={isEnrichmentEdge ? lastEnrichedRef : undefined}>
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
                    {song.releaseDate || "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {isEnrichingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
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
                  {/* Revenue columns */}
                  <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                    {isEnrichingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                    ) : rev ? (
                      <span className="text-emerald-400">{formatCurrency(rev.totalPubRevenue)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                    {isEnrichingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                    ) : rev ? (
                      <span className="text-primary">{formatCurrency(rev.ownerShare)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                    {isEnrichingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                    ) : rev ? (
                      <span className="text-amber-400">{formatCurrency(rev.availableToCollect)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium whitespace-nowrap">
                    {isEnrichingRow ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                    ) : rev ? (
                      <span className="text-blue-400">{formatCurrency(rev.threeYearProjection)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
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
