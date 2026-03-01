import { useState } from "react";
import { Heart, Trash2, User, Pen, Disc3, Bell, ExternalLink, Music, Globe, Twitter, Instagram, Youtube, GripVertical, Download, ArrowUpDown, Search as SearchIcon, CheckCircle, AlertCircle, XCircle } from "lucide-react";
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

const roleIcons: Record<string, any> = { artist: User, writer: Pen, producer: Disc3 };
const roleLabels: Record<string, string> = { artist: "Artist", writer: "Writer", producer: "Producer" };

const getExternalLinks = (name: string) => {
  const encodedName = encodeURIComponent(name);
  const handleName = name.replace(/\s+/g, '').toLowerCase();
  const slugName = name.replace(/\s+/g, '-').toLowerCase();
  return {
    music: [
      { label: "Spotify", url: `https://open.spotify.com/search/${encodedName}/artists`, icon: Music },
      { label: "Apple Music", url: `https://music.apple.com/us/search?term=${encodedName}`, icon: Music },
      { label: "YouTube Music", url: `https://music.youtube.com/search?q=${encodedName}`, icon: Youtube },
    ],
    info: [
      { label: "Genius", url: `https://genius.com/artists/${slugName}`, icon: Globe },
      { label: "Discogs", url: `https://www.discogs.com/search/?q=${encodedName}&type=artist`, icon: Globe },
    ],
    social: [
      { label: "Instagram", url: `https://www.instagram.com/${handleName}`, icon: Instagram },
      { label: "X (Twitter)", url: `https://www.google.com/search?q=${encodedName}+twitter+x.com`, icon: Twitter },
      { label: "YouTube", url: `https://www.youtube.com/results?search_query=${encodedName}&sp=EgIQAg%253D%253D`, icon: Youtube },
    ],
  };
};

type SortKey = "date" | "artist" | "title";

interface FavoritesTabProps {
  onClose: () => void;
  onSearchSong?: (query: string) => void;
}

export const FavoritesTab = ({ onClose, onSearchSong }: FavoritesTabProps) => {
  const { favorites, alerts, removeFavorite, markAlertAsRead, reorderFavorites, clearAllFavorites } = useFavorites();
  const [activeTab, setActiveTab] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");

  const sortedFavorites = [...favorites].sort((a, b) => {
    if (sortBy === "artist" || sortBy === "title") return a.name.localeCompare(b.name);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const getFavExportRow = (f: Favorite, i: number) => {
    const encodedName = encodeURIComponent(f.name);
    const handleName = f.name.replace(/\s+/g, '').toLowerCase();
    const slugName = f.name.replace(/\s+/g, '-').toLowerCase();
    return {
      "#": i + 1,
      Name: f.name,
      Role: roleLabels[f.role] || f.role,
      PRO: f.pro || "",
      IPI: f.ipi || "",
      Publisher: f.publisher || "",
      "Pub Eval": f.publisher ? "Signed" : "Unsigned / Unregistered",
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
    const headers = ["Name", "Role", "PRO", "IPI", "Publisher", "Pub Eval", "Spotify", "Apple Music", "Genius", "Instagram", "X (Twitter)", "YouTube", "Date Added"];
    const rows = sortedFavorites.map((f, i) => {
      const row = getFavExportRow(f, i);
      return [row.Name, row.Role, row.PRO, row.IPI, row.Publisher, row["Pub Eval"], row.Spotify, row["Apple Music"], row.Genius, row.Instagram, row["X (Twitter)"], row.YouTube, row["Date Added"]];
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

    return (
      <Draggable key={favorite.id} draggableId={favorite.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`glass glass-hover rounded-xl p-4 flex items-center gap-4 ${snapshot.isDragging ? "ring-2 ring-primary/50 shadow-lg" : ""}`}
          >
            <div {...provided.dragHandleProps} className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
              <GripVertical className="w-4 h-4" />
            </div>
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="font-semibold text-foreground hover:text-primary transition-colors flex items-center gap-1 group">
                    {favorite.name}
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Music Platforms</DropdownMenuLabel>
                  {externalLinks.music.map((link) => (
                    <DropdownMenuItem key={link.label} asChild>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                        <link.icon className="w-4 h-4" /><span>{link.label}</span>
                        <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                      </a>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Info & Credits</DropdownMenuLabel>
                  {externalLinks.info.map((link) => (
                    <DropdownMenuItem key={link.label} asChild>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                        <link.icon className="w-4 h-4" /><span>{link.label}</span>
                        <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                      </a>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Social Media</DropdownMenuLabel>
                  {externalLinks.social.map((link) => (
                    <DropdownMenuItem key={link.label} asChild>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                        <link.icon className="w-4 h-4" /><span>{link.label}</span>
                        <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                      </a>
                    </DropdownMenuItem>
                  ))}
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
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onSearchSong && (
                <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-primary" onClick={() => onSearchSong(favorite.name)} title="Search this song">
                  <SearchIcon className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => removeFavorite(favorite.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
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
