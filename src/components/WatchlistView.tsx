import { useState, useMemo } from "react";
import { Eye, X, Trash2, User, Pen, Disc3, Building2, Music, Filter, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useWatchlist, WatchlistEntityType, WatchlistEntry } from "@/hooks/useWatchlist";

interface WatchlistViewProps {
  onClose: () => void;
  onSearchSong?: (query: string) => void;
}

const TYPE_ICONS: Record<WatchlistEntityType, typeof User> = {
  writer: Pen,
  producer: Disc3,
  artist: User,
  publisher: Building2,
  label: Disc3,
};

const TYPE_LABELS: Record<WatchlistEntityType, string> = {
  writer: "Writer",
  producer: "Producer",
  artist: "Artist",
  publisher: "Publisher",
  label: "Label",
};

const TYPE_COLORS: Record<WatchlistEntityType, string> = {
  writer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  producer: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  artist: "bg-primary/20 text-primary border-primary/30",
  publisher: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  label: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

export const WatchlistView = ({ onClose, onSearchSong }: WatchlistViewProps) => {
  const { watchlist, removeFromWatchlist, getFilteredWatchlist, getStats } = useWatchlist();
  const [typeFilter, setTypeFilter] = useState<WatchlistEntityType | null>(null);
  const [majorFilter, setMajorFilter] = useState<boolean | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stats = useMemo(() => getStats(), [getStats]);

  const filteredList = useMemo(() => {
    return getFilteredWatchlist({
      type: typeFilter || undefined,
      isMajor: majorFilter ?? undefined,
    });
  }, [getFilteredWatchlist, typeFilter, majorFilter]);

  const clearFilters = () => {
    setTypeFilter(null);
    setMajorFilter(null);
  };

  const hasFilters = typeFilter !== null || majorFilter !== null;

  return (
    <div className="glass rounded-xl overflow-hidden animate-fade-up">
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Watchlist
          <Badge variant="secondary" className="text-[10px]">
            {watchlist.length} tracked
          </Badge>
        </h3>
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats bar */}
      <div className="p-3 border-b border-border/50 bg-secondary/30">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="text-[10px]">
            {stats.byType.writer} Writers
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {stats.byType.producer} Producers
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {stats.byType.publisher} Publishers
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {stats.byType.label} Labels
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {stats.totalAppearances} appearances
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-border/50 flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              {typeFilter ? TYPE_LABELS[typeFilter] : "All Types"}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setTypeFilter(null)}>All Types</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(Object.keys(TYPE_LABELS) as WatchlistEntityType[]).map((type) => (
              <DropdownMenuItem key={type} onClick={() => setTypeFilter(type)}>
                {TYPE_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              {majorFilter === null ? "Major/Indie" : majorFilter ? "Major Only" : "Indie Only"}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setMajorFilter(null)}>All</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setMajorFilter(true)}>Major Only</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMajorFilter(false)}>Indie Only</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {/* List */}
      <ScrollArea className="h-[400px]">
        <div className="p-2 space-y-1">
          {filteredList.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">
              {watchlist.length === 0
                ? "No entries in watchlist yet. Add writers, publishers, or labels from credit cards."
                : "No entries match the current filters."}
            </p>
          ) : (
            filteredList.map((entry) => (
              <WatchlistEntryCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                onRemove={() => removeFromWatchlist(entry.id)}
                onSearchSong={onSearchSong}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

interface WatchlistEntryCardProps {
  entry: WatchlistEntry;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onSearchSong?: (query: string) => void;
}

const WatchlistEntryCard = ({
  entry,
  expanded,
  onToggle,
  onRemove,
  onSearchSong,
}: WatchlistEntryCardProps) => {
  const Icon = TYPE_ICONS[entry.type];

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <div className="rounded-lg border border-border/50 bg-card/50 overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${TYPE_COLORS[entry.type].split(' ')[0]}`}>
              <Icon className="w-4 h-4 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-foreground truncate">
                  {entry.name}
                </span>
                <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[entry.type]}`}>
                  {TYPE_LABELS[entry.type]}
                </Badge>
                {entry.pro && (
                  <Badge variant="outline" className="text-[10px]">
                    {entry.pro}
                  </Badge>
                )}
                {entry.isMajor !== undefined && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      entry.isMajor
                        ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}
                  >
                    {entry.isMajor ? "Major" : "Indie"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {entry.sources.length} song{entry.sources.length !== 1 ? "s" : ""}
                {entry.ipi && ` • IPI: ${entry.ipi}`}
              </p>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Appears on:
            </p>
            <div className="space-y-1">
              {entry.sources.slice(0, 10).map((source, idx) => (
                <button
                  key={idx}
                  onClick={() => onSearchSong?.(`${source.artist} - ${source.songTitle}`)}
                  className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors text-left"
                >
                  <Music className="w-3.5 h-3.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{source.songTitle}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {source.artist}
                      {source.projectName && ` • ${source.projectName}`}
                    </p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </button>
              ))}
              {entry.sources.length > 10 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  +{entry.sources.length - 10} more
                </p>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Remove
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
