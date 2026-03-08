import { Music, Disc, Search, Radio as RadioIcon, Building2, TrendingUp, Eye, BookOpen, Waves, Copy, Check, ExternalLink, Plus, Briefcase, Shield, ChevronDown, ChevronUp, ClipboardCopy, HelpCircle, RefreshCw, Radio } from "lucide-react";
import { useEffect, useState, useCallback, memo, useMemo } from "react";
import { StreamingLinks } from "./StreamingLinks";
import { fetchStreamingLinks, StreamingLinks as StreamingLinksType } from "@/lib/api/odesliLookup";
import { fetchStreamingStats, StreamingStats } from "@/lib/api/streamingStats";
import { SyncScoreExplainer } from "./SyncScoreExplainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataSource } from "@/lib/api/songLookup";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

interface SongCardProps {
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  releaseDate?: string;
  sourceUrl?: string;
  dataSource?: DataSource;
  recordLabel?: string;
  isrc?: string;
  creditsCount?: number;
  credits?: { publisher?: string; pro?: string; role: string; name?: string; ipi?: string; publishingShare?: number }[];
  chartPlacementsCount?: number;
  onSearchArtist?: (artist: string) => void;
  onAddToDeal?: (title: string, artist: string) => void;
  onAddToCompare?: (title: string, artist: string) => void;
  compareCount?: number;
}

