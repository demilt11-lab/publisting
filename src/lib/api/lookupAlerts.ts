import { supabase } from "@/integrations/supabase/client";

export interface LookupAlert {
  id: string;
  kind: string;
  severity: "info" | "warn" | "high";
  title: string;
  body: string | null;
  track_key: string | null;
  payload: any;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export async function fetchAlerts(limit = 50): Promise<LookupAlert[]> {
  const { data } = await supabase.from("lookup_alerts")
    .select("id, kind, severity, title, body, track_key, payload, read_at, dismissed_at, created_at")
    .is("dismissed_at", null).order("created_at", { ascending: false }).limit(limit);
  return (data || []) as LookupAlert[];
}
export async function unreadCount(): Promise<number> {
  const { count } = await supabase.from("lookup_alerts")
    .select("id", { count: "exact", head: true }).is("read_at", null).is("dismissed_at", null);
  return count ?? 0;
}
export async function markRead(id: string) {
  await supabase.from("lookup_alerts").update({ read_at: new Date().toISOString() }).eq("id", id);
}
export async function dismiss(id: string) {
  await supabase.from("lookup_alerts").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
}
export async function runEvaluator(): Promise<{ created: number } | null> {
  const { data } = await supabase.functions.invoke("lookup-alerts-evaluator", { body: {} });
  return data ?? null;
}

export interface ReviewItem {
  id: string; kind: string; status: string; severity: string;
  title: string; payload: any; related_audit_id: string | null;
  related_track_key: string | null; created_at: string;
}
export async function fetchReviewQueue(status = "pending", limit = 50): Promise<ReviewItem[]> {
  const { data } = await supabase.from("review_queue")
    .select("id, kind, status, severity, title, payload, related_audit_id, related_track_key, created_at")
    .eq("status", status).order("created_at", { ascending: false }).limit(limit);
  return (data || []) as ReviewItem[];
}
export async function resolveReview(id: string, note?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("review_queue").update({
    status: "resolved", resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(), resolution_note: note ?? null,
  }).eq("id", id);
}
export async function dismissReview(id: string) {
  await supabase.from("review_queue").update({ status: "dismissed" }).eq("id", id);
}