import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { resolveOne } from "@/lib/api/entityResolver";

export interface Favorite {
  id: string;
  name: string;
  role: "artist" | "writer" | "producer";
  ipi?: string;
  pro?: string;
  publisher?: string;
  notes?: string;
  created_at: string;
  sort_order: number;
}

export interface CreditAlert {
  id: string;
  favorite_id: string;
  song_title: string;
  artist: string;
  credit_role: string;
  discovered_at: string;
  is_read: boolean;
}

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [alerts, setAlerts] = useState<CreditAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchFavorites = async () => {
    if (!user) {
      setFavorites([]);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("favorites")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error fetching favorites:", error);
    } else {
      setFavorites(data as Favorite[]);
    }
    setIsLoading(false);
  };

  const fetchAlerts = async () => {
    if (!user) {
      setAlerts([]);
      return;
    }

    const { data, error } = await supabase
      .from("credit_alerts")
      .select("*")
      .eq("is_read", false)
      .order("discovered_at", { ascending: false });

    if (error) {
      console.error("Error fetching alerts:", error);
    } else {
      setAlerts(data as CreditAlert[]);
    }
  };

  useEffect(() => {
    fetchFavorites();
    fetchAlerts();
  }, [user]);

  const addFavorite = async (
    name: string,
    role: "artist" | "writer" | "producer",
    ipi?: string,
    pro?: string,
    publisher?: string,
    /** If true, skip the toast (used for cross-sync from watchlist) */
    silent?: boolean
  ) => {
    if (!user) {
      if (!silent) {
        toast({
          title: "Sign in required",
          description: "Please sign in to add favorites.",
          variant: "destructive",
        });
      }
      return false;
    }

    // Check if already exists
    if (isFavorite(name, role)) return true;

    // Re-anchor to canonical pub_ ID. Artists -> pub_artist_id, writers/producers -> pub_creator_id.
    let pub_artist_id: string | null = null;
    let pub_creator_id: string | null = null;
    try {
      if (role === "artist") {
        const r = await resolveOne({ entity_type: "artist", name, ipi, pro } as any);
        pub_artist_id = r.pub_id;
      } else {
        const r = await resolveOne({ entity_type: "creator", name, primary_role: role, ipi, pro } as any);
        pub_creator_id = r.pub_id;
      }
    } catch (e) { /* fail-open: still write text-anchored row */ }

    const { error } = await supabase.from("favorites").insert({
      user_id: user.id,
      name,
      role,
      ipi,
      pro,
      publisher,
      pub_artist_id,
      pub_creator_id,
    } as any);

    if (error) {
      if (error.code === "23505") {
        if (!silent) {
          toast({
            title: "Already favorited",
            description: `${name} is already in your favorites.`,
          });
        }
      } else {
        if (!silent) {
          toast({
            title: "Error",
            description: "Failed to add favorite.",
            variant: "destructive",
          });
        }
      }
      return false;
    }

    if (!silent) {
      toast({
        title: "Added to favorites",
        description: `${name} has been added to your favorites.`,
        duration: 3000,
      });
    }
    
    await fetchFavorites();
    return true;
  };

  const removeFavorite = async (id: string) => {
    const { error } = await supabase.from("favorites").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove favorite.",
        variant: "destructive",
      });
      return false;
    }

    await fetchFavorites();
    return true;
  };

  const removeFavoriteByNameRole = async (name: string, role: string) => {
    const fav = favorites.find((f) => f.name === name && f.role === role);
    if (!fav) return false;
    return removeFavorite(fav.id);
  };

  const toggleFavorite = async (
    name: string,
    role: "artist" | "writer" | "producer",
    ipi?: string,
    pro?: string,
    publisher?: string
  ) => {
    if (isFavorite(name, role)) {
      const removed = await removeFavoriteByNameRole(name, role);
      if (removed) {
        toast({
          title: "Removed from favorites",
          description: `${name} has been removed from your favorites.`,
        });
      }
      return !removed; // returns false if successfully removed (not favorited anymore)
    } else {
      return addFavorite(name, role, ipi, pro, publisher);
    }
  };

  const isFavorite = (name: string, role: string) => {
    return favorites.some((f) => f.name === name && f.role === role);
  };

  const markAlertAsRead = async (alertId: string) => {
    await supabase
      .from("credit_alerts")
      .update({ is_read: true })
      .eq("id", alertId);
    await fetchAlerts();
  };

  const clearAllFavorites = async () => {
    if (!user) return;
    const { error } = await supabase.from("favorites").delete().eq("user_id", user.id);
    if (error) {
      toast({ title: "Error", description: "Failed to clear favorites.", variant: "destructive" });
    } else {
      setFavorites([]);
      toast({ title: "Favorites cleared", description: "All favorites have been removed." });
    }
  };

  const reorderFavorites = async (reorderedFavorites: Favorite[]) => {
    // Optimistic update
    setFavorites(reorderedFavorites);

    // Update sort_order for each favorite
    const updates = reorderedFavorites.map((fav, index) =>
      supabase
        .from("favorites")
        .update({ sort_order: index })
        .eq("id", fav.id)
    );

    const results = await Promise.all(updates);
    const hasError = results.some((r) => r.error);
    if (hasError) {
      toast({
        title: "Error",
        description: "Failed to save order.",
        variant: "destructive",
      });
      await fetchFavorites(); // Revert
    }
  };

  const updateFavoriteNotes = async (id: string, notes: string) => {
    const { error } = await supabase.from("favorites").update({ notes } as any).eq("id", id);
    if (!error) {
      setFavorites(prev => prev.map(f => f.id === id ? { ...f, notes } : f));
    }
  };

  return {
    favorites,
    alerts,
    isLoading,
    addFavorite,
    removeFavorite,
    removeFavoriteByNameRole,
    toggleFavorite,
    isFavorite,
    markAlertAsRead,
    reorderFavorites,
    clearAllFavorites,
    updateFavoriteNotes,
    refreshFavorites: fetchFavorites,
    refreshAlerts: fetchAlerts,
  };
};
