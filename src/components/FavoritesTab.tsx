import { useState, useMemo, useCallback } from "react";
import { Heart, Trash2, User, Pen, Disc3, Bell, ExternalLink, Music, Globe, Instagram, Youtube, GripVertical, Download, ArrowUpDown, Search as SearchIcon, CheckCircle, AlertCircle, XCircle, Library, MessageSquare, ChevronDown, Check, Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { openExternalLink } from "@/lib/links/safeOpen";
import { getExternalLinks } from "@/lib/externalLinks";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Favorite, CreditAlert, useFavorites } from "@/hooks/useFavorites";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useWatchlist, CONTACT_STATUS_CONFIG, ContactStatus } from "@/hooks/useWatchlist";

const roleIcons: Record<string, any> = { artist: User, writer: Pen, producer: Disc3 };
const roleLabels: Record<string, string> = { artist: "Artist", writer: "Writer", producer: "Producer" };

type SortKey = "date" | "artist" | "title" | "priority";

interface FavoritesTabProps {
  onClose: () => void;
  onSearchSong?: (query: string) => void;
  onViewCatalog?: (name: string, role: string) => void;
}

export const FavoritesTab = ({ onClose, onSearchSong, onViewCatalog }: FavoritesTabProps) => {
  const { favorites, alerts, removeFavorite, markAlertAsRead, reorderFavorites, clearAllFavorites, updateFavoriteNotes } = useFavorites();
  const { watchlist, addToWatchlist } = useWatchlist();
  const [activeTab, setActiveTab] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [expandedFavId, setExpandedFavId] = useState<string | null>(null);

  // Build a lookup: name (lowercase) → watchlist entry
  const watchlistLookup = useMemo(() => {
    const map = new Map<string, { status: ContactStatus; isPriority: boolean }>();
    watchlist.forEach(w => {
      map.set(w.name.toLowerCase(), {
        status: (w.contactStatus || "not_contacted") as ContactStatus,
        isPriority: w.isPriority,
      });
    });
    return map;
  }, [watchlist]);

  const sortedFavorites = useMemo(() => {
    const list = [...favorites];
    if (sortBy === "artist" || sortBy === "title") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "priority") {
      list.sort((a, b) => {
        const aPriority = watchlistLookup.get(a.name.toLowerCase())?.isPriority ? 1 : 0;
        const bPriority = watchlistLookup.get(b.name.toLowerCase())?.isPriority ? 1 : 0;
        return bPriority - aPriority || a.name.localeCompare(b.name);
      });
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [favorites, sortBy, watchlistLookup]);

  const getFavExportRow = (f: Favorite, i: number) => {
    const encodedName = encodeURIComponent(f.name);
    const handleName = f.name.replace(/\s+/g, '').toLowerCase();
    const slugName = f.name.replace(/\s+/g, '-').toLowerCase();
    const wlEntry = watchlistLookup.get(f.name.toLowerCase());
    return {
      "#": i + 1,
      Name: f.name,
      Role: roleLabels[f.role] || f.role,
      PRO: f.pro || "",
      IPI: f.ipi || "",
      Publisher: f.publisher || "",
      "Pub Eval": f.publisher ? "Signed" : "Unsigned / Unregistered",
      "Pipeline Status": wlEntry ? CONTACT_STATUS_CONFIG[wlEntry.status].label : "Not on Watchlist",
      Priority: wlEntry?.isPriority ? "Yes" : "",
      Spotify: `https://open.spotify.com/search/${encodedName}/artists`,
      "Apple Music": `https://music.apple.com/us/search?term=${encodedName}`,
      Genius: `https://genius.com/artists/${slugName}`,
      Instagram: `https://www.instagram.com/${handleName}`,
      "X (Twitter)": `https://www.google.com/search?q=${encodedName}+twitter+x.com`,
      YouTube: `https://www.youtube.com/results?search_query=${encodedName}`,
      "Date Added": new Date(f.created_at).toLocaleDateString(),
    };
  };

  const exportToExcel = () => {
    const data = sortedFavorites.map((f, i) => getFavExportRow(f, i));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Favorites");
    XLSX.writeFile(wb, "Favorites.xlsx");
  };

  const exportCSV = () => {
    const headers = ["Name", "Role", "PRO", "IPI", "Publisher", "Pub Eval", "Pipeline Status", "Priority", "Spotify", "Apple Music", "Genius", "Instagram", "X (Twitter)", "YouTube", "Date Added"];
    const rows = sortedFavorites.map((f, i) => {
      const row = getFavExportRow(f, i);
      return [row.Name, row.Role, row.PRO, row.IPI, row.Publisher, row["Pub Eval"], row["Pipeline Status"], row.Priority, row.Spotify, row["Apple Music"], row.Genius, row.Instagram, row["X (Twitter)"], row.YouTube, row["Date Added"]];
    });
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "all-favorites.csv";
    a.click();
  };

  const artists = sortedFavorites.filter((f) => f.role === "artist");
  const writers = sortedFavorites.filter((f) => f.role === "writer");
  const producers = sortedFavorites.filter((f) => f.role === "producer");

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    if (sourceIndex === destIndex) return;
    const listId = result.source.droppableId;
    let currentList: Favorite[];
    if (listId === "all") currentList = [...sortedFavorites];
    else if (listId === "artists") currentList = [...artists];
    else if (listId === "writers") currentList = [...writers];
    else currentList = [...producers];
    const [moved] = currentList.splice(sourceIndex, 1);
    currentList.splice(destIndex, 0, moved);
    if (listId === "all") {
      reorderFavorites(currentList);
    } else {
      const reordered = [...favorites];
      const roleName = listId === "artists" ? "artist" : listId === "writers" ? "writer" : "producer";
      let insertIdx = 0;
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].role === roleName) {
          reordered[i] = currentList[insertIdx];
          insertIdx++;
        }
      }
      reorderFavorites(reordered);
    }
  };

  const renderFavorite = (favorite: Favorite, index: number) => {
    const Icon = roleIcons[favorite.role] || User;
    const externalLinks = getExternalLinks(favorite.name);
    const isSigned = !!favorite.publisher;
    const wlEntry = watchlistLookup.get(favorite.name.toLowerCase());
    const pipelineStatus = wlEntry?.status || null;
    const isPriority = wlEntry?.isPriority || false;

    return (
      <Draggable key={favorite.id} draggableId={favorite.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`glass glass-hover rounded-xl overflow-hidden ${snapshot.isDragging ? "ring-2 ring-primary/50 shadow-lg" : ""}`}
          >
            <Collapsible open={expandedFavId === favorite.id} onOpenChange={() => setExpandedFavId(expandedFavId === favorite.id ? null : favorite.id)}>
              <div className="p-4 flex items-center gap-3">
                <div {...provided.dragHandleProps} className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                  <GripVertical className="w-4 h-4" />
                </div>
                {isPriority && (
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 shrink-0" />
                )}
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1 group">
                        {favorite.name}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Music Platforms</DropdownMenuLabel>
                      {externalLinks.music.map((link) => 
                        link.url ? (
                          <DropdownMenuItem key={link.label} asChild>
                            <a href={link.url || "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openExternalLink({ url: link.url, label: link.label, name: favorite.name, category: "music", verified: link.verified }); }} className="flex items-center gap-2 cursor-pointer">
                              <link.icon className="w-4 h-4" /><span>{link.label}</span>
                              {link.verified && <Check className="w-3 h-3 text-emerald-400" />}
                              <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                            </a>
                          </DropdownMenuItem>
                        ) : (
                          <TooltipProvider key={link.label} delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground/50 cursor-not-allowed select-none">
                                  <link.icon className="w-4 h-4" /><span className="text-sm">{link.label}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">No direct link available</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Info & Credits</DropdownMenuLabel>
                      {externalLinks.info.map((link) =>
                        link.url ? (
                          <DropdownMenuItem key={link.label} asChild>
                            <a href={link.url || "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openExternalLink({ url: link.url, label: link.label, name: favorite.name, category: "info", verified: link.verified }); }} className="flex items-center gap-2 cursor-pointer">
                              <link.icon className="w-4 h-4" /><span>{link.label}</span>
                              {link.verified && <Check className="w-3 h-3 text-emerald-400" />}
                              <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                            </a>
                          </DropdownMenuItem>
                        ) : (
                          <TooltipProvider key={link.label} delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground/50 cursor-not-allowed select-none">
                                  <link.icon className="w-4 h-4" /><span className="text-sm">{link.label}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">No direct link available</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Social Media</DropdownMenuLabel>
                      {externalLinks.social.map((link) =>
                        link.url ? (
                          <DropdownMenuItem key={link.label} asChild>
                            <a href={link.url || "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openExternalLink({ url: link.url, label: link.label, name: favorite.name, category: "social", verified: link.verified }); }} className="flex items-center gap-2 cursor-pointer">
                              <link.icon className="w-4 h-4" /><span>{link.label}</span>
                              {link.verified && <Check className="w-3 h-3 text-emerald-400" />}
                              <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                            </a>
                          </DropdownMenuItem>
                        ) : (
                          <TooltipProvider key={link.label} delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground/50 cursor-not-allowed select-none">
                                  <link.icon className="w-4 h-4" /><span className="text-sm">{link.label}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">No direct link available</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{roleLabels[favorite.role] || favorite.role}</Badge>
                    {favorite.pro && <Badge variant="outline" className="text-xs">{favorite.pro}</Badge>}
                    {favorite.publisher && (
                      <Badge variant="outline" className="text-xs text-primary border-primary/20">{favorite.publisher}</Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${isSigned ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"}`}
                    >
                      {isSigned ? <><CheckCircle className="w-2.5 h-2.5 mr-0.5" /> Signed</> : <><AlertCircle className="w-2.5 h-2.5 mr-0.5" /> Unsigned</>}
                    </Badge>
                    {/* Pipeline status from watchlist */}
                    {pipelineStatus && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${CONTACT_STATUS_CONFIG[pipelineStatus].color}`}
                      >
                        {CONTACT_STATUS_CONFIG[pipelineStatus].label}
                      </Badge>
                    )}
                    {favorite.notes && (
                      <Badge variant="outline" className="text-[10px] bg-secondary/50">
                        <MessageSquare className="w-2.5 h-2.5 mr-0.5" /> Notes
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {onViewCatalog && (
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={() => onViewCatalog(favorite.name, favorite.role)} title="View catalog">
                      <Library className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {onSearchSong && (
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={() => onSearchSong(favorite.name)} title="Search this song">
                      <SearchIcon className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" title="Notes & details">
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedFavId === favorite.id ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => removeFavorite(favorite.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <CollapsibleContent>
                <div className="px-4 pb-4 pt-1 border-t border-border/50">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1.5">
                    <MessageSquare className="w-3 h-3" /> Notes
                  </p>
                  <Textarea
                    className="text-xs min-h-[60px] resize-none"
                    placeholder="Add notes about this artist..."
                    value={favorite.notes || ""}
                    onChange={(e) => updateFavoriteNotes(favorite.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </Draggable>
    );
  };

  const renderAlert = (alert: CreditAlert) => (
    <div key={alert.id} className="glass glass-hover rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
        <Bell className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">New Credit Found</p>
        <p className="text-sm text-muted-foreground truncate">"{alert.song_title}" by {alert.artist}</p>
        <p className="text-xs text-muted-foreground mt-1">{new Date(alert.discovered_at).toLocaleDateString()}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => markAlertAsRead(alert.id)}>Dismiss</Button>
    </div>
  );

  const renderList = (list: Favorite[], droppableId: string) => (
    list.length === 0 ? (
      <p className="text-center text-muted-foreground py-8">No favorites in this category yet.</p>
    ) : (
      <Droppable droppableId={droppableId}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
            {list.map((fav, i) => renderFavorite(fav, i))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    )
  );

  return (
    <div className="glass rounded-2xl p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Heart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Favorites</h2>
            <p className="text-sm text-muted-foreground">Track your favorite creators</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-7 w-auto text-xs">
              <ArrowUpDown className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="artist">Name A-Z</SelectItem>
              <SelectItem value="title">Title A-Z</SelectItem>
              <SelectItem value="priority">Priority First</SelectItem>
            </SelectContent>
          </Select>
          {favorites.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportToExcel}>
                <Download className="w-3 h-3 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportCSV}>
                <Download className="w-3 h-3 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => {
                if (window.confirm(`Remove all ${favorites.length} favorites?`)) {
                  clearAllFavorites();
                }
              }}>
                <XCircle className="w-3 h-3 mr-1" /> Clear All
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            New Credits ({alerts.length})
          </h3>
          <div className="space-y-2">{alerts.map(renderAlert)}</div>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="all">All ({sortedFavorites.length})</TabsTrigger>
            <TabsTrigger value="artists">Artists ({artists.length})</TabsTrigger>
            <TabsTrigger value="writers">Writers ({writers.length})</TabsTrigger>
            <TabsTrigger value="producers">Producers ({producers.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="all">{renderList(sortedFavorites, "all")}</TabsContent>
          <TabsContent value="artists">{renderList(artists, "artists")}</TabsContent>
          <TabsContent value="writers">{renderList(writers, "writers")}</TabsContent>
          <TabsContent value="producers">{renderList(producers, "producers")}</TabsContent>
        </Tabs>
      </DragDropContext>
    </div>
  );
};
