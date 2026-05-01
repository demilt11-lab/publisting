import { supabase } from "@/integrations/supabase/client";

export type OutreachEntityType = "artist" | "writer" | "producer" | "track" | "catalog";
export type OutreachStage = "discovered" | "researching" | "contacted" | "meeting" | "negotiating" | "offer" | "signed" | "passed" | "dormant";
export type OutreachStatus = "open" | "blocked" | "won" | "lost" | "on_hold";
export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";

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

export async function listOutreach(teamId: string): Promise<OutreachRecord[]> {
  const { data, error } = await supabase
    .from("outreach_records")
    .select("*")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as OutreachRecord[];
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
    .insert({ ...input, created_by: u.user.id })
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

export async function addNote(outreachId: string, teamId: string, body: string, mentions: string[] = []): Promise<OutreachNote> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("outreach_notes")
    .insert({ outreach_id: outreachId, team_id: teamId, body, mentions, author_id: u.user.id })
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
    .insert({ ...input, created_by: u.user.id })
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