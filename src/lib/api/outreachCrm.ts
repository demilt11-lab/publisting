import { supabase } from "@/integrations/supabase/client";

export type OutreachEntityType = "artist" | "writer" | "producer" | "track" | "catalog";
export type OutreachStage = "discovered" | "researching" | "contacted" | "meeting" | "negotiating" | "offer" | "signed" | "passed" | "dormant";
export type OutreachStatus = "open" | "blocked" | "won" | "lost" | "on_hold";
export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
export type ContactStatus = "not_contacted" | "contacted" | "responded" | "passed" | "interested";
export const CONTACT_STATUSES: ContactStatus[] = [
  "not_contacted", "contacted", "responded", "passed", "interested",
];

export interface OutreachRecord {
  id: string;
  team_id: string;
  entity_type: OutreachEntityType;
  entity_key: string;
  entity_name: string;
  entity_meta: Record<string, unknown>;
  stage: OutreachStage;
  status: OutreachStatus;
  priority: number;
  owner_id: string | null;
  value_estimate: number | null;
  next_action: string | null;
  next_action_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_contact_date: string | null;
  contact_status: ContactStatus;
  next_follow_up_date: string | null;
  communication_notes: string | null;
}

export interface OutreachNote {
  id: string;
  outreach_id: string;
  team_id: string;
  author_id: string;
  body: string;
  mentions: string[];
  created_at: string;
}

export interface OutreachTask {
  id: string;
  outreach_id: string | null;
  team_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_at: string | null;
  status: TaskStatus;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachStatusHistory {
  id: string;
  outreach_id: string;
  changed_by: string;
  from_stage: OutreachStage | null;
  to_stage: OutreachStage | null;
  from_status: OutreachStatus | null;
  to_status: OutreachStatus | null;
  note: string | null;
  created_at: string;
}

export interface KeysetPage<T> {
  rows: T[];
  /** Cursor to pass back as `cursor` to fetch the next page; null = end. */
  nextCursor: string | null;
}

/**
 * Keyset-paginated outreach list. Sorted by (updated_at desc, id desc) so the
 * cursor encodes both keys and stays stable even when many rows share a
 * timestamp. Default page size 50, hard cap 200 to keep payloads bounded.
 */
export async function listOutreach(
  teamId: string,
  opts?: { cursor?: string | null; pageSize?: number },
): Promise<KeysetPage<OutreachRecord>> {
  const pageSize = Math.min(200, Math.max(1, opts?.pageSize ?? 50));
  let q = supabase
    .from("outreach_records")
    .select("*")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (opts?.cursor) {
    const decoded = decodeKeyset(opts.cursor);
    if (decoded) {
      // (updated_at, id) < (cursor.updated_at, cursor.id)
      q = q.or(
        `updated_at.lt.${decoded.updated_at},and(updated_at.eq.${decoded.updated_at},id.lt.${decoded.id})`,
      );
    }
  }
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []) as OutreachRecord[];
  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? encodeKeyset({ updated_at: last.updated_at, id: last.id })
    : null;
  return { rows: page, nextCursor };
}

function encodeKeyset(k: { updated_at: string; id: string }): string {
  return btoa(`${k.updated_at}|${k.id}`);
}
function decodeKeyset(c: string): { updated_at: string; id: string } | null {
  try {
    const [updated_at, id] = atob(c).split("|");
    if (!updated_at || !id) return null;
    return { updated_at, id };
  } catch { return null; }
}

export async function createOutreach(input: {
  team_id: string;
  entity_type: OutreachEntityType;
  entity_key: string;
  entity_name: string;
  entity_meta?: Record<string, unknown>;
  stage?: OutreachStage;
  owner_id?: string | null;
  priority?: number;
  value_estimate?: number | null;
  next_action?: string | null;
}): Promise<OutreachRecord> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("outreach_records")
    .insert({ ...input, created_by: u.user.id } as never)
    .select()
    .single();
  if (error) throw error;
  return data as OutreachRecord;
}

export async function updateOutreach(id: string, patch: Partial<OutreachRecord>): Promise<OutreachRecord> {
  const { data, error } = await supabase
    .from("outreach_records")
    .update(patch as never)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as OutreachRecord;
}

export async function deleteOutreach(id: string): Promise<void> {
  const { error } = await supabase.from("outreach_records").delete().eq("id", id);
  if (error) throw error;
}

