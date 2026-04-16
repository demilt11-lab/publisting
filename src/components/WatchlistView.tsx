import { useState, useMemo, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Eye, X, Trash2, User, Pen, Disc3, ExternalLink, Music, Globe, Building2, Filter, ChevronDown, MessageSquare, LayoutGrid, List, UserCircle, Clock, Download, Instagram, Youtube, CheckCircle2, Star, TrendingUp, Swords, Activity, Search, Mail, CheckSquare, Square } from "lucide-react";
import { CompetitorIntelPanel } from "@/components/CompetitorIntelPanel";
import { TeamActivityFeed } from "@/components/TeamActivityFeed";
import { PipelineHealthPanel } from "@/components/PipelineHealthPanel";
import { DealScoreBadge, SuggestedActionCard, ActivityTimeline, EMAIL_TEMPLATES } from "@/components/DealPipelineWidgets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getExternalLinks } from "@/lib/externalLinks";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
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
import { useWatchlist, WatchlistEntityType, WatchlistEntry, ContactStatus, CONTACT_STATUS_CONFIG, WatchlistActivityEntry } from "@/hooks/useWatchlist";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface WatchlistViewProps {
  onClose: () => void;
  onSearchSong?: (query: string) => void;
  onViewCatalog?: (name: string, role: string) => void;
  fullScreen?: boolean;
}

const TYPE_ICONS: Record<WatchlistEntityType, typeof User> = {
  writer: Pen, producer: Disc3, artist: User, publisher: Building2, label: Disc3,
};
const TYPE_LABELS: Record<WatchlistEntityType, string> = {
  writer: "Writer", producer: "Producer", artist: "Artist", publisher: "Publisher", label: "Label",
};
const TYPE_COLORS: Record<WatchlistEntityType, string> = {
  writer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  producer: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  artist: "bg-primary/20 text-primary border-primary/30",
  publisher: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  label: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

type ViewMode = "list" | "board";

const buildWatchlistLinks = (name: string, socialLinks?: Record<string, string>) => {
  const ext = getExternalLinks(name, socialLinks);
  const find = (list: typeof ext.social, label: string) => list.find(l => l.label === label);
  return {
    instagram: find(ext.social, "Instagram"),
    spotify: find(ext.music, "Spotify"),
    genius: find(ext.info, "Genius"),
    pro: { url: `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${encodeURIComponent(name)}&Main_Search=Catalog&Search_Type=multi`, verified: false },
    mlc: { url: `https://portal.themlc.com/search?query=${encodeURIComponent(name)}`, verified: false },
  };
};

export const WatchlistView = ({ onClose, onSearchSong, onViewCatalog, fullScreen = false }: WatchlistViewProps) => {
  const {
    watchlist, removeFromWatchlist, updateContactStatus, updateContactNotes,
    getFilteredWatchlist, getStats, assignToUser, fetchActivity, activity,
    isTeamMode, members, togglePriority,
  } = useWatchlist();
  const { user } = useAuth();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<WatchlistEntityType | null>(null);
  const [majorFilter, setMajorFilter] = useState<boolean | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(fullScreen ? "board" : "list");
  const [healthOpen, setHealthOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ContactStatus | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [sortByPriority, setSortByPriority] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof EMAIL_TEMPLATES>("initial_outreach");

  const stats = useMemo(() => getStats(), [getStats]);
  const statuses = useMemo(() => Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[], []);

  const filteredList = useMemo(() => {
    let list = getFilteredWatchlist({
      type: typeFilter || undefined,
      isMajor: majorFilter ?? undefined,
    });
    if (statusFilter) {
      list = list.filter((e) => (e.contactStatus || "not_contacted") === statusFilter);
    }
    if (assigneeFilter === "me" && user) {
      list = list.filter((e) => e.assignedToUserId === user.id);
    } else if (assigneeFilter && assigneeFilter !== "me") {
      list = list.filter((e) => e.assignedToUserId === assigneeFilter);
    }
    // Text search across name, song titles, and genres
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.sources.some(s => s.songTitle.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)) ||
        (e.pro && e.pro.toLowerCase().includes(q))
      );
    }
    // Sort: priority first, then by sources count
    if (sortByPriority) {
      list = [...list].sort((a, b) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        return b.sources.length - a.sources.length;
      });
    }
    return list;
  }, [getFilteredWatchlist, typeFilter, majorFilter, statusFilter, assigneeFilter, user, sortByPriority, searchQuery]);

  // Bulk selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredList.map(e => e.id)));
  }, [filteredList]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const bulkStatusChange = useCallback((status: ContactStatus) => {
    selectedIds.forEach(id => updateContactStatus(id, status));
    toast({ title: `Updated ${selectedIds.size} entries to "${CONTACT_STATUS_CONFIG[status].label}"` });
    clearSelection();
  }, [selectedIds, updateContactStatus, toast, clearSelection]);

  const bulkDelete = useCallback(() => {
    if (!window.confirm(`Delete ${selectedIds.size} entries?`)) return;
    selectedIds.forEach(id => removeFromWatchlist(id));
    toast({ title: `Deleted ${selectedIds.size} entries` });
    clearSelection();
  }, [selectedIds, removeFromWatchlist, toast, clearSelection]);

  const bulkExport = useCallback(() => {
    const selected = filteredList.filter(e => selectedIds.has(e.id));
    const headers = ["Name", "Type", "Status", "PRO", "Songs"];
    const rows = selected.map(entry => [
      entry.name,
      TYPE_LABELS[entry.type],
      CONTACT_STATUS_CONFIG[entry.contactStatus || "not_contacted"].label,
      entry.pro || "",
      entry.sources.map(s => `${s.songTitle} - ${s.artist}`).join("; "),
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Watchlist_Selected_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: `Exported ${selected.length} entries` });
  }, [filteredList, selectedIds, toast]);

  const boardColumns = useMemo(() => {
    const columns: Record<ContactStatus, WatchlistEntry[]> = {
      not_contacted: [], reached_out: [], in_talks: [], signed: [], passed: [], no_response: [],
    };
    filteredList.forEach((entry) => {
      const status = entry.contactStatus || "not_contacted";
      columns[status].push(entry);
    });
    return columns;
  }, [filteredList]);

  const handleBoardDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const from = result.source.droppableId as ContactStatus;
    const to = result.destination.droppableId as ContactStatus;
    if (from === to) return;
    updateContactStatus(result.draggableId, to);
  }, [updateContactStatus]);

  const clearFilters = () => {
    setTypeFilter(null);
    setMajorFilter(null);
    setStatusFilter(null);
    setAssigneeFilter(null);
  };

  const hasFilters = typeFilter !== null || majorFilter !== null || statusFilter !== null || assigneeFilter !== null;

  const handleToggleExpand = useCallback((id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next && isTeamMode) {
      fetchActivity(next);
    }
  }, [expandedId, isTeamMode, fetchActivity]);

  // Export watchlist as CSV with links
  const handleExport = useCallback(() => {
    const headers = ["Name", "Type", "Status", "PRO", "IPI", "Songs", "Instagram", "Spotify", "Genius", "PRO Registry", "MLC"];
    const rows = filteredList.map(entry => {
      const links = buildWatchlistLinks(entry.name, entry.socialLinks);
      const songs = entry.sources.map(s => `${s.songTitle} - ${s.artist}`).join("; ");
      return [
        entry.name,
        TYPE_LABELS[entry.type],
        CONTACT_STATUS_CONFIG[entry.contactStatus || "not_contacted"].label,
        entry.pro || "",
        entry.ipi || "",
        songs,
        links.instagram?.url || "",
        links.spotify?.url || "",
        links.genius?.url || "",
        links.pro.url,
        links.mlc.url,
      ];
    });
    const bom = "\uFEFF";
    const csv = bom + [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Watchlist_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported!", description: `${filteredList.length} entries exported as CSV with links.` });
  }, [filteredList, toast]);

  return (
    <div className={cn("glass rounded-xl animate-fade-up", fullScreen && "h-full flex flex-col")}>
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Watchlist
          <Badge variant="secondary" className="text-[10px]">
            {watchlist.length} tracked
          </Badge>
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={handleExport} disabled={filteredList.length === 0}>
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          {!fullScreen && (
            <>
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="w-8 h-8" onClick={() => setViewMode("list")}>
                <List className="w-4 h-4" />
              </Button>
              <Button variant={viewMode === "board" ? "secondary" : "ghost"} size="icon" className="w-8 h-8" onClick={() => setViewMode("board")}>
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </>
          )}
          {!fullScreen && (
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="p-3 border-b border-border/50 bg-secondary/30">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="text-[10px]">{stats.byType.writer} Writers</Badge>
          <Badge variant="outline" className="text-[10px]">{stats.byType.producer} Producers</Badge>
          <Badge variant="outline" className="text-[10px]">{stats.byType.artist} Artists</Badge>
          <Badge variant="outline" className="text-[10px]">{stats.totalAppearances} appearances</Badge>
        </div>
      </div>

      {/* Search bar */}
      <div className="p-3 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="Search by name, song title, or PRO..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-border/50 flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              {typeFilter ? TYPE_LABELS[typeFilter] : "All Types"} <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setTypeFilter(null)}>All Types</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(Object.keys(TYPE_LABELS) as WatchlistEntityType[]).map((type) => (
              <DropdownMenuItem key={type} onClick={() => setTypeFilter(type)}>{TYPE_LABELS[type]}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              {statusFilter ? CONTACT_STATUS_CONFIG[statusFilter].label : "All Statuses"} <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setStatusFilter(null)}>All Statuses</DropdownMenuItem>
            <DropdownMenuSeparator />
            {(Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[]).map((status) => (
              <DropdownMenuItem key={status} onClick={() => setStatusFilter(status)}>{CONTACT_STATUS_CONFIG[status].label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {isTeamMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <UserCircle className="w-3 h-3" />
                {assigneeFilter === null ? "Anyone" : assigneeFilter === "me" ? "My assignments" : members.find(m => m.user_id === assigneeFilter)?.invited_email || "Member"}
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setAssigneeFilter(null)}>Anyone</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAssigneeFilter("me")}>My assignments</DropdownMenuItem>
              <DropdownMenuSeparator />
              {members.map(m => (
                <DropdownMenuItem key={m.user_id} onClick={() => setAssigneeFilter(m.user_id)}>
                  {m.invited_email || m.user_id.slice(0, 8)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              {majorFilter === null ? "Major/Indie" : majorFilter ? "Major Only" : "Indie Only"} <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setMajorFilter(null)}>All</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setMajorFilter(true)}>Major Only</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMajorFilter(false)}>Indie Only</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant={sortByPriority ? "secondary" : "outline"}
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setSortByPriority(!sortByPriority)}
          title="Sort priority items first"
        >
          <Star className={cn("w-3 h-3", sortByPriority && "fill-yellow-400 text-yellow-400")} /> Priority
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>Clear</Button>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="p-2 border-b border-border/50 bg-primary/5 flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{selectedIds.size} selected</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1">
                Move to… <ChevronDown className="w-2.5 h-2.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[]).map((status) => (
                <DropdownMenuItem key={status} onClick={() => bulkStatusChange(status)} className="text-xs">
                  {CONTACT_STATUS_CONFIG[status].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={bulkExport}>
            <Download className="w-2.5 h-2.5" /> Export
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setShowEmailDialog(true)}>
            <Mail className="w-2.5 h-2.5" /> Email
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive" onClick={bulkDelete}>
            <Trash2 className="w-2.5 h-2.5" /> Delete
          </Button>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectAll}>Select all</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={clearSelection}>Clear</Button>
          </div>
        </div>
      )}

      {/* Email Template Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Email Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {(Object.entries(EMAIL_TEMPLATES) as [keyof typeof EMAIL_TEMPLATES, typeof EMAIL_TEMPLATES[keyof typeof EMAIL_TEMPLATES]][]).map(([key, tmpl]) => (
                <Button key={key} variant={selectedTemplate === key ? "secondary" : "outline"} size="sm" className="text-xs" onClick={() => setSelectedTemplate(key)}>
                  {tmpl.label}
                </Button>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">Subject: {EMAIL_TEMPLATES[selectedTemplate].subject}</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans">{EMAIL_TEMPLATES[selectedTemplate].body}</pre>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Merge fields like {"{{artist_name}}"} will be replaced with contact data. Copy the template and personalize before sending.
            </p>
            <Button className="w-full" size="sm" onClick={() => {
              const tmpl = EMAIL_TEMPLATES[selectedTemplate];
              navigator.clipboard.writeText(`Subject: ${tmpl.subject}\n\n${tmpl.body}`);
              toast({ title: "Template copied to clipboard" });
              setShowEmailDialog(false);
            }}>
              <Mail className="w-3.5 h-3.5 mr-1.5" /> Copy Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Collapsible Pipeline Health */}
      {isTeamMode && (
        <Collapsible open={healthOpen} onOpenChange={setHealthOpen} className="border-b border-border/50">
          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">Pipeline Health</span>
            </div>
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", healthOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3">
            <PipelineHealthPanel teamId={watchlist[0]?.teamId || ""} />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Content */}
      {viewMode === "list" ? (
        <div className={cn("overflow-auto", fullScreen && "flex-1 min-h-0")}>
          <div className="p-2 space-y-1">
            {filteredList.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">
                {watchlist.length === 0
                  ? "No entries in watchlist yet. Add writers, producers, or artists from credit cards."
                  : "No entries match the current filters."}
              </p>
            ) : (
              filteredList.map((entry) => (
                <div key={entry.id} className="flex items-start gap-1">
                  <button
                    className="mt-3.5 shrink-0 w-4 h-4 rounded border border-border flex items-center justify-center hover:border-primary transition-colors"
                    onClick={() => toggleSelect(entry.id)}
                  >
                    {selectedIds.has(entry.id) ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5 text-muted-foreground/40" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <WatchlistEntryCard
                      entry={entry}
                      expanded={expandedId === entry.id}
                      onToggle={() => handleToggleExpand(entry.id)}
                      onRemove={() => removeFromWatchlist(entry.id)}
                      onSearchSong={onSearchSong}
                      onStatusChange={(status) => updateContactStatus(entry.id, status)}
                      onNotesChange={(notes) => updateContactNotes(entry.id, notes)}
                      onTogglePriority={() => togglePriority(entry.id)}
                      onAssign={isTeamMode ? (userId) => assignToUser(entry.id, userId) : undefined}
                      members={members}
                      currentUserId={user?.id}
                      activity={expandedId === entry.id ? activity : []}
                      isTeamMode={isTeamMode}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className={cn("overflow-auto", fullScreen && "flex-1 min-h-0")}>
          <DragDropContext onDragEnd={handleBoardDragEnd}>
            <div className="p-3 flex gap-3 min-w-[900px]">
              {statuses.map((status) => (
                <Droppable key={status} droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "flex-1 min-w-[150px] space-y-2 rounded-lg border border-transparent p-1 transition-colors",
                        snapshot.isDraggingOver && "bg-primary/5 border-primary/30"
                      )}
                    >
                      <div className="flex items-center justify-between sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-1">
                        <Badge variant="outline" className={`text-[10px] ${CONTACT_STATUS_CONFIG[status].color}`}>
                          {CONTACT_STATUS_CONFIG[status].label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{boardColumns[status].length}</span>
                      </div>
                      <div className="space-y-1.5 min-h-[80px]">
                        {boardColumns[status].map((entry, index) => (
                          <Draggable key={entry.id} draggableId={entry.id} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={cn(dragSnapshot.isDragging && "rotate-1")}
                              >
                                <BoardCard
                                  entry={entry}
                                  onStatusChange={(s) => updateContactStatus(entry.id, s)}
                                  onRemove={() => removeFromWatchlist(entry.id)}
                                  onSearchSong={onSearchSong}
                                  onViewCatalog={onViewCatalog}
                                  onTogglePriority={() => togglePriority(entry.id)}
                                  onNotesChange={(notes) => updateContactNotes(entry.id, notes)}
                                  isTeamMode={isTeamMode}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {boardColumns[status].length === 0 && (
                          <div className="rounded-lg border border-dashed border-border/50 p-3 text-center">
                            <p className="text-[10px] text-muted-foreground">Drop here</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
        </div>
      )}

      {/* Competitor Intelligence & Team Activity – collapsible */}
      {isTeamMode && (
        <div className="border-t border-border/50">
          <Collapsible className="border-b border-border/50">
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                <Swords className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Competitor Intelligence</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <CompetitorIntelPanel watchlistNames={watchlist.map(w => w.name)} />
            </CollapsibleContent>
          </Collapsible>
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Team Activity</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-3">
              <TeamActivityFeed compact />
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
};

/* ─── Board Card ─── */
interface BoardCardProps {
  entry: WatchlistEntry;
  onStatusChange: (status: ContactStatus) => void;
  onRemove: () => void;
  onSearchSong?: (query: string) => void;
  onViewCatalog?: (name: string, role: string) => void;
  onTogglePriority: () => void;
  onNotesChange: (notes: string) => void;
  isTeamMode: boolean;
}

const BoardCard = ({ entry, onStatusChange, onRemove, onSearchSong, onViewCatalog, onTogglePriority, onNotesChange, isTeamMode }: BoardCardProps) => {
  const [showLinks, setShowLinks] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const Icon = TYPE_ICONS[entry.type];
  const statuses = Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[];
  const currentIdx = statuses.indexOf(entry.contactStatus || "not_contacted");
  const links = buildWatchlistLinks(entry.name, entry.socialLinks);

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <button onClick={(e) => { e.stopPropagation(); onTogglePriority(); }} className="shrink-0" title={entry.isPriority ? "Remove priority" : "Mark as priority"}>
          <Star className={cn("w-3.5 h-3.5", entry.isPriority ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400")} />
        </button>
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <button
          className="text-xs font-medium text-foreground truncate flex-1 text-left hover:text-primary transition-colors"
          onClick={(e) => { e.stopPropagation(); setShowLinks(!showLinks); }}
        >
          {entry.name}
        </button>
        <button
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
          onClick={(e) => { e.stopPropagation(); setShowNotes(!showNotes); }}
          title="Notes"
        >
          <MessageSquare className={cn("w-3 h-3", entry.contactNotes ? "text-primary" : "")} />
        </button>
        <Button variant="ghost" size="icon" className="w-5 h-5 text-muted-foreground hover:text-destructive shrink-0" onClick={onRemove}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <Badge variant="outline" className={`text-[9px] ${TYPE_COLORS[entry.type]}`}>{TYPE_LABELS[entry.type]}</Badge>
        {entry.pro && <Badge variant="outline" className="text-[9px]">{entry.pro}</Badge>}
        {isTeamMode && <DealScoreBadge entryId={entry.id} teamId="" compact />}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {entry.sources.length} song{entry.sources.length !== 1 ? "s" : ""}
      </p>
      {isTeamMode && entry.assignedToEmail && (
        <p className="text-[9px] text-muted-foreground flex items-center gap-1">
          <UserCircle className="w-2.5 h-2.5" /> {entry.assignedToEmail}
        </p>
      )}

      {/* Inline notes */}
      {showNotes && (
        <div className="pt-1 border-t border-border/30 animate-fade-in">
          <Textarea
            className="text-[10px] min-h-[40px] resize-none p-1.5"
            placeholder="Add notes..."
            value={entry.contactNotes || ""}
            onChange={(e) => onNotesChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Quick links panel */}
      {showLinks && (
        <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-border/30 animate-fade-in">
          {links.instagram?.url ? (
            <a href={links.instagram.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary/50 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
              <Instagram className="w-2.5 h-2.5" /> IG {links.instagram?.verified && <CheckCircle2 className="w-2 h-2 text-primary" />}
            </a>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary/30 text-[9px] text-muted-foreground/40 cursor-not-allowed" title="No direct link available">
              <Instagram className="w-2.5 h-2.5" /> IG
            </span>
          )}
          {links.spotify?.url ? (
            <a href={links.spotify.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary/50 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
              <Music className="w-2.5 h-2.5" /> Spotify {links.spotify?.verified && <CheckCircle2 className="w-2 h-2 text-primary" />}
            </a>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary/30 text-[9px] text-muted-foreground/40 cursor-not-allowed" title="No direct link available">
              <Music className="w-2.5 h-2.5" /> Spotify
            </span>
          )}
          {links.genius?.url ? (
            <a href={links.genius.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary/50 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
              <Globe className="w-2.5 h-2.5" /> Genius
            </a>
          ) : (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary/30 text-[9px] text-muted-foreground/40 cursor-not-allowed" title="No direct link available">
              <Globe className="w-2.5 h-2.5" /> Genius
            </span>
          )}
          <a href={links.pro.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary/50 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
            <ExternalLink className="w-2.5 h-2.5" /> PRO
          </a>
          <a href={links.mlc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary/50 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
            <ExternalLink className="w-2.5 h-2.5" /> MLC
          </a>
          {onViewCatalog && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewCatalog(entry.name, entry.type || 'writer'); }}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-[9px] text-primary hover:bg-primary/20 transition-colors"
            >
              <Music className="w-2.5 h-2.5" /> Catalog
            </button>
          )}
          {!onViewCatalog && entry.sources.length > 0 && onSearchSong && (
            <button
              onClick={(e) => { e.stopPropagation(); onSearchSong(`${entry.sources[0].artist} - ${entry.sources[0].songTitle}`); }}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-[9px] text-primary hover:bg-primary/20 transition-colors"
            >
              <Music className="w-2.5 h-2.5" /> Catalog
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1 pt-1">
        {currentIdx < statuses.length - 1 && (
          <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 text-primary" onClick={() => onStatusChange(statuses[currentIdx + 1])}>
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
  onTogglePriority: () => void;
  onAssign?: (userId: string | null) => void;
  members: Array<{ user_id: string; invited_email?: string | null; role: string }>;
  currentUserId?: string;
  activity: WatchlistActivityEntry[];
  isTeamMode: boolean;
}

const WatchlistEntryCard = ({
  entry, expanded, onToggle, onRemove, onSearchSong,
  onStatusChange, onNotesChange, onTogglePriority, onAssign, members, currentUserId,
  activity, isTeamMode,
}: WatchlistEntryCardProps) => {
  const Icon = TYPE_ICONS[entry.type];
  const currentStatus = entry.contactStatus || "not_contacted";
  const statusConfig = CONTACT_STATUS_CONFIG[currentStatus];
  const links = buildWatchlistLinks(entry.name, entry.socialLinks);

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <div className="rounded-lg border border-border/50 bg-card/50 overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors text-left">
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 shrink-0"
              onClick={(e) => { e.stopPropagation(); onTogglePriority(); }}
              title={entry.isPriority ? "Remove priority" : "Mark as priority"}
            >
              <Star className={cn("w-4 h-4", entry.isPriority ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
            </Button>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${TYPE_COLORS[entry.type].split(' ')[0]}`}>
              <Icon className="w-4 h-4 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-foreground truncate">{entry.name}</span>
                <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[entry.type]}`}>{TYPE_LABELS[entry.type]}</Badge>
                <Badge variant="outline" className={`text-[10px] ${statusConfig.color}`}>{statusConfig.label}</Badge>
                {entry.pro && <Badge variant="outline" className="text-[10px]">{entry.pro}</Badge>}
                {entry.isMajor !== undefined && (
                  <Badge variant="outline" className={`text-[10px] ${entry.isMajor ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                    {entry.isMajor ? "Major" : "Indie"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {entry.sources.length} song{entry.sources.length !== 1 ? "s" : ""}
                {entry.ipi && ` • IPI: ${entry.ipi}`}
                {isTeamMode && entry.assignedToEmail && ` • ${entry.assignedToEmail}`}
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-3">
            {/* Quick links */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {links.instagram?.url ? (
                <a href={links.instagram.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <Instagram className="w-3 h-3" /> Instagram {links.instagram?.verified && <CheckCircle2 className="w-2.5 h-2.5 text-primary" />}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/30 text-[10px] text-muted-foreground/40 cursor-not-allowed" title="No direct link available">
                  <Instagram className="w-3 h-3" /> Instagram
                </span>
              )}
              {links.spotify?.url ? (
                <a href={links.spotify.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <Music className="w-3 h-3" /> Spotify {links.spotify?.verified && <CheckCircle2 className="w-2.5 h-2.5 text-primary" />}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/30 text-[10px] text-muted-foreground/40 cursor-not-allowed" title="No direct link available">
                  <Music className="w-3 h-3" /> Spotify
                </span>
              )}
              {links.genius?.url ? (
                <a href={links.genius.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <Globe className="w-3 h-3" /> Genius
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/30 text-[10px] text-muted-foreground/40 cursor-not-allowed" title="No direct link available">
                  <Globe className="w-3 h-3" /> Genius
                </span>
              )}
              <a href={links.pro.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                <ExternalLink className="w-3 h-3" /> PRO
              </a>
              <a href={links.mlc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                <ExternalLink className="w-3 h-3" /> MLC
              </a>
            </div>

            {/* Contact status selector */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Outreach Status</p>
              <Select value={currentStatus} onValueChange={(v) => onStatusChange(v as ContactStatus)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONTACT_STATUS_CONFIG) as ContactStatus[]).map((status) => (
                    <SelectItem key={status} value={status} className="text-xs">{CONTACT_STATUS_CONFIG[status].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignment (team mode) */}
            {isTeamMode && onAssign && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <UserCircle className="w-3 h-3" /> Assigned to
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {currentUserId && (
                    <Button variant={entry.assignedToUserId === currentUserId ? "secondary" : "outline"} size="sm" className="h-6 text-[10px] px-2" onClick={() => onAssign(entry.assignedToUserId === currentUserId ? null : currentUserId)}>
                      {entry.assignedToUserId === currentUserId ? "✓ Me" : "Assign to me"}
                    </Button>
                  )}
                  {members.filter(m => m.user_id !== currentUserId).map(m => (
                    <Button key={m.user_id} variant={entry.assignedToUserId === m.user_id ? "secondary" : "outline"} size="sm" className="h-6 text-[10px] px-2" onClick={() => onAssign(entry.assignedToUserId === m.user_id ? null : m.user_id)}>
                      {entry.assignedToUserId === m.user_id ? "✓ " : ""}{m.invited_email || m.user_id.slice(0, 8)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Contact notes */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Notes
              </p>
              <Textarea
                className="text-xs min-h-[60px] resize-none"
                placeholder="Add notes about outreach, response, next steps..."
                value={entry.contactNotes || ""}
                onChange={(e) => onNotesChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Suggested Actions */}
            {isTeamMode && (
              <SuggestedActionCard
                entryId={entry.id}
                teamId={entry.teamId || ""}
                personName={entry.name}
              />
            )}

            {/* Activity Timeline */}
            {isTeamMode && (
              <ActivityTimeline
                entryId={entry.id}
                teamId={entry.teamId || ""}
              />
            )}

            {/* Legacy activity log */}
            {isTeamMode && activity.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Recent changes
                </p>
                <div className="space-y-1 max-h-[120px] overflow-auto">
                  {activity.slice(0, 10).map(a => (
                    <div key={a.id} className="text-[10px] text-muted-foreground flex items-start gap-1.5 py-1 border-b border-border/30 last:border-0">
                      <span className="text-foreground font-medium shrink-0">{a.userEmail || "User"}</span>
                      <span>
                        {a.activityType === "status_change" && `moved to ${CONTACT_STATUS_CONFIG[(a.details.to as ContactStatus) || "not_contacted"]?.label || a.details.to}`}
                        {a.activityType === "assignment_change" && `assigned to ${a.details.assigned_name || "someone"}`}
                        {a.activityType === "created" && `added ${a.details.person_name}`}
                        {a.activityType === "interaction" && (a.details.note || "logged interaction")}
                      </span>
                      <span className="ml-auto text-[9px] shrink-0">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Songs list */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Appears on:</p>
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
                      <p className="text-[10px] text-muted-foreground truncate">{source.artist}</p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </button>
                ))}
                {entry.sources.length > 10 && (
                  <p className="text-[10px] text-muted-foreground text-center">+{entry.sources.length - 10} more</p>
                )}
              </div>
            </div>

            {/* Remove */}
            <Button variant="ghost" size="sm" className="w-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onRemove}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove from watchlist
            </Button>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
