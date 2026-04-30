import { supabase } from "@/integrations/supabase/client";

export type TriggerType = "opportunity_score" | "lifecycle_change" | "alert_event";
export type ActionType = "add_to_outreach" | "add_to_review" | "raise_alert" | "tag_priority";

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  owner_user_id: string | null;
  team_id: string | null;
  trigger_type: TriggerType;
  conditions: any;
  action_type: ActionType;
  action_params: any;
  cooldown_hours: number;
  last_run_at: string | null;
  fire_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRun {
  id: string;
  rule_id: string;
  triggered_by: string;
  entity_type: string | null;
  entity_key: string | null;
  display_name: string | null;
  action_type: string;
  action_status: "success" | "skipped" | "error";
  detail: any;
  created_at: string;
}

export async function fetchRules(): Promise<AutomationRule[]> {
  const { data } = await supabase.from("automation_rules")
    .select("*").order("updated_at", { ascending: false });
  return (data || []) as AutomationRule[];
}

export async function fetchRecentRuns(limit = 50): Promise<AutomationRun[]> {
  const { data } = await supabase.from("automation_runs")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  return (data || []) as AutomationRun[];
}

export async function createRule(rule: Partial<AutomationRule>) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("automation_rules")
    .insert({ ...rule, created_by: user?.id ?? null } as any)
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateRule(id: string, patch: Partial<AutomationRule>) {
  const { error } = await supabase.from("automation_rules").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function deleteRule(id: string) {
  const { error } = await supabase.from("automation_rules").delete().eq("id", id);
  if (error) throw error;
}

export async function runRuleNow(id: string) {
  const { data, error } = await supabase.functions.invoke("automation-runner", {
    body: { trigger: "manual", rule_id: id },
  });
  if (error) throw error;
  return data;
}

export async function runAllRulesNow() {
  const { data, error } = await supabase.functions.invoke("automation-runner", { body: {} });
  if (error) throw error;
  return data;
}