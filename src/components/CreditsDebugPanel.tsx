import { useState, forwardRef } from "react";
import { ChevronDown, ChevronUp, Database, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DebugSourceInfo } from "@/lib/api/songLookup";

interface CreditsDebugPanelProps {
  debugSources?: DebugSourceInfo;
  dataSource?: string;
}

export const CreditsDebugPanel = forwardRef<HTMLDivElement, CreditsDebugPanelProps>(({ debugSources, dataSource }, ref) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!debugSources) {
    return null;
  }

  const sources = [
    { key: 'musicbrainz', label: 'MusicBrainz', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    { key: 'genius', label: 'Genius', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    { key: 'discogs', label: 'Discogs', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { key: 'apple', label: 'Apple Music', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
    { key: 'spotify', label: 'Spotify', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  ] as const;

  const hasAnyData = sources.some(s => {
    const data = debugSources[s.key as keyof DebugSourceInfo];
    if (!data) return false;
    return (data.writers?.length || 0) > 0 || 
           (data.producers?.length || 0) > 0 ||
           ((data as any).artists?.length || 0) > 0;
  });

  if (!hasAnyData) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-border/50 bg-secondary/30 overflow-hidden">
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between p-4 h-auto"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Bug className="w-4 h-4" />
          <span className="text-sm font-medium">Debug: Credit Sources</span>
          {dataSource && (
            <Badge variant="outline" className="text-xs">
              Primary: {dataSource}
            </Badge>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </Button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {sources.map(source => {
            const data = debugSources[source.key as keyof DebugSourceInfo];
            if (!data) return null;

            const artists = (data as any).artists || [];
            const writers = data.writers || [];
            const producers = data.producers || [];

            if (artists.length === 0 && writers.length === 0 && producers.length === 0) {
              return null;
            }

            return (
              <div key={source.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="w-3 h-3 text-muted-foreground" />
                  <Badge className={`${source.color} border`}>
                    {source.label}
                  </Badge>
                </div>
                <div className="pl-5 space-y-1 text-xs">
                  {artists.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Artists: </span>
                      <span className="text-foreground">{artists.join(', ')}</span>
                    </div>
                  )}
                  {writers.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Writers: </span>
                      <span className="text-foreground">{writers.join(', ')}</span>
                    </div>
                  )}
                  {producers.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Producers: </span>
                      <span className="text-foreground">{producers.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
