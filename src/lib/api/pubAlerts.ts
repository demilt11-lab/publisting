import { supabase } from "@/integrations/supabase/client";

export interface PubAlert {
  id: string;
  kind: string;
  severity: "high" | "warn" | "info" | string;
  title: string;
  body: string | null;
  pub_artist_id: string | null;
  pub_track_id: string | null;
  pub_creator_id: string | null;
  entity_uuid: string | null;
  entity_type: string | null;
  payload: Record<string, any>;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface AlertFilters {
  kinds?: string[];
  entityTypes?: Array<"artist" | "track" | "creator">;
  status?: "all" | "unread" | "read";
  search?: string;
}

export async function fetchInboxAlerts(filters: AlertFilters = {}, limit = 200): Promise<PubAlert[]> {
  let q = supabase.from("lookup_alerts")
    .select("*")
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters.kinds?.length) q = q.in("kind", filters.kinds);
  if (filters.entityTypes?.length) q = q.in("entity_type", filters.entityTypes as any);
  if (filters.status === "unread") q = q.is("read_at", null);
  if (filters.status === "read") q = q.not("read_at", "is", null);
  const { data } = await q;
  let rows = (data ?? []) as any as PubAlert[];
  if (filters.search?.trim()) {
    const s = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (a) => a.title?.toLowerCase().includes(s) || a.body?.toLowerCase().includes(s),
    );
  }
  return rows;
}

export async function markManyRead(ids: string[]) {
  if (!ids.length) return;
  await supabase.from("lookup_alerts")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);
}

export async function markManyDismissed(ids: string[]) {
  if (!ids.length) return;
  await supabase.from("lookup_alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .in("id", ids);
}

export interface SubscriptionRow {
  id: string;
  entity_type: "artist" | "track" | "creator";
  entity_id: string;
  pub_id: string;
  created_at: string;
}

export async function listMySubscriptions(userId: string): Promise<SubscriptionRow[]> {
  const { data } = await supabase.from("pub_alert_subscriptions")
    .select("id, entity_type, entity_id, pub_id, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false });
  return (data ?? []) as any[];
}

export function detailPathForAlert(a: PubAlert): string | null {
  if (a.entity_type === "artist" && a.pub_artist_id) return `/artist/${a.pub_artist_id}`;
  if (a.entity_type === "track" && a.pub_track_id) return `/track/${a.pub_track_id}`;
  if (a.entity_type === "creator" && a.pub_creator_id) {
    // creator routes split by role — we default to writer; the detail page handles both kinds
    return `/writer/${a.pub_creator_id}`;
  }
  return null;
}

export async function fetchEntityAlerts(
  entityType: "artist" | "track" | "creator",
  entityUuid: string,
  limit = 25,
): Promise<PubAlert[]> {
  const { data } = await supabase.from("lookup_alerts")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_uuid", entityUuid)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as any[];
}

export async function isSubscribed(
  entityType: "artist" | "track" | "creator",
  entityUuid: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase.from("pub_alert_subscriptions")
    .select("id").eq("entity_type", entityType).eq("entity_id", entityUuid).eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function subscribe(
  entityType: "artist" | "track" | "creator",
  entityUuid: string,
  pubId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase.from("pub_alert_subscriptions").insert({
    user_id: userId, entity_type: entityType, entity_id: entityUuid, pub_id: pubId,
  } as any);
  return !error;
}

export async function unsubscribe(subscriptionId: string): Promise<boolean> {
  const { error } = await supabase.from("pub_alert_subscriptions").delete().eq("id", subscriptionId);
  return !error;
}