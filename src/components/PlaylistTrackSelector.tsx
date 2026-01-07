import { useState } from "react";
import { ListMusic, Clock, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { PlaylistTrack, PlaylistInfo } from "@/lib/api/playlistLookup";

interface PlaylistTrackSelectorProps {
  playlist: PlaylistInfo;
  onSelectTrack: (track: PlaylistTrack) => void;
  onBatchLookup: (tracks: PlaylistTrack[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
  loadingTrackId?: string;
  completedTrackIds?: string[];
}

export const PlaylistTrackSelector = ({
  playlist,
  onSelectTrack,
  onBatchLookup,
  onCancel,
  isLoading,
  loadingTrackId,
  completedTrackIds = [],
}: PlaylistTrackSelectorProps) => {
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const platformLabels: Record<string, string> = {
    spotify: "Spotify",
    apple: "Apple Music",
    tidal: "Tidal",
    deezer: "Deezer",
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedTracks(new Set(playlist.tracks.map(t => t.id)));
    } else {
      setSelectedTracks(new Set());
    }
  };

  const handleToggleTrack = (trackId: string) => {
    const newSelected = new Set(selectedTracks);
    if (newSelected.has(trackId)) {
      newSelected.delete(trackId);
    } else {
      newSelected.add(trackId);
    }
    setSelectedTracks(newSelected);
    setSelectAll(newSelected.size === playlist.tracks.length);
  };

  const handleBatchLookup = () => {
    const tracksToLookup = playlist.tracks.filter(t => selectedTracks.has(t.id));
    onBatchLookup(tracksToLookup);
  };

  return (
    <div className="glass rounded-2xl p-6 max-w-3xl mx-auto">
      {/* Playlist Header */}
      <div className="flex gap-4 mb-6">
        {playlist.coverUrl ? (
          <img
            src={playlist.coverUrl}
            alt={playlist.name}
            className="w-24 h-24 rounded-lg object-cover shadow-lg"
          />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-secondary flex items-center justify-center">
            <ListMusic className="w-10 h-10 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Playlist from {platformLabels[playlist.platform] || playlist.platform}
          </p>
          <h3 className="font-display text-xl font-bold text-foreground truncate">
            {playlist.name}
          </h3>
          <p className="text-muted-foreground truncate">by {playlist.creator}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {playlist.totalTracks || playlist.tracks.length} tracks
          </p>
        </div>
      </div>

      {playlist.tracks.length === 0 ? (
        <div className="text-center py-8">
          <ListMusic className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            Track listing not available for {platformLabels[playlist.platform]} playlists.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Try pasting individual track links or use a Deezer playlist for full track access.
          </p>
        </div>
      ) : (
        <>
          {/* Batch Actions */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Checkbox
                id="select-all"
                checked={selectAll}
                onCheckedChange={handleSelectAll}
                disabled={isLoading}
              />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                Select all tracks
              </label>
            </div>
            <Button
              onClick={handleBatchLookup}
              disabled={selectedTracks.size === 0 || isLoading}
              size="sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  Lookup Selected ({selectedTracks.size})
                </>
              )}
            </Button>
          </div>

          {/* Track List */}
          <div className="mb-4">
            <p className="text-sm font-medium text-foreground mb-3">
              Select tracks to lookup credits:
            </p>
            <ScrollArea className="h-[350px] rounded-lg border border-border/50">
              <div className="divide-y divide-border/50">
                {playlist.tracks.map((track) => {
                  const isCompleted = completedTrackIds.includes(track.id);
                  const isCurrentlyLoading = loadingTrackId === track.id;
                  
                  return (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 p-3 hover:bg-secondary/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedTracks.has(track.id)}
                        onCheckedChange={() => handleToggleTrack(track.id)}
                        disabled={isLoading || isCompleted}
                      />
                      <button
                        onClick={() => onSelectTrack(track)}
                        disabled={isLoading || isCompleted}
                        className="flex-1 flex items-center gap-3 text-left disabled:opacity-50"
                      >
                        <span className="w-6 text-center text-sm text-muted-foreground">
                          {isCurrentlyLoading ? (
                            <Loader2 className="w-4 h-4 mx-auto animate-spin text-primary" />
                          ) : isCompleted ? (
                            <Check className="w-4 h-4 mx-auto text-green-500" />
                          ) : (
                            track.trackNumber
                          )}
                        </span>
                        {track.coverUrl && (
                          <img 
                            src={track.coverUrl} 
                            alt="" 
                            className="w-10 h-10 rounded object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {track.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {track.artist}
                            {track.albumName && ` • ${track.albumName}`}
                          </p>
                        </div>
                        {track.duration && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {track.duration}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </>
      )}

      {/* Cancel Button */}
      <div className="flex justify-center">
        <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel & Search Something Else
        </Button>
      </div>
    </div>
  );
};
