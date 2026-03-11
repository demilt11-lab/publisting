import { useState, useCallback, useEffect } from "react";
import { ListMusic, ExternalLink, RefreshCw, Music2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface PlaylistAppearance {
  platform: string;
  playlistName: string;
  url?: string;
  addedDate?: string;
}

interface PlaylistAppearancesPanelProps {
  songTitle: string;
  artist: string;
}

const PLATFORM_STYLES: Record<string, string> = {
  Spotify: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  "Apple Music": "bg-pink-500/15 text-pink-400 border-pink-500/25",
};

export const PlaylistAppearancesPanel = ({ songTitle, artist }: PlaylistAppearancesPanelProps) => {
  const [playlists, setPlaylists] = useState<PlaylistAppearance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchPlaylists = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('playlist-appearances', {
        body: { songTitle, artist },
      });
      if (!error && data?.success) {
        setPlaylists(data.data?.playlists || []);
      }
    } catch (e) {
      console.error('Playlist lookup failed:', e);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [songTitle, artist]);

  // Auto-fetch on mount or when song changes
  useEffect(() => {
    setPlaylists([]);
    setHasLoaded(false);
    fetchPlaylists();
  }, [fetchPlaylists]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="section-label flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-primary" />
          Curated Playlists
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={fetchPlaylists}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              Searching...
            </>
          ) : hasLoaded ? (
            <>
              <RefreshCw className="w-3 h-3" />
              Refresh
            </>
          ) : (
            <>
              <Music2 className="w-3 h-3" />
              Find Playlists
            </>
          )}
        </Button>
      </div>

      {hasLoaded && playlists.length === 0 && (
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-4 text-sm text-muted-foreground text-center">
          No curated playlist appearances found for this song.
        </div>
      )}

      {playlists.length > 0 && (
        <div className="space-y-1.5">
          {playlists.map((pl, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-accent/30 transition-colors"
            >
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 ${PLATFORM_STYLES[pl.platform] || "bg-muted text-muted-foreground"}`}
              >
                {pl.platform}
              </Badge>
              <span className="text-sm font-medium text-foreground flex-1 truncate">
                {pl.playlistName}
              </span>
              {pl.addedDate && (
                <span className="text-[10px] text-muted-foreground shrink-0">{pl.addedDate}</span>
              )}
              {pl.url && (
                <a href={pl.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
