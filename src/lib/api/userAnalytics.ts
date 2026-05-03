import { supabase } from "@/integrations/supabase/client";

export interface AdminAnalytics {
  ok: true;
  dau: { day: string; users: number }[];
  top_searches: { query: string; count: number }[];
  top_clicks: { id: string; type: string | null; count: number }[];
  watchlist_growth: { day: string; count: number }[];
  totals: { searches_7d: number; unique_users_7d: number; watchlist_added_7d: number };
  generated_at: string;
}

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const { data, error } = await supabase.functions.invoke("admin-analytics", { body: {} });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "Failed to load analytics");
  return data as AdminAnalytics;
}

export async function logSearchClick(
  clickedEntityId: string,
  clickedEntityType: string,
  queryText?: string,
): Promise<void> {
  try {
    await supabase.functions.invoke("log-search-click", {
      body: {
        clicked_entity_id: clickedEntityId,
        clicked_entity_type: clickedEntityType,
        query_text: queryText ?? "",
      },
    });
  } catch (_) { /* best effort */ }
}