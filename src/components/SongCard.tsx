import { Music } from "lucide-react";
import { useEffect, useState } from "react";
import { StreamingLinks } from "./StreamingLinks";
import { fetchStreamingLinks, StreamingLinks as StreamingLinksType } from "@/lib/api/odesliLookup";

interface SongCardProps {
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  releaseDate?: string;
  sourceUrl?: string;
}

export const SongCard = ({ title, artist, album, coverUrl, releaseDate, sourceUrl }: SongCardProps) => {
  const [streamingLinks, setStreamingLinks] = useState<StreamingLinksType | null>(null);
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
          <h2 className="font-display text-2xl font-bold text-foreground truncate">{title}</h2>
          <p className="text-lg text-primary font-medium mt-1">{artist}</p>
          <p className="text-muted-foreground mt-1">{album}</p>
          {releaseDate && (
            <p className="text-sm text-muted-foreground mt-2">Released: {releaseDate}</p>
          )}
        </div>
      </div>
      
      <StreamingLinks links={streamingLinks || { links: {} }} isLoading={isLoading} />
    </div>
  );
};
