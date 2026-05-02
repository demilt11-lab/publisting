import { supabase } from "@/integrations/supabase/client";

export interface PinnedEntity {
  id: string;
  user_id: string;
  entity_type: "artist" | "track" | "creator" | "album" | "playlist" | "publisher" | "label" | "work";
  pub_id: string;
  label: string | null;
  source: "manual" | "alert" | "watchlist" | "seeded";
  created_at: string;
}

export async function listMyPins(userId: string): Promise<PinnedEntity[]> {
  const { data } = await supabase
    .from("pinned_entities")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as any[]) as PinnedEntity[];
}

export async function pinEntity(
  userId: string,
  entityType: PinnedEntity["entity_type"],
  pubId: string,
  label?: string,
  source: PinnedEntity["source"] = "manual",
): Promise<boolean> {
  const { error } = await supabase.from("pinned_entities").upsert(
    { user_id: userId, entity_type: entityType, pub_id: pubId, label: label ?? null, source },
    { onConflict: "user_id,entity_type,pub_id" },
  );
  return !error;
}

export async function unpinEntity(userId: string, entityType: string, pubId: string): Promise<boolean> {
  const { error } = await supabase
    .from("pinned_entities")
    .delete()
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .eq("pub_id", pubId);
  return !error;
}

/** Seed pins for a user with no pins yet. Best-effort. */
export async function seedPinsIfEmpty(userId: string): Promise<number> {
  const existing = await listMyPins(userId);
  if (existing.length > 0) return 0;
  const { data } = await supabase.rpc("pub_seed_pins_from_recent", { _user_id: userId, _limit: 5 });
  return Number(data ?? 0);
}

export function pinHref(p: PinnedEntity): string | null {
  switch (p.entity_type) {
    case "artist":    return `/artist/${p.pub_id}`;
    case "track":     return `/track/${p.pub_id}`;
    case "creator":   return `/writer/${p.pub_id}`;
    case "playlist":  return `/playlist/${p.pub_id}`;
    case "publisher": return `/publisher/${p.pub_id}`;
    case "label":     return `/label/${p.pub_id}`;
    case "work":      return `/work/${p.pub_id}`;
    default:          return null;
  }
}