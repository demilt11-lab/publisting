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