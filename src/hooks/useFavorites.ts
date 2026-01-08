import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

export interface Favorite {
  id: string;
  name: string;
  role: "artist" | "writer" | "producer";
  ipi?: string;
  pro?: string;
  publisher?: string;
  created_at: string;
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
      .order("created_at", { ascending: false });

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
    publisher?: string
  ) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to add favorites.",
        variant: "destructive",
      });
      return false;
    }

    const { error } = await supabase.from("favorites").insert({
      user_id: user.id,
      name,
      role,
      ipi,
      pro,
      publisher,
    });

    if (error) {
      if (error.code === "23505") {
        toast({
          title: "Already favorited",
          description: `${name} is already in your favorites.`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to add favorite.",
          variant: "destructive",
        });
      }
      return false;
    }

    toast({
      title: "Added to favorites",
      description: `${name} has been added to your favorites.`,
    });
    
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

  return {
    favorites,
    alerts,
    isLoading,
    addFavorite,
    removeFavorite,
    isFavorite,
    markAlertAsRead,
    refreshFavorites: fetchFavorites,
    refreshAlerts: fetchAlerts,
  };
};
