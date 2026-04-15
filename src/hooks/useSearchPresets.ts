import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { SearchFilters } from "@/components/AdvancedFilters";

export interface SearchPreset {
  id: string;
  user_id: string;
  name: string;
  filters: SearchFilters;
  regions: string[];
  is_shared: boolean;
  team_id: string | null;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

export const useSearchPresets = () => {
  const [presets, setPresets] = useState<SearchPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchPresets = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("saved_search_presets")
      .select("*")
      .order("usage_count", { ascending: false });
    if (data) setPresets(data as unknown as SearchPreset[]);
    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const savePreset = async (name: string, filters: SearchFilters, regions: string[], teamId?: string) => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) { toast({ title: "Name required", variant: "destructive" }); return; }
    const { error } = await supabase.from("saved_search_presets").insert({
      user_id: user.id,
      name: trimmed,
      filters: filters as any,
      regions,
      is_shared: !!teamId,
      team_id: teamId || null,
    });
    if (error) {
      toast({ title: "Error saving preset", variant: "destructive" });
      return;
    }
    toast({ title: "Preset saved", description: `"${trimmed}" saved.` });
    fetchPresets();
  };

  const usePreset = async (preset: SearchPreset) => {
    await supabase
      .from("saved_search_presets")
      .update({ usage_count: preset.usage_count + 1, last_used_at: new Date().toISOString() })
      .eq("id", preset.id);
    fetchPresets();
    return { filters: preset.filters, regions: preset.regions };
  };

  const deletePreset = async (id: string) => {
    await supabase.from("saved_search_presets").delete().eq("id", id);
    toast({ title: "Preset deleted" });
    fetchPresets();
  };

  return { presets, isLoading, savePreset, usePreset, deletePreset };
};
