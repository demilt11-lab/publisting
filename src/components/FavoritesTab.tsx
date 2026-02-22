import { useState } from "react";
import { Heart, Trash2, User, Pen, Disc3, Bell, ExternalLink, Music, Globe, Twitter, Instagram, Youtube, GripVertical, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Favorite, CreditAlert, useFavorites } from "@/hooks/useFavorites";

const roleIcons = {
  artist: User,
  writer: Pen,
  producer: Disc3,
};

const roleLabels = {
  artist: "Artist",
  writer: "Writer",
  producer: "Producer",
};

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
      { label: "X (Twitter)", url: `https://x.com/${handleName}`, icon: Twitter },
      { label: "YouTube", url: `https://www.youtube.com/results?search_query=${encodedName}&sp=EgIQAg%253D%253D`, icon: Youtube },
    ],
  };
};

interface FavoritesTabProps {
  onClose: () => void;
}

export const FavoritesTab = ({ onClose }: FavoritesTabProps) => {
  const { favorites, alerts, removeFavorite, markAlertAsRead, reorderFavorites } = useFavorites();
  const [activeTab, setActiveTab] = useState("all");

  const exportToExcel = () => {
    const data = favorites.map((f, i) => {
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
        Spotify: `https://open.spotify.com/search/${encodedName}/artists`,
        Genius: `https://genius.com/artists/${slugName}`,
        Instagram: `https://www.instagram.com/${handleName}`,
        "Date Added": new Date(f.created_at).toLocaleDateString(),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Favorites");
    XLSX.writeFile(wb, "Favorites.xlsx");
  };

  const artists = favorites.filter((f) => f.role === "artist");
  const writers = favorites.filter((f) => f.role === "writer");
  const producers = favorites.filter((f) => f.role === "producer");

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    if (sourceIndex === destIndex) return;

    // Determine which list we're reordering
    const listId = result.source.droppableId;
    let currentList: Favorite[];
    if (listId === "all") currentList = [...favorites];
    else if (listId === "artists") currentList = [...artists];
    else if (listId === "writers") currentList = [...writers];
    else currentList = [...producers];

    const [moved] = currentList.splice(sourceIndex, 1);
    currentList.splice(destIndex, 0, moved);

    if (listId === "all") {
      reorderFavorites(currentList);
    } else {
      // For filtered lists, rebuild the full order
      const reordered = [...favorites];
      const filteredIds = currentList.map((f) => f.id);
      let insertIdx = 0;
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].role === (listId === "artists" ? "artist" : listId === "writers" ? "writer" : "producer")) {
          reordered[i] = currentList[insertIdx];
          insertIdx++;
        }
      }
      reorderFavorites(reordered);
    }
  };

  const renderFavorite = (favorite: Favorite, index: number) => {
    const Icon = roleIcons[favorite.role];
    const externalLinks = getExternalLinks(favorite.name);
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
                        <link.icon className="w-4 h-4" />
                        <span>{link.label}</span>
                        <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                      </a>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Info & Credits</DropdownMenuLabel>
                  {externalLinks.info.map((link) => (
                    <DropdownMenuItem key={link.label} asChild>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                        <link.icon className="w-4 h-4" />
                        <span>{link.label}</span>
                        <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                      </a>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Social Media</DropdownMenuLabel>
                  {externalLinks.social.map((link) => (
                    <DropdownMenuItem key={link.label} asChild>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                        <link.icon className="w-4 h-4" />
                        <span>{link.label}</span>
                        <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                      </a>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {roleLabels[favorite.role]}
                </Badge>
                {favorite.pro && (
                  <Badge variant="outline" className="text-xs">
                    {favorite.pro}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => removeFavorite(favorite.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </Draggable>
    );
  };

  const renderAlert = (alert: CreditAlert) => (
    <div
      key={alert.id}
      className="glass glass-hover rounded-xl p-4 flex items-center gap-4"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
        <Bell className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">New Credit Found</p>
        <p className="text-sm text-muted-foreground truncate">
          "{alert.song_title}" by {alert.artist}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(alert.discovered_at).toLocaleDateString()}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => markAlertAsRead(alert.id)}
      >
        Dismiss
      </Button>
    </div>
  );

  return (
    <div className="glass rounded-2xl p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Heart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Favorites
            </h2>
            <p className="text-sm text-muted-foreground">
              Track your favorite creators
            </p>
          </div>
        </div>
        {favorites.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-1.5" />
            Excel
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {alerts.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            New Credits ({alerts.length})
          </h3>
          <div className="space-y-2">
            {alerts.map(renderAlert)}
          </div>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="all">All ({favorites.length})</TabsTrigger>
            <TabsTrigger value="artists">Artists ({artists.length})</TabsTrigger>
            <TabsTrigger value="writers">Writers ({writers.length})</TabsTrigger>
            <TabsTrigger value="producers">Producers ({producers.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            {favorites.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No favorites yet. Click the heart icon on any credit to add them.
              </p>
            ) : (
              <Droppable droppableId="all">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {favorites.map((fav, i) => renderFavorite(fav, i))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            )}
          </TabsContent>

          <TabsContent value="artists">
            {artists.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No favorite artists yet.</p>
            ) : (
              <Droppable droppableId="artists">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {artists.map((fav, i) => renderFavorite(fav, i))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            )}
          </TabsContent>

          <TabsContent value="writers">
            {writers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No favorite writers yet.</p>
            ) : (
              <Droppable droppableId="writers">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {writers.map((fav, i) => renderFavorite(fav, i))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            )}
          </TabsContent>

          <TabsContent value="producers">
            {producers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No favorite producers yet.</p>
            ) : (
              <Droppable droppableId="producers">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {producers.map((fav, i) => renderFavorite(fav, i))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            )}
          </TabsContent>
        </Tabs>
      </DragDropContext>
    </div>
  );
};
