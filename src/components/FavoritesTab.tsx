import { useState } from "react";
import { Heart, Trash2, User, Pen, Disc3, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface FavoritesTabProps {
  onClose: () => void;
}

export const FavoritesTab = ({ onClose }: FavoritesTabProps) => {
  const { favorites, alerts, removeFavorite, markAlertAsRead } = useFavorites();
  const [activeTab, setActiveTab] = useState("all");

  const artists = favorites.filter((f) => f.role === "artist");
  const writers = favorites.filter((f) => f.role === "writer");
  const producers = favorites.filter((f) => f.role === "producer");

  const renderFavorite = (favorite: Favorite) => {
    const Icon = roleIcons[favorite.role];
    return (
      <div
        key={favorite.id}
        className="glass glass-hover rounded-xl p-4 flex items-center gap-4"
      >
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{favorite.name}</p>
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="all">All ({favorites.length})</TabsTrigger>
          <TabsTrigger value="artists">Artists ({artists.length})</TabsTrigger>
          <TabsTrigger value="writers">Writers ({writers.length})</TabsTrigger>
          <TabsTrigger value="producers">Producers ({producers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-2">
          {favorites.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No favorites yet. Click the heart icon on any credit to add them.
            </p>
          ) : (
            favorites.map(renderFavorite)
          )}
        </TabsContent>

        <TabsContent value="artists" className="space-y-2">
          {artists.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No favorite artists yet.</p>
          ) : (
            artists.map(renderFavorite)
          )}
        </TabsContent>

        <TabsContent value="writers" className="space-y-2">
          {writers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No favorite writers yet.</p>
          ) : (
            writers.map(renderFavorite)
          )}
        </TabsContent>

        <TabsContent value="producers" className="space-y-2">
          {producers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No favorite producers yet.</p>
          ) : (
            producers.map(renderFavorite)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
