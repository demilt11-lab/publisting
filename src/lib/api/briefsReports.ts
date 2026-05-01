import { supabase } from "@/integrations/supabase/client";
import type { OutreachEntityType } from "./outreachCrm";

export type BriefKind = "artist" | "deal" | "portfolio" | "catalog" | "custom";
export type ReportCadence = "daily" | "weekly" | "monthly" | "adhoc";

export interface Brief {
  id: string;
  team_id: string;
  kind: BriefKind;
  title: string;
  subject_type: OutreachEntityType | null;
  subject_key: string | null;
  payload: Record<string, unknown>;
  generated_by: string;
  created_at: string;
}

export interface ReportSchedule {
  id: string;
  team_id: string;
  name: string;
  cadence: ReportCadence;
  source_kinds: string[];
  filters: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReportRun {
  id: string;
  schedule_id: string | null;
  team_id: string;
  cadence: ReportCadence;
  payload: Record<string, unknown>;
  row_count: number;
  ran_at: string;
}

export async function listBriefs(teamId: string): Promise<Brief[]> {
  const { data, error } = await supabase.from("briefs").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Brief[];
}

export async function generateBrief(input: {
  team_id: string;
  kind: BriefKind;
  title: string;
  subject_type?: OutreachEntityType | null;
  subject_key?: string | null;
}): Promise<Brief> {
  const { data, error } = await supabase.functions.invoke("brief-generator", { body: input });
  if (error) throw error;
  return data as Brief;
}

export async function deleteBrief(id: string): Promise<void> {
  const { error } = await supabase.from("briefs").delete().eq("id", id);
  if (error) throw error;
}

export async function listSchedules(teamId: string): Promise<ReportSchedule[]> {
  const { data, error } = await supabase.from("report_schedules").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as ReportSchedule[];
}

export async function createSchedule(input: {
  team_id: string;
  name: string;
  cadence: ReportCadence;
  source_kinds?: string[];
  filters?: Record<string, unknown>;
}): Promise<ReportSchedule> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const next = nextRunAt(input.cadence);
  const { data, error } = await supabase.from("report_schedules").insert({ ...input, created_by: u.user.id, next_run_at: next } as never).select().single();
  if (error) throw error;
  return data as ReportSchedule;
}

export async function updateSchedule(id: string, patch: Partial<ReportSchedule>): Promise<ReportSchedule> {
  const { data, error } = await supabase.from("report_schedules").update(patch as never).eq("id", id).select().single();
  if (error) throw error;
  return data as ReportSchedule;
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from("report_schedules").delete().eq("id", id);
  if (error) throw error;
}

export async function listRuns(teamId: string, scheduleId?: string): Promise<ReportRun[]> {
  let q = supabase.from("report_runs").select("*").eq("team_id", teamId);
  if (scheduleId) q = q.eq("schedule_id", scheduleId);
  const { data, error } = await q.order("ran_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []) as ReportRun[];
}

export async function runScheduleNow(scheduleId: string): Promise<ReportRun> {
  const { data, error } = await supabase.functions.invoke("report-runner", { body: { schedule_id: scheduleId, manual: true } });
  if (error) throw error;
  return data as ReportRun;
}

function nextRunAt(c: ReportCadence): string | null {
  if (c === "adhoc") return null;
  const d = new Date();
  if (c === "daily") d.setDate(d.getDate() + 1);
  if (c === "weekly") d.setDate(d.getDate() + 7);
  if (c === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export function exportBriefAsMarkdown(brief: Brief): string {
  const p = brief.payload as Record<string, unknown>;
  const lines = [`# ${brief.title}`, ``, `**Kind:** ${brief.kind}`, `**Generated:** ${new Date(brief.created_at).toLocaleString()}`, ``];
  if (brief.subject_type) lines.push(`**Subject:** ${brief.subject_type} — ${brief.subject_key}`, "");
  const summary = (p.summary as string | undefined) ?? "";
  if (summary) lines.push("## Summary", summary, "");
  const sections = (p.sections as Array<{ title: string; body: string }> | undefined) ?? [];
  for (const s of sections) lines.push(`## ${s.title}`, s.body, "");
  return lines.join("\n");
}

export function downloadBrief(brief: Brief): void {
  const md = exportBriefAsMarkdown(brief);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${brief.title.replace(/[^a-z0-9]+/gi, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}