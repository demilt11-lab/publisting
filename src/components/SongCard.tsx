import { Music, Disc, Search, Radio, Building2, TrendingUp, Eye, BookOpen, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { StreamingLinks } from "./StreamingLinks";
import { fetchStreamingLinks, StreamingLinks as StreamingLinksType } from "@/lib/api/odesliLookup";
import { fetchStreamingStats, StreamingStats } from "@/lib/api/streamingStats";
import { Badge } from "@/components/ui/badge";
import { DataSource } from "@/lib/api/songLookup";

interface SongCardProps {
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  releaseDate?: string;
  sourceUrl?: string;
  dataSource?: DataSource;
  recordLabel?: string;
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

function formatViewCount(count: string): string {
  const num = parseInt(count, 10);
  if (isNaN(num)) return count;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export const SongCard = ({ title, artist, album, coverUrl, releaseDate, sourceUrl, dataSource, recordLabel }: SongCardProps) => {
  const [streamingLinks, setStreamingLinks] = useState<StreamingLinksType | null>(null);
  const [streamingStats, setStreamingStats] = useState<StreamingStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadLinks = async () => {
      setIsLoading(true);
      try {
        const links = await fetchStreamingLinks(sourceUrl, title, artist);
        setStreamingLinks(links);
      } catch (error) {
        console.error('Failed to load streaming links:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (title && artist) {
      loadLinks();
    }
  }, [title, artist, sourceUrl]);

  // Fetch streaming stats separately
  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await fetchStreamingStats(title, artist);
        setStreamingStats(stats);
      } catch (error) {
        console.error('Failed to load streaming stats:', error);
      }
    };

    if (title && artist) {
      loadStats();
    }
  }, [title, artist]);

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
            {sourceInfo && (
              <Badge 
                variant="outline" 
                className={`flex items-center gap-1 shrink-0 ${sourceInfo.className}`}
              >
                {sourceInfo.icon}
                <span className="text-xs">{sourceInfo.label}</span>
              </Badge>
            )}
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
          {releaseDate && (
            <p className="text-sm text-muted-foreground mt-2">Released: {releaseDate}</p>
          )}

          {/* Streaming Stats */}
          {streamingStats && (streamingStats.spotify.popularity !== null || streamingStats.youtube.viewCount || streamingStats.genius?.pageviews || streamingStats.shazam?.count) && (
            <div className="flex items-center gap-3 mt-2.5 flex-wrap">
              {streamingStats.spotify.popularity !== null && (
                <a
                  href={streamingStats.spotify.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 text-xs font-medium hover:bg-green-500/25 transition-colors"
                  title={`Spotify Popularity: ${streamingStats.spotify.popularity}/100`}
                >
                  <TrendingUp className="w-3 h-3" />
                  Spotify: {streamingStats.spotify.popularity}/100
                </a>
              )}
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
};