const dataSourceConfig: Record<DataSource, { label: string; icon: React.ReactNode; className: string }> = {
  isrc: { label: 'ISRC Match', icon: <Disc className="w-3 h-3" />, className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  musicbrainz: { label: '✓ Verified Source', icon: <Search className="w-3 h-3" />, className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  odesli: { label: 'Streaming Fallback', icon: <RadioIcon className="w-3 h-3" />, className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

const statsCache = new Map<string, StreamingStats>();

function formatViewCount(count: string): string {
  const num = parseInt(count, 10);
  if (isNaN(num)) return count;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export const SongCard = memo(({ title, artist, album, coverUrl, releaseDate, sourceUrl, dataSource, recordLabel, isrc, creditsCount, credits: creditsProp, chartPlacementsCount, onSearchArtist, onAddToDeal, onAddToCompare, compareCount }: SongCardProps) => {
  const [streamingLinks, setStreamingLinks] = useState<StreamingLinksType | null>(null);
  const [streamingStats, setStreamingStats] = useState<StreamingStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isrcCopied, setIsrcCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      setIsLoading(true);
      const cacheKey = `${title.toLowerCase()}-${artist.toLowerCase()}`;
      const cachedStats = statsCache.get(cacheKey);
      const [links, stats] = await Promise.allSettled([
        fetchStreamingLinks(sourceUrl, title, artist),
        cachedStats ? Promise.resolve(cachedStats) : fetchStreamingStats(title, artist),
      ]);
      if (cancelled) return;
      if (links.status === 'fulfilled') setStreamingLinks(links.value);
      if (stats.status === 'fulfilled' && stats.value) {
        setStreamingStats(stats.value);
        if (!cachedStats) statsCache.set(cacheKey, stats.value);
      }
      setIsLoading(false);
    };
    if (title && artist) loadAll();
    return () => { cancelled = true; };
  }, [title, artist, sourceUrl]);

  const handleRefreshStats = useCallback(async () => {
    setIsRefreshing(true);
    const cacheKey = `${title.toLowerCase()}-${artist.toLowerCase()}`;
    statsCache.delete(cacheKey);
    
    // Clear all caches in parallel: streaming stats, PRO cache, and MLC shares
    const mlcCacheKey = `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
    const creditNames = creditsProp?.map(c => c.name).filter(Boolean) || [];
    
    try {
      const clearPromises: Promise<any>[] = [
        fetchStreamingStats(title, artist, undefined, true),
        Promise.resolve(supabase.from('mlc_shares_cache').delete().eq('cache_key', mlcCacheKey)),
      ];
      
      // Clear PRO cache for all credited people
      if (creditNames.length > 0) {
        const lowerNames = creditNames.map(n => n!.toLowerCase());
        clearPromises.push(
          Promise.resolve(supabase.from('pro_cache').delete().in('name_lower', lowerNames))
        );
      }
      
      const [stats] = await Promise.all(clearPromises);
      if (stats) {
        setStreamingStats(stats);
        statsCache.set(cacheKey, stats);
      }
      toast({ title: "All data refreshed", description: "Streaming stats, publisher info, and publishing shares caches cleared." });
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, [title, artist, toast, creditsProp]);

  const handleCopyIsrc = useCallback(() => {
    if (!isrc) return;
    navigator.clipboard.writeText(isrc).then(() => {
      setIsrcCopied(true);
      toast({ title: "ISRC copied!", description: isrc });
      setTimeout(() => setIsrcCopied(false), 2000);
    }).catch(() => {});
  }, [isrc, toast]);

  const handleAddToCompare = useCallback(() => {
    if (!onAddToCompare) return;
    onAddToCompare(title, artist);
  }, [onAddToCompare, title, artist]);

  const sourceInfo = dataSource ? dataSourceConfig[dataSource] : null;
  const listenUrl = sourceUrl?.startsWith('http') ? sourceUrl : null;

  // Catalog Score (replaces Sync Score)
  const catalogScoreData = useMemo(() => {
    if (!creditsProp || creditsProp.length === 0) return null;
    const streams = streamingStats?.spotify?.streamCount || 0;
    const streamPts = Math.min(40, Math.round((streams / 1_000_000_000) * 40));
    const chartPts = Math.min(25, (chartPlacementsCount || 0) * 5);
    const signed = creditsProp.filter(c => c.publisher).length;
    const signedPts = Math.round((signed / creditsProp.length) * 20);
    const pubCount = new Set(creditsProp.filter(c => c.publisher).map(c => c.publisher)).size;
    const publisherPts = pubCount <= 1 ? 15 : pubCount <= 2 ? 10 : pubCount <= 3 ? 5 : 0;
    const score = Math.min(100, streamPts + chartPts + signedPts + publisherPts);
    return { score, streamPts, chartPts, signedPts, publisherPts };
  }, [creditsProp, streamingStats, chartPlacementsCount]);

  const catalogLabel = catalogScoreData ? (
    catalogScoreData.score >= 80 ? { text: "Excellent", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" } :
    catalogScoreData.score >= 60 ? { text: "Good", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25" } :
    catalogScoreData.score >= 40 ? { text: "Fair", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" } :
    { text: "Complex", cls: "bg-red-500/15 text-red-400 border-red-500/25" }
  ) : null;

  const firstStreamingLink = streamingLinks?.links
    ? Object.entries(streamingLinks.links).find(([, url]) => url)?.[1]
    : null;
  const viewPlatformUrl = listenUrl || firstStreamingLink || null;

  const handleCopyAll = useCallback(() => {
    const lines: string[] = [
      `Song: ${title}`, `Artist: ${artist}`, `Album: ${album}`,
      isrc ? `ISRC: ${isrc}` : "", recordLabel ? `Label: ${recordLabel}` : "",
      releaseDate ? `Released: ${releaseDate}` : "",
      catalogScoreData ? `Catalog Score: ${catalogScoreData.score}/100 (${catalogLabel?.text})` : "", "",
    ];
    if (creditsProp && creditsProp.length > 0) {
      lines.push("Credits:");
      creditsProp.forEach(c => {
        let line = `  ${c.name || "Unknown"} (${c.role})`;
        if (c.publisher) line += ` | Publisher: ${c.publisher}`;
        if (c.pro) line += ` | PRO: ${c.pro}`;
        if (c.ipi) line += ` | IPI: ${c.ipi}`;
        if (c.publishingShare) line += ` | Share: ${c.publishingShare}%`;
        lines.push(line);
      });
    }
    if (streamingStats?.spotify?.streamCount) {
      lines.push("", `Spotify Streams: ${formatViewCount(String(streamingStats.spotify.streamCount))}`);
    }
    navigator.clipboard.writeText(lines.filter(Boolean).join("\n")).then(() => {
      toast({ title: "All info copied!", description: "Song details copied to clipboard." });
    }).catch(() => {});
  }, [title, artist, album, isrc, recordLabel, releaseDate, creditsProp, streamingStats, catalogScoreData, catalogLabel, toast]);

  const groupedCredits = useMemo(() => {
    if (!creditsProp) return { writers: [], producers: [], artists: [] };
    return {
      writers: creditsProp.filter(c => c.role === "writer"),
      producers: creditsProp.filter(c => c.role === "producer"),
      artists: creditsProp.filter(c => c.role === "artist"),
    };
  }, [creditsProp]);

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 flex flex-col gap-4 animate-fade-up hover:border-primary/20 transition-colors">
      <div className="flex gap-4 sm:gap-6 items-start">
        <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
          {coverUrl ? (
            <img src={coverUrl} alt={`${title} cover`} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground truncate">{title}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-lg sm:text-xl text-primary font-semibold">{artist}</p>
                {onSearchArtist && (
                  <button onClick={() => onSearchArtist(artist)} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                    More →
                  </button>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{album}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {catalogLabel && catalogScoreData && (
                <SyncScoreExplainer score={catalogScoreData.score} streamPts={catalogScoreData.streamPts} chartPts={catalogScoreData.chartPts} signedPts={catalogScoreData.signedPts} publisherPts={catalogScoreData.publisherPts}>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className={`text-xs flex items-center gap-1 cursor-pointer ${catalogLabel.cls}`}>
                      <Shield className="w-3 h-3" />
                      Catalog: {catalogScoreData.score} — {catalogLabel.text}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/50 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        Catalog score (0-100) based on streaming performance, chart placements, publisher coverage, and deal complexity.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </SyncScoreExplainer>
              )}
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {recordLabel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
                    <Building2 className="w-3 h-3" />
                    {recordLabel}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Record label — owns the master recording</TooltipContent>
              </Tooltip>
            )}
            {creditsCount != null && creditsCount > 0 && (
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                {creditsCount} People Credited
              </Badge>
            )}
            {sourceInfo && (
              <Badge variant="outline" className={`flex items-center gap-1 ${sourceInfo.className}`}>
                {sourceInfo.icon}
                <span className="text-xs">{sourceInfo.label}</span>
              </Badge>
            )}
            {isrc && (
              <button onClick={handleCopyIsrc} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Click to copy ISRC">
                {isrcCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                ISRC: {isrc}
              </button>
            )}
          </div>

          {/* Action buttons - larger, clearer */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {onAddToDeal && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onAddToDeal(title, artist)}>
                    <Briefcase className="w-3.5 h-3.5" /> + Add to Deals
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add to your deals pipeline</TooltipContent>
              </Tooltip>
            )}
            {onAddToCompare && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleAddToCompare}>
                    <Plus className="w-3.5 h-3.5" /> Compare
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Compare up to 3 songs side by side ({compareCount ?? 0}/3)</TooltipContent>
              </Tooltip>
            )}
            {viewPlatformUrl && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
                    <a href={viewPlatformUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5" /> Listen
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open on streaming platform</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleCopyAll}>
                  <ClipboardCopy className="w-3.5 h-3.5" /> Copy Info
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copies all publishing info to clipboard</TooltipContent>
            </Tooltip>
          </div>

          {releaseDate && (
            <p className="text-sm text-muted-foreground mt-2">
              Released: {releaseDate}
              {(() => {
                const d = new Date(releaseDate);
                if (!isNaN(d.getTime())) {
                  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                  if (years > 0) return ` (${years} year${years !== 1 ? 's' : ''} ago)`;
                }
                return null;
              })()}
            </p>
          )}

          {/* Streaming stats as platform row */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {streamingStats?.spotify && (streamingStats.spotify.streamCount || streamingStats.spotify.popularity) && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
                <TrendingUp className="w-3 h-3" />
                {streamingStats.spotify.streamCount
                  ? <>{formatViewCount(String(streamingStats.spotify.streamCount))} streams {streamingStats.spotify.isExactStreamCount ? "✓" : "(est.)"}</>
                  : <>Popularity: {streamingStats.spotify.popularity}/100</>}
              </div>
            )}
            {streamingStats?.youtube?.viewCount && (
              <a href={streamingStats.youtube.url || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors">
                <Eye className="w-3 h-3" /> {formatViewCount(streamingStats.youtube.viewCount)} views
              </a>
            )}
            {streamingStats?.genius?.pageviews && (
              <a href={streamingStats.genius?.url || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400 text-xs font-medium hover:bg-yellow-500/25 transition-colors">
                <BookOpen className="w-3 h-3" /> {formatViewCount(String(streamingStats.genius.pageviews))}
              </a>
            )}
            {streamingStats?.shazam?.count && (
              <a href={streamingStats.shazam?.url || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 text-xs font-medium hover:bg-blue-500/25 transition-colors">
                <Waves className="w-3 h-3" /> {formatViewCount(String(streamingStats.shazam.count))}
              </a>
            )}
            {/* Refresh button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleRefreshStats}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 text-muted-foreground text-xs hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Refresh all data (streams, publishers, splits)</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Expandable Details — prominent button */}
      {creditsProp && creditsProp.length > 0 && (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full text-sm text-primary border-primary/30 hover:bg-primary/10 gap-1.5">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {expanded ? "Hide Credits" : `View All ${creditsCount || creditsProp.length} Credits →`}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {groupedCredits.writers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Songwriters ({groupedCredits.writers.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {groupedCredits.writers.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {c.name || "Unknown"}
                      {c.publisher && <span className="text-muted-foreground ml-1">· {c.publisher}</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {groupedCredits.producers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Producers ({groupedCredits.producers.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {groupedCredits.producers.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {c.name || "Unknown"}
                      {c.pro && <span className="text-muted-foreground ml-1">· {c.pro}</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {groupedCredits.artists.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Artists ({groupedCredits.artists.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {groupedCredits.artists.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{c.name || "Unknown"}</Badge>
                  ))}
                </div>
              </div>
            )}
            {creditsProp.some(c => c.publishingShare) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Publishing Splits</p>
                <div className="space-y-1">
                  {creditsProp.filter(c => c.publishingShare).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{c.name} ({c.publisher || "Unknown"})</span>
                      <span className="text-primary font-medium">{c.publishingShare}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
      
      <StreamingLinks links={streamingLinks || { links: {} }} isLoading={isLoading} />
    </div>
  );
});

SongCard.displayName = "SongCard";
