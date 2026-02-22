import { Music, Disc, Search, Radio, Building2, TrendingUp, Eye, BookOpen, Waves, Copy, Check } from "lucide-react";
import { useEffect, useState, useCallback, memo } from "react";
import { StreamingLinks } from "./StreamingLinks";
import { fetchStreamingLinks, StreamingLinks as StreamingLinksType } from "@/lib/api/odesliLookup";
import { fetchStreamingStats, StreamingStats } from "@/lib/api/streamingStats";
import { Badge } from "@/components/ui/badge";
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
}

const dataSourceConfig: Record<DataSource, { label: string; icon: React.ReactNode; className: string }> = {
  isrc: {
    label: 'ISRC Match',
    icon: <Disc className="w-3 h-3" />,
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
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

export const SongCard = memo(({ title, artist, album, coverUrl, releaseDate, sourceUrl, dataSource, recordLabel, isrc, creditsCount }: SongCardProps) => {
  const [streamingLinks, setStreamingLinks] = useState<StreamingLinksType | null>(null);
  const [streamingStats, setStreamingStats] = useState<StreamingStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isrcCopied, setIsrcCopied] = useState(false);
  const { toast } = useToast();

  // Combined parallel fetch for streaming links AND stats (5a)
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

  return (
    <div className="glass rounded-2xl p-6 flex flex-col gap-4 animate-fade-up">
      <div className="flex gap-6 items-start">
        <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
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
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display text-2xl font-bold text-foreground truncate">{title}</h2>
            <div className="flex items-center gap-1.5 shrink-0">
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
          <p className="text-lg text-primary font-medium mt-1">{artist}</p>
          <p className="text-muted-foreground mt-1">{album}</p>
          {recordLabel && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Badge variant="outline" className="text-xs flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
                <Building2 className="w-3 h-3" />
                {recordLabel}
              </Badge>
            </div>
          )}
          {/* ISRC Badge (6a) */}
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

          {/* Streaming Stats */}
          {streamingStats && (
            <div className="flex items-center gap-3 mt-2.5 flex-wrap">
              {/* Spotify badge - always show when stats loaded */}
              <a
                href={streamingStats.spotify.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 text-xs font-medium hover:bg-green-500/25 transition-colors"
                title={
                  streamingStats.spotify.isExactStreamCount
                    ? `Exact stream count from Spotify: ${streamingStats.spotify.streamCount?.toLocaleString()}`
                    : streamingStats.spotify.streamCount
                      ? `Estimated from popularity score (${streamingStats.spotify.popularity}/100)`
                      : streamingStats.spotify.popularity
                        ? `Spotify Popularity: ${streamingStats.spotify.popularity}/100`
                        : 'Spotify data unavailable'
                }
              >
                <TrendingUp className="w-3 h-3" />
                {streamingStats.spotify.streamCount
                  ? `${formatViewCount(String(streamingStats.spotify.streamCount))} streams${streamingStats.spotify.isExactStreamCount ? ' ✓' : ' (est.)'}`
                  : streamingStats.spotify.popularity
                    ? `Spotify: ${streamingStats.spotify.popularity}/100`
                    : 'Spotify'}
              </a>
              {streamingStats.youtube.viewCount && (
                <a
                  href={streamingStats.youtube.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors"
                  title={`YouTube Views: ${parseInt(streamingStats.youtube.viewCount).toLocaleString()}`}
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
                  title={`Genius Pageviews: ${streamingStats.genius.pageviews.toLocaleString()}`}
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
                  title={`Shazam Count: ${streamingStats.shazam.count.toLocaleString()}`}
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
