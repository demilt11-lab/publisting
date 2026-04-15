import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// --- Soundcharts ---
export async function fetchSoundchartsData(artistName: string, spotifyId?: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/soundcharts-enrich`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ artist_name: artistName, spotify_id: spotifyId }),
  });
  if (!res.ok) throw new Error("Soundcharts enrichment failed");
  return res.json();
}

// --- Catalog Comparables ---
export async function fetchCatalogComps(genre?: string, minPrice?: number, maxPrice?: number) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/catalog-comps`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ genre, min_price: minPrice, max_price: maxPrice, limit: 20 }),
  });
  if (!res.ok) throw new Error("Catalog comps fetch failed");
  return res.json();
}

export async function getCatalogComparables(genre?: string) {
  let query = supabase
    .from("catalog_comparables" as any)
    .select("*")
    .order("sale_date", { ascending: false });

  if (genre) query = query.ilike("genre", `%${genre}%`);
  const { data } = await query.limit(20);
  return data || [];
}

// --- Touring Data ---
export async function fetchTouringData(artistName: string, personId?: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/touring-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ artist_name: artistName, person_id: personId }),
  });
  if (!res.ok) throw new Error("Touring data fetch failed");
  return res.json();
}

export async function getArtistTourData(artistName: string) {
  const { data } = await supabase
    .from("artist_tour_data" as any)
    .select("*")
    .eq("artist_name", artistName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
