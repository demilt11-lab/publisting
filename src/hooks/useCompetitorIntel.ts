import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTeamContext } from "@/contexts/TeamContext";
import { useToast } from "./use-toast";

export interface CompetitorSigning {
  id: string;
  team_id: string;
  person_name: string;
  person_type: string;
  competitor_name: string;
  deal_date: string | null;
  estimated_value_range: string | null;
  genre: string | null;
  news_source_url: string | null;
  notes: string | null;
  watchlist_entry_id: string | null;
  created_by: string;
  created_at: string;
}

export interface CompetitorStats {
  name: string;
  signings: number;
  genres: string[];
  recentDate: string | null;
}

export const useCompetitorIntel = () => {
  const [signings, setSignings] = useState<CompetitorSigning[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { activeTeam } = useTeamContext();
  const { toast } = useToast();

  const fetchSignings = useCallback(async () => {
    if (!activeTeam) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("competitor_signings")
      .select("*")
      .eq("team_id", activeTeam.id)
      .order("created_at", { ascending: false });
    if (!error && data) setSignings(data as CompetitorSigning[]);
    setIsLoading(false);
  }, [activeTeam]);

  useEffect(() => { fetchSignings(); }, [fetchSignings]);

  const addSigning = async (signing: {
    person_name: string;
    person_type?: string;
    competitor_name: string;
    deal_date?: string;
    estimated_value_range?: string;
    genre?: string;
    news_source_url?: string;
    notes?: string;
    watchlist_entry_id?: string;
  }) => {
    if (!user || !activeTeam) return;
    const { error } = await supabase.from("competitor_signings").insert({
      team_id: activeTeam.id,
      created_by: user.id,
      person_name: signing.person_name,
      person_type: signing.person_type || "writer",
      competitor_name: signing.competitor_name,
      deal_date: signing.deal_date || null,
      estimated_value_range: signing.estimated_value_range || null,
      genre: signing.genre || null,
      news_source_url: signing.news_source_url || null,
      notes: signing.notes || null,
      watchlist_entry_id: signing.watchlist_entry_id || null,
    });
    if (error) {
      toast({ title: "Error", description: "Failed to add competitor signing.", variant: "destructive" });
      return;
    }
    toast({ title: "Competitor signing tracked" });
    fetchSignings();
  };

  const removeSigning = async (id: string) => {
    await supabase.from("competitor_signings").delete().eq("id", id);
    fetchSignings();
  };

  const competitorStats: CompetitorStats[] = (() => {
    const map = new Map<string, { signings: number; genres: Set<string>; recentDate: string | null }>();
    for (const s of signings) {
      const existing = map.get(s.competitor_name) || { signings: 0, genres: new Set<string>(), recentDate: null };
      existing.signings++;
      if (s.genre) existing.genres.add(s.genre);
      if (s.deal_date && (!existing.recentDate || s.deal_date > existing.recentDate)) {
        existing.recentDate = s.deal_date;
      }
      map.set(s.competitor_name, existing);
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, signings: data.signings, genres: Array.from(data.genres), recentDate: data.recentDate }))
      .sort((a, b) => b.signings - a.signings);
  })();

  const watchlistOverlap = (watchlistNames: string[]) => {
    const lower = new Set(watchlistNames.map(n => n.toLowerCase()));
    return signings.filter(s => lower.has(s.person_name.toLowerCase()));
  };

  return { signings, competitorStats, isLoading, addSigning, removeSigning, watchlistOverlap, refresh: fetchSignings };
};
