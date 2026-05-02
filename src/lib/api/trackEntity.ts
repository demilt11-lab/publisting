import { supabase } from "@/integrations/supabase/client";
import { pinEntity, type PinnedEntity } from "./pinnedEntities";

export type TrackableType = "artist" | "track" | "creator" | "playlist" | "publisher" | "label" | "work" | "album";

/**
 * One-call action: pin entity AND create default alert subscription (when supported).
 * Used by "Track", "Alert me", and bulk action bars.
 */
export async function trackEntity(
  userId: string,
  entityType: TrackableType,
  pubId: string,
  label?: string,
  source: PinnedEntity["source"] = "manual",
) {
  if (!userId || !pubId) return { ok: false, reason: "missing" };
  await pinEntity(userId, entityType, pubId, label, source);
  if (entityType === "artist" || entityType === "track" || entityType === "creator") {
    try { await supabase.rpc("pub_apply_default_subscriptions", { _entity_type: entityType, _pub_id: pubId }); } catch {}
  }
  return { ok: true };
}

export async function recordEntityView(entityType: TrackableType, pubId: string) {
  try {
    const { data } = await supabase.rpc("pub_record_view", { _entity_type: entityType, _pub_id: pubId });
    return (data ?? null) as { ok: boolean; view_count: number; suggest: boolean; auto_pinned: boolean; pinned: boolean } | null;
  } catch { return null; }
}

export interface TemplateRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  query: Record<string, any>;
  category: string | null;
}
export async function listTemplates(): Promise<TemplateRow[]> {
  const { data } = await supabase.from("saved_query_templates").select("*").eq("is_active", true).order("title");
  return (data ?? []) as any[];
}
export async function listMyTemplateSubs(userId: string) {
  const { data } = await supabase.from("user_template_subscriptions").select("template_id").eq("user_id", userId);
  return new Set<string>((data ?? []).map((r: any) => r.template_id));
}
export async function subscribeTemplate(userId: string, templateId: string) {
  const { error } = await supabase.from("user_template_subscriptions")
    .insert({ user_id: userId, template_id: templateId } as any);
  return !error;
}
export async function unsubscribeTemplate(userId: string, templateId: string) {
  const { error } = await supabase.from("user_template_subscriptions")
    .delete().eq("user_id", userId).eq("template_id", templateId);
  return !error;
}