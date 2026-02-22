import { Music, Disc, Search, Radio, Building2, TrendingUp, Eye, BookOpen, Waves, Copy, Check, ExternalLink } from "lucide-react";
import { useEffect, useState, useCallback, memo } from "react";
import { StreamingLinks } from "./StreamingLinks";
import { fetchStreamingLinks, StreamingLinks as StreamingLinksType } from "@/lib/api/odesliLookup";
import { fetchStreamingStats, StreamingStats } from "@/lib/api/streamingStats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataSource } from "@/lib/api/songLookup";
import { useToast } from "@/hooks/use-toast";

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
  onSearchArtist?: (artist: string) => void;
}

const dataSourceConfig: Record<DataSource, { label: string; icon: React.ReactNode; className: string }> = {
  isrc: {
    label: 'ISRC Match',
    icon: <Disc className="w-3 h-3" />,
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  musicbrainz: {
    label: 'MusicBrainz',
    icon: <Search className="w-3 h-3" />,
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  odesli: {
    label: 'Streaming Fallback',
    icon: <Radio className="w-3 h-3" />,
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
};

// Client-side streaming stats cache
const statsCache = new Map<string, StreamingStats>();

function formatViewCount(count: string): string {
  const num = parseInt(count, 10);
  if (isNaN(num)) return count;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export const SongCard = memo(({ title, artist, album, coverUrl, releaseDate, sourceUrl, dataSource, recordLabel, isrc, creditsCount, onSearchArtist }: SongCardProps) => {
  const [streamingLinks, setStreamingLinks] = useState<StreamingLinksType | null>(null);
  const [streamingStats, setStreamingStats] = useState<StreamingStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isrcCopied, setIsrcCopied] = useState(false);
  const { toast } = useToast();

  // Combined parallel fetch for streaming links AND stats
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

  const handleCopyIsrc = useCallback(() => {
    if (!isrc) return;
    navigator.clipboard.writeText(isrc).then(() => {
      setIsrcCopied(true);
      toast({ title: "ISRC copied!" });
      setTimeout(() => setIsrcCopied(false), 2000);
    }).catch(() => {});
  }, [isrc, toast]);

  const sourceInfo = dataSource ? dataSourceConfig[dataSource] : null;

  // Get primary streaming link for "Listen" button
  const listenUrl = sourceUrl?.startsWith('http') ? sourceUrl : null;

  return (
    <div className="glass rounded-2xl p-4 sm:p-6 flex flex-col gap-4 animate-fade-up">
      <div className="flex gap-4 sm:gap-6 items-start">
        <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
          {coverUrl ? (
            <img 
              src={coverUrl} 
              alt={`${title} cover`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/50 to-transparent" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground truncate">{title}</h2>
              {listenUrl && (
                <a
                  href={listenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Listen on streaming platform"
                >
                  <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {creditsCount != null && creditsCount > 0 && (
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                  {creditsCount} Credits
                </Badge>
              )}
              {sourceInfo && (
                <Badge 
                  variant="outline" 
                  className={`flex items-center gap-1 ${sourceInfo.className}`}
                >
                  {sourceInfo.icon}
                  <span className="text-xs">{sourceInfo.label}</span>
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-lg text-primary font-medium">{artist}</p>
            {onSearchArtist && (
              <button
                onClick={() => onSearchArtist(artist)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                More by {artist} →
              </button>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{album}</p>
          {recordLabel && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Badge variant="outline" className="text-xs flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
                <Building2 className="w-3 h-3" />
                {recordLabel}
              </Badge>
            </div>
          )}
          {/* ISRC Badge */}
          {isrc && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <button
                onClick={handleCopyIsrc}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Click to copy ISRC"
              >
                {isrcCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                ISRC: {isrc}
              </button>
            </div>
          )}
          {releaseDate && (
            <p className="text-sm text-muted-foreground mt-2">Released: {releaseDate}</p>
          )}

          {/* Spotify Streams - prominent display */}
          {streamingStats?.spotify && (streamingStats.spotify.streamCount || streamingStats.spotify.popularity) && (
            <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 inline-block">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                {streamingStats.spotify.streamCount ? (
                  <div>
                    <span className="text-lg font-bold text-emerald-400">
                      {formatViewCount(String(streamingStats.spotify.streamCount))}
                    </span>
                    <span className="text-xs text-emerald-400/70 ml-1.5">
                      Spotify streams {streamingStats.spotify.isExactStreamCount ? "✓" : "(est.)"}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm font-medium text-emerald-400">
                    Spotify: {streamingStats.spotify.popularity}/100 popularity
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Streaming Stats */}
          {streamingStats && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {streamingStats.youtube.viewCount && (
                <a
                  href={streamingStats.youtube.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  YouTube: {formatViewCount(streamingStats.youtube.viewCount)} views
                </a>
              )}
              {streamingStats.genius?.pageviews && (
                <a
                  href={streamingStats.genius.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/15 text-yellow-400 text-xs font-medium hover:bg-yellow-500/25 transition-colors"
                >
                  <BookOpen className="w-3 h-3" />
                  Genius: {formatViewCount(String(streamingStats.genius.pageviews))} views
                </a>
              )}
              {streamingStats.shazam?.count && (
                <a
                  href={streamingStats.shazam.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-400 text-xs font-medium hover:bg-blue-500/25 transition-colors"
                >
                  <Waves className="w-3 h-3" />
                  Shazam: {formatViewCount(String(streamingStats.shazam.count))}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      
      <StreamingLinks links={streamingLinks || { links: {} }} isLoading={isLoading} />
    </div>
  );
});

SongCard.displayName = "SongCard";