export async function listNotes(outreachId: string): Promise<OutreachNote[]> {
  const { data, error } = await supabase
    .from("outreach_notes")
    .select("*")
    .eq("outreach_id", outreachId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as OutreachNote[];
}

export async function addNote(
  outreachId: string,
  teamId: string,
  body: string,
  mentions: string[] = [],
  pubIds?: { pub_artist_id?: string | null; pub_track_id?: string | null; pub_creator_id?: string | null },
): Promise<OutreachNote> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("outreach_notes")
    .insert({
      outreach_id: outreachId, team_id: teamId, body, mentions, author_id: u.user.id,
      pub_artist_id: pubIds?.pub_artist_id ?? null,
      pub_track_id: pubIds?.pub_track_id ?? null,
      pub_creator_id: pubIds?.pub_creator_id ?? null,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as OutreachNote;
}

export async function listTasks(teamId: string, opts?: { outreachId?: string; assigneeId?: string }): Promise<OutreachTask[]> {
  let q = supabase.from("outreach_tasks").select("*").eq("team_id", teamId);
  if (opts?.outreachId) q = q.eq("outreach_id", opts.outreachId);
  if (opts?.assigneeId) q = q.eq("assignee_id", opts.assigneeId);
  const { data, error } = await q.order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []) as OutreachTask[];
}

export async function createTask(input: {
  team_id: string;
  outreach_id?: string | null;
  title: string;
  description?: string;
  assignee_id?: string | null;
  due_at?: string | null;
}): Promise<OutreachTask> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("outreach_tasks")
    .insert({ ...input, created_by: u.user.id } as never)
    .select()
    .single();
  if (error) throw error;
  return data as OutreachTask;
}

export async function updateTask(id: string, patch: Partial<OutreachTask>): Promise<OutreachTask> {
  if (patch.status === "done" && !patch.completed_at) patch.completed_at = new Date().toISOString();
  const { data, error } = await supabase.from("outreach_tasks").update(patch as never).eq("id", id).select().single();
  if (error) throw error;
  return data as OutreachTask;
}

export async function listStatusHistory(outreachId: string): Promise<OutreachStatusHistory[]> {
  const { data, error } = await supabase
    .from("outreach_status_history")
    .select("*")
    .eq("outreach_id", outreachId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as OutreachStatusHistory[];
}

export const STAGES: OutreachStage[] = ["discovered","researching","contacted","meeting","negotiating","offer","signed","passed","dormant"];

/** Mark contact_status (and stamp last_contact_date when applicable) on many records at once. */
export async function bulkSetContactStatus(
  ids: string[],
  status: ContactStatus,
  opts?: { stampLastContact?: boolean; nextFollowUpDate?: string | null; communicationNotes?: string | null },
): Promise<number> {
  if (!ids.length) return 0;
  const patch: Record<string, unknown> = { contact_status: status };
  if (opts?.stampLastContact ?? (status !== "not_contacted")) {
    patch.last_contact_date = new Date().toISOString();
  }
  if (opts?.nextFollowUpDate !== undefined) patch.next_follow_up_date = opts.nextFollowUpDate;
  if (opts?.communicationNotes !== undefined) patch.communication_notes = opts.communicationNotes;
  const { error, count } = await supabase
    .from("outreach_records")
    .update(patch as never, { count: "exact" })
    .in("id", ids);
  if (error) throw error;
  return count ?? ids.length;
}

/** Returns the records whose follow-up is due today or earlier (and still open). */
export async function listOverdueFollowUps(teamId: string): Promise<OutreachRecord[]> {
  const today = new Date().toISOString().slice(0, 10);
  const q = (supabase.from("outreach_records") as any)
    .select("*")
    .eq("team_id", teamId)
    .lte("next_follow_up_date", today)
    .not("next_follow_up_date", "is", null)
    .in("contact_status", ["not_contacted", "contacted", "responded", "interested"])
    .order("next_follow_up_date", { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as OutreachRecord[];
}

export interface OutreachDismissal {
  id: string;
  team_id: string;
  entity_type: OutreachEntityType;
  entity_key: string;
  entity_name: string;
  reason: string | null;
  dismissed_by: string;
  created_at: string;
  updated_at: string;
}

export async function listDismissals(teamId: string): Promise<OutreachDismissal[]> {
  const { data, error } = await supabase
    .from("outreach_dismissals")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as OutreachDismissal[];
}

export async function dismissEntity(input: {
  team_id: string;
  entity_type: OutreachEntityType;
  entity_key: string;
  entity_name: string;
  reason?: string | null;
}): Promise<OutreachDismissal> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("outreach_dismissals")
    .upsert(
      { ...input, dismissed_by: u.user.id } as never,
      { onConflict: "team_id,entity_type,entity_key" },
    )
    .select()
    .single();
  if (error) throw error;
  return data as OutreachDismissal;
}

export async function undismissEntity(teamId: string, entityType: OutreachEntityType, entityKey: string): Promise<void> {
  const { error } = await supabase
    .from("outreach_dismissals")
    .delete()
    .eq("team_id", teamId)
    .eq("entity_type", entityType)
    .eq("entity_key", entityKey);
  if (error) throw error;
}