import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Download, Loader2, Music, FileSpreadsheet, RefreshCw, Search } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { CatalogSong, CatalogData, fetchCatalog } from "@/lib/api/catalogLookup";
import { fetchStreamingStats } from "@/lib/api/streamingStats";
import { supabase } from "@/integrations/supabase/client";
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
          // Fetch streaming stats
          const stats = await fetchStreamingStats(song.title, song.artist);

          // Fetch publishing share
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

      // Auto-scroll to show enrichment progress
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

    const rows = enrichedSongs.map((song, idx) => ({
      "#": idx + 1,
      "Song Title": song.title,
      Artist: song.artist,
      Album: song.album || "",
      "Release Date": song.releaseDate || "",
      "Credit Role": song.role,
      "Spotify Popularity": song.spotifyStreams || "",
      "YouTube Views": song.youtubeViews || "",
      [`${name} Publishing %`]: song.publishingShare != null ? `${song.publishingShare}%` : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-width columns
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
          <ScrollArea className="max-h-[60vh]" ref={scrollAreaRef}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Song</TableHead>
                <TableHead>Artist</TableHead>
                <TableHead>Album</TableHead>
                <TableHead>Release Date</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Spotify</TableHead>
                <TableHead className="text-right">YouTube</TableHead>
                <TableHead className="text-right">Pub %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSongs.map((song, idx) => {
                // Attach ref to the row currently being enriched (last batch boundary)
                const isEnrichmentEdge = enrichingCount < totalToEnrich && idx === enrichingCount - 1;
                return (
                <TableRow key={song.id} ref={isEnrichmentEdge ? lastEnrichedRef : undefined}>
                  <TableCell className="text-muted-foreground text-xs">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-medium text-sm max-w-[200px] truncate">
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
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                    {song.artist}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                    {song.album || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {song.releaseDate || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {song.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {song.spotifyStreams === undefined ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                    ) : (
                      <span className="text-muted-foreground">{song.spotifyStreams || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {song.youtubeViews === undefined ? (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto text-muted-foreground" />
                    ) : (
                      <span className="text-muted-foreground">
                        {song.youtubeViews ? formatNumber(parseInt(song.youtubeViews.replace(/,/g, ""))) : "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {song.publishingShare === undefined ? (
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
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
        </>
      )}
    </div>
  );
};
