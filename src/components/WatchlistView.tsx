import { useState, useMemo } from "react";
import { Eye, X, Trash2, User, Pen, Disc3, Building2, Music, Filter, ExternalLink, ChevronDown, MessageSquare, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWatchlist, WatchlistEntityType, WatchlistEntry, ContactStatus, CONTACT_STATUS_CONFIG } from "@/hooks/useWatchlist";

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

type ViewMode = "list" | "board";

export const WatchlistView = ({ onClose, onSearchSong }: WatchlistViewProps) => {
  const { watchlist, removeFromWatchlist, updateContactStatus, updateContactNotes, getFilteredWatchlist, getStats } = useWatchlist();
  const [typeFilter, setTypeFilter] = useState<WatchlistEntityType | null>(null);
  const [majorFilter, setMajorFilter] = useState<boolean | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [statusFilter, setStatusFilter] = useState<ContactStatus | null>(null);

  const stats = useMemo(() => getStats(), [getStats]);

  const filteredList = useMemo(() => {
    let list = getFilteredWatchlist({
      type: typeFilter || undefined,
      isMajor: majorFilter ?? undefined,
    });
    if (statusFilter) {
      list = list.filter((e) => (e.contactStatus || "not_contacted") === statusFilter);
    }
    return list;
  }, [getFilteredWatchlist, typeFilter, majorFilter, statusFilter]);

  const boardColumns = useMemo(() => {
    const columns: Record<ContactStatus, WatchlistEntry[]> = {
      not_contacted: [],
      reached_out: [],
      in_talks: [],
      signed: [],
      passed: [],
    };
    filteredList.forEach((entry) => {
      const status = entry.contactStatus || "not_contacted";
      columns[status].push(entry);
    });
    return columns;
  }, [filteredList]);

  const clearFilters = () => {
    setTypeFilter(null);
    setMajorFilter(null);
    setStatusFilter(null);
  };

  const hasFilters = typeFilter !== null || majorFilter !== null || statusFilter !== null;

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
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="w-8 h-8"
            onClick={() => setViewMode("list")}
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "board" ? "secondary" : "ghost"}
            size="icon"
            className="w-8 h-8"
            onClick={() => setViewMode("board")}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
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
            {stats.byType.artist} Artists
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
              {statusFilter ? CONTACT_STATUS_CONFIG[statusFilter].label : "All Statuses"}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setStatusFilter(null)}>All Statuses</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[]).map((status) => (
              <DropdownMenuItem key={status} onClick={() => setStatusFilter(status)}>
                {CONTACT_STATUS_CONFIG[status].label}
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

      {/* Content */}
      {viewMode === "list" ? (
        <ScrollArea className="h-[400px]">
          <div className="p-2 space-y-1">
            {filteredList.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">
                {watchlist.length === 0
                  ? "No entries in watchlist yet. Add writers, producers, or artists from credit cards."
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
                  onStatusChange={(status) => updateContactStatus(entry.id, status)}
                  onNotesChange={(notes) => updateContactNotes(entry.id, notes)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      ) : (
        /* Board / Swim Lane View */
        <ScrollArea className="h-[400px]">
          <div className="p-3 flex gap-3 min-w-[800px]">
            {(Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[]).map((status) => (
              <div key={status} className="flex-1 min-w-[150px] space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={`text-[10px] ${CONTACT_STATUS_CONFIG[status].color}`}>
                    {CONTACT_STATUS_CONFIG[status].label}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{boardColumns[status].length}</span>
                </div>
                <div className="space-y-1.5">
                  {boardColumns[status].map((entry) => (
                    <BoardCard
                      key={entry.id}
                      entry={entry}
                      onStatusChange={(s) => updateContactStatus(entry.id, s)}
                      onSearchSong={onSearchSong}
                    />
                  ))}
                  {boardColumns[status].length === 0 && (
                    <div className="rounded-lg border border-dashed border-border/50 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">No entries</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

/* ─── Board Card (compact for swim lanes) ─── */
interface BoardCardProps {
  entry: WatchlistEntry;
  onStatusChange: (status: ContactStatus) => void;
  onSearchSong?: (query: string) => void;
}

const BoardCard = ({ entry, onStatusChange, onSearchSong }: BoardCardProps) => {
  const Icon = TYPE_ICONS[entry.type];
  const statuses = Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[];
  const currentIdx = statuses.indexOf(entry.contactStatus || "not_contacted");

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">{entry.name}</span>
      </div>
      <div className="flex items-center gap-1">
        <Badge variant="outline" className={`text-[9px] ${TYPE_COLORS[entry.type]}`}>
          {TYPE_LABELS[entry.type]}
        </Badge>
        {entry.pro && <Badge variant="outline" className="text-[9px]">{entry.pro}</Badge>}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {entry.sources.length} song{entry.sources.length !== 1 ? "s" : ""}
      </p>
      {/* Quick move buttons */}
      <div className="flex gap-1 pt-1">
        {currentIdx < statuses.length - 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[9px] px-1.5 text-primary"
            onClick={() => onStatusChange(statuses[currentIdx + 1])}
          >
            → {CONTACT_STATUS_CONFIG[statuses[currentIdx + 1]].label}
          </Button>
        )}
      </div>
    </div>
  );
};

/* ─── List Entry Card ─── */
interface WatchlistEntryCardProps {
  entry: WatchlistEntry;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onSearchSong?: (query: string) => void;
  onStatusChange: (status: ContactStatus) => void;
  onNotesChange: (notes: string) => void;
}

const WatchlistEntryCard = ({
  entry,
  expanded,
  onToggle,
  onRemove,
  onSearchSong,
  onStatusChange,
  onNotesChange,
}: WatchlistEntryCardProps) => {
  const Icon = TYPE_ICONS[entry.type];
  const currentStatus = entry.contactStatus || "not_contacted";
  const statusConfig = CONTACT_STATUS_CONFIG[currentStatus];

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
                <Badge variant="outline" className={`text-[10px] ${statusConfig.color}`}>
                  {statusConfig.label}
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
          <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-3">
            {/* Contact status selector */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Outreach Status
              </p>
              <Select
                value={currentStatus}
                onValueChange={(v) => onStatusChange(v as ContactStatus)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[]).map((status) => (
                    <SelectItem key={status} value={status} className="text-xs">
                      {CONTACT_STATUS_CONFIG[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contact notes */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                Notes
              </p>
              <Textarea
                className="text-xs min-h-[60px] resize-none"
                placeholder="Add notes about outreach, response, next steps..."
                value={entry.contactNotes || ""}
                onChange={(e) => onNotesChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Songs list */}
            <div className="space-y-1.5">
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
