import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StreamingLinks as StreamingLinksType } from "@/lib/api/odesliLookup";

interface StreamingLinksProps {
  links: StreamingLinksType;
  isLoading?: boolean;
}

const platformConfig: Record<string, { label: string; color: string; icon: string }> = {
  spotify: { label: 'Spotify', color: 'bg-[#1DB954] hover:bg-[#1ed760]', icon: '🎵' },
  appleMusic: { label: 'Apple Music', color: 'bg-[#FC3C44] hover:bg-[#fd5c63]', icon: '🍎' },
  youtube: { label: 'YouTube', color: 'bg-[#FF0000] hover:bg-[#ff3333]', icon: '▶️' },
  youtubeMusic: { label: 'YT Music', color: 'bg-[#FF0000] hover:bg-[#ff3333]', icon: '🎶' },
  tidal: { label: 'Tidal', color: 'bg-[#000000] hover:bg-[#333333]', icon: '🌊' },
  deezer: { label: 'Deezer', color: 'bg-[#FF0092] hover:bg-[#ff33a8]', icon: '🎧' },
  amazonMusic: { label: 'Amazon', color: 'bg-[#FF9900] hover:bg-[#ffad33]', icon: '📦' },
  soundcloud: { label: 'SoundCloud', color: 'bg-[#FF5500] hover:bg-[#ff7733]', icon: '☁️' },
  pandora: { label: 'Pandora', color: 'bg-[#3668FF] hover:bg-[#5580ff]', icon: '📻' },
};

export const StreamingLinks = ({ links, isLoading }: StreamingLinksProps) => {
  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2 mt-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-24 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  const availableLinks = Object.entries(links.links).filter(([_, url]) => url);

  if (availableLinks.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-muted-foreground mb-2">Listen on:</p>
      <div className="flex flex-wrap gap-2">
        {availableLinks.map(([platform, url]) => {
          const config = platformConfig[platform];
          if (!config) return null;
          
          return (
            <Button
              key={platform}
              size="sm"
              className={`${config.color} text-white text-xs`}
              onClick={() => window.open(url, '_blank')}
            >
              <span className="mr-1">{config.icon}</span>
              {config.label}
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          );
        })}
      </div>
      {links.pageUrl && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 text-xs text-muted-foreground"
          onClick={() => window.open(links.pageUrl, '_blank')}
        >
          View all platforms →
        </Button>
      )}
    </div>
  );
};
