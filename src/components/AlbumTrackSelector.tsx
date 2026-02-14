import { Music, Clock, Play, ListMusic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface AlbumTrack {
  id: string;
  title: string;
  artist: string;
  trackNumber: number;
  duration?: string;
}

export interface AlbumInfo {
  name: string;
  artist: string;
  coverUrl?: string;
  tracks: AlbumTrack[];
  platform: string;
}

interface AlbumTrackSelectorProps {
  album: AlbumInfo;
  onSelectTrack: (track: AlbumTrack) => void;
  onBatchLookup?: (tracks: AlbumTrack[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
  loadingTrackId?: string;
  completedTrackIds?: string[];
}

export const AlbumTrackSelector = ({
  album,
  onSelectTrack,
  onBatchLookup,
  onCancel,
  isLoading,
  loadingTrackId,
  completedTrackIds = [],
}: AlbumTrackSelectorProps) => {
  const platformLabels: Record<string, string> = {
    spotify: "Spotify",
    apple: "Apple Music",
    tidal: "Tidal",
    deezer: "Deezer",
  };

  return (
    <div className="glass rounded-2xl p-6 max-w-3xl mx-auto">
      {/* Album Header */}
      <div className="flex gap-4 mb-6">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt={album.name}
            className="w-24 h-24 rounded-lg object-cover shadow-lg"
          />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-secondary flex items-center justify-center">
            <Music className="w-10 h-10 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Album from {platformLabels[album.platform] || album.platform}
          </p>
          <h3 className="font-display text-xl font-bold text-foreground truncate">
            {album.name}
          </h3>
          <p className="text-muted-foreground truncate">{album.artist}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {album.tracks.length} tracks
          </p>
        </div>
      </div>

      {/* Batch Lookup Button */}
      {onBatchLookup && (
        <div className="mb-4">
          <Button
            onClick={() => onBatchLookup(album.tracks)}
            disabled={isLoading}
            className="w-full"
            size="lg"
          >
            <ListMusic className="w-5 h-5 mr-2" />
            Lookup All {album.tracks.length} Tracks
          </Button>
        </div>
      )}

      {/* Track List */}
      <div className="mb-4">
        <p className="text-sm font-medium text-foreground mb-3">
          Or select a single track:
        </p>
        <ScrollArea className="h-[300px] rounded-lg border border-border/50">
          <div className="divide-y divide-border/50">
            {album.tracks.map((track) => {
              const isCompleted = completedTrackIds.includes(track.id);
              return (
                <button
                  key={track.id}
                  onClick={() => onSelectTrack(track)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-3 p-3 hover:bg-secondary/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="w-6 text-center text-sm text-muted-foreground">
                    {loadingTrackId === track.id ? (
                      <div className="w-4 h-4 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : isCompleted ? (
                      <span className="text-primary">✓</span>
                    ) : (
                      track.trackNumber
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {track.title}
                    </p>
                    {track.artist && track.artist !== album.artist && (
                      <p className="text-xs text-muted-foreground truncate">
                        {track.artist}
                      </p>
                    )}
                  </div>
                  {track.duration && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {track.duration}
                    </span>
                  )}
                  <Play className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Cancel Button */}
      <div className="flex justify-center">
        <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel & Search Something Else
        </Button>
      </div>
    </div>
  );
};
