// Evaluates automation_rules and performs their actions.
//
// Triggers:
//   POST {}                       → cron sweep, evaluates all enabled rules
//   POST { trigger:"alert_event", alert_id, ... } → evaluates only alert_event rules for this alert
//   POST { trigger:"manual", rule_id }            → evaluates a single rule on demand
//
// Conditions DSL (per rule):
//   trigger_type=opportunity_score:
//     { min_score?: number, max_score?: number,
//       entity_types?: ("track"|"artist"|"writer"|"producer")[],
//       lifecycle_in?: string[], min_data_points?: number }
//   trigger_type=alert_event:
//     { alert_kinds?: string[], min_severity?: "info"|"warn"|"high" }
//   trigger_type=lifecycle_change:
//     { from?: string[], to?: string[], entity_types?: string[] }
//
// Actions:
//   add_to_outreach    → upsert into watchlist_entries (team scope) with pipeline_status='not_contacted'
//   add_to_review      → insert into review_queue
//   raise_alert        → insert into lookup_alerts
//   tag_priority       → mark watchlist_entries.is_priority=true
//
// Cooldown: skip if a successful run for the same rule + entity exists in the last cooldown_hours.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sevRank: Record<string, number> = { info: 0, warn: 1, high: 2 };

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function withinCooldown(sb: any, ruleId: string, entityType: string, entityKey: string, hours: number) {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  const { data } = await sb
    .from("automation_runs")
    .select("id")
    .eq("rule_id", ruleId).eq("entity_type", entityType).eq("entity_key", entityKey)
    .eq("action_status", "success").gte("created_at", since).limit(1);
  return (data?.length ?? 0) > 0;
}

async function logRun(sb: any, row: any) {
  await sb.from("automation_runs").insert(row);
}

async function performAction(sb: any, rule: any, entity: { type: string; key: string; name: string }, ctx: any) {
  const params = rule.action_params || {};
  switch (rule.action_type) {
    case "add_to_outreach": {
      // Need a team. Prefer rule.team_id; else any team owned by created_by.
      let teamId: string | null = rule.team_id;
      if (!teamId && rule.created_by) {
        const { data } = await sb.from("teams").select("id").eq("created_by", rule.created_by).limit(1);
        teamId = data?.[0]?.id ?? null;
      }
      if (!teamId) return { status: "skipped", detail: { reason: "no team scope" } };

      const personType = entity.type === "writer" || entity.type === "producer" || entity.type === "artist" ? entity.type : "writer";
      const upsertRow = {
        team_id: teamId,
        person_name: entity.name,
        person_type: personType,
        pipeline_status: params.lane || "not_contacted",
        created_by: rule.created_by ?? rule.owner_user_id,
      };
      const { data, error } = await sb.from("watchlist_entries")
        .upsert(upsertRow, { onConflict: "team_id,person_name,person_type" })
        .select("id").maybeSingle();
      if (error) return { status: "error", detail: { error: error.message } };

      if (data?.id) {
        await sb.from("pipeline_activities").insert({
          entry_id: data.id, team_id: teamId,
          activity_type: "automation",
          details: { rule_id: rule.id, rule_name: rule.name, ...ctx },
          created_by: rule.created_by ?? rule.owner_user_id,
        });
      }
      return { status: "success", detail: { entry_id: data?.id, team_id: teamId, lane: upsertRow.pipeline_status } };
    }
    case "tag_priority": {
      let teamId: string | null = rule.team_id;
      if (!teamId) return { status: "skipped", detail: { reason: "no team scope" } };
      const personType = ["writer","producer","artist"].includes(entity.type) ? entity.type : "writer";
      const { error } = await sb.from("watchlist_entries")
        .update({ is_priority: true })
        .eq("team_id", teamId).eq("person_name", entity.name).eq("person_type", personType);
      return error ? { status: "error", detail: { error: error.message } } : { status: "success", detail: {} };
    }
    case "add_to_review": {
      const { data, error } = await sb.from("review_queue").insert({
        kind: "automation",
        severity: params.severity || "info",
        title: `${rule.name}: ${entity.name}`,
        payload: { entity, rule_id: rule.id, ...ctx },
        related_track_key: entity.type === "track" ? entity.key : null,
        status: "pending",
      }).select("id").maybeSingle();
      return error ? { status: "error", detail: { error: error.message } } : { status: "success", detail: { review_id: data?.id } };
    }
    case "raise_alert": {
      const { data, error } = await sb.from("lookup_alerts").insert({
        kind: "automation",
        severity: params.severity || "info",
        title: `${rule.name}: ${entity.name}`,
        body: rule.description || null,
        track_key: entity.type === "track" ? entity.key : null,
        payload: { entity, rule_id: rule.id, ...ctx },
        delivered_via: ["in_app"],
      }).select("id").maybeSingle();
      return error ? { status: "error", detail: { error: error.message } } : { status: "success", detail: { alert_id: data?.id } };
    }
  }
  return { status: "skipped", detail: { reason: "unknown action" } };
}

async function evalOpportunityRule(sb: any, rule: any, triggeredBy: string) {
  const c = rule.conditions || {};
  let q = sb.from("opportunity_scores")
    .select("entity_type, entity_key, display_name, score, lifecycle_state, data_points");
  if (typeof c.min_score === "number") q = q.gte("score", c.min_score);
  if (typeof c.max_score === "number") q = q.lte("score", c.max_score);
  if (Array.isArray(c.entity_types) && c.entity_types.length) q = q.in("entity_type", c.entity_types);
  if (Array.isArray(c.lifecycle_in) && c.lifecycle_in.length) q = q.in("lifecycle_state", c.lifecycle_in);
  if (typeof c.min_data_points === "number") q = q.gte("data_points", c.min_data_points);
  q = q.order("score", { ascending: false }).limit(c.limit ?? 100);
  const { data, error } = await q;
  if (error) return { matched: 0, fired: 0, errors: [error.message] };

  let fired = 0;
  const errors: string[] = [];
  for (const row of (data || []) as any[]) {
    if (await withinCooldown(sb, rule.id, row.entity_type, row.entity_key, rule.cooldown_hours || 24)) continue;
    const res = await performAction(sb, rule, { type: row.entity_type, key: row.entity_key, name: row.display_name }, {
      score: row.score, lifecycle: row.lifecycle_state, triggered_by: triggeredBy,
    });
    await logRun(sb, {
      rule_id: rule.id, triggered_by: triggeredBy,
      entity_type: row.entity_type, entity_key: row.entity_key, display_name: row.display_name,
      action_type: rule.action_type, action_status: res.status,
      detail: res.detail,
    });
    if (res.status === "success") fired++;
    else if (res.status === "error") errors.push(JSON.stringify(res.detail));
  }
  return { matched: data?.length ?? 0, fired, errors };
}

async function evalAlertRule(sb: any, rule: any, alert: any) {
  const c = rule.conditions || {};
  if (Array.isArray(c.alert_kinds) && c.alert_kinds.length && !c.alert_kinds.includes(alert.kind)) {
    return { matched: 0, fired: 0, errors: [] };
  }
  if (c.min_severity && (sevRank[alert.severity] ?? 0) < (sevRank[c.min_severity] ?? 0)) {
    return { matched: 0, fired: 0, errors: [] };
  }
  const entityKey = alert.track_key || alert.id;
  const entityName = alert.title || alert.track_key || alert.id;
  if (await withinCooldown(sb, rule.id, "track", entityKey, rule.cooldown_hours || 24)) {
    return { matched: 1, fired: 0, errors: [] };
  }
  const res = await performAction(sb, rule, { type: "track", key: entityKey, name: entityName }, {
    triggered_by: "alert_event", alert_id: alert.id, kind: alert.kind, severity: alert.severity,
  });
  await logRun(sb, {
    rule_id: rule.id, triggered_by: "alert_event",
    entity_type: "track", entity_key: entityKey, display_name: entityName,
    action_type: rule.action_type, action_status: res.status, detail: res.detail,
  });
  return { matched: 1, fired: res.status === "success" ? 1 : 0, errors: res.status === "error" ? [JSON.stringify(res.detail)] : [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let body: any = {};
    try { body = await req.json(); } catch { /* */ }

    const trigger = body?.trigger || "cron";
    let totalFired = 0;
    let rulesEvaluated = 0;
    const allErrors: string[] = [];

    if (trigger === "alert_event" && body?.alert_id) {
      const { data: alert } = await sb.from("lookup_alerts").select("*").eq("id", body.alert_id).maybeSingle();
      if (!alert) return json({ ok: true, fired: 0, note: "alert not found" });
      const { data: rules } = await sb.from("automation_rules")
        .select("*").eq("enabled", true).eq("trigger_type", "alert_event");
      for (const rule of (rules || []) as any[]) {
        rulesEvaluated++;
        const r = await evalAlertRule(sb, rule, alert);
        totalFired += r.fired;
        allErrors.push(...r.errors);
        if (r.fired) {
          await sb.from("automation_rules").update({
            last_run_at: new Date().toISOString(),
            fire_count: (rule.fire_count || 0) + r.fired,
          }).eq("id", rule.id);
        }
      }
      return json({ ok: true, trigger, rules_evaluated: rulesEvaluated, fired: totalFired, errors: allErrors });
    }

    if (trigger === "manual" && body?.rule_id) {
      const { data: rule } = await sb.from("automation_rules").select("*").eq("id", body.rule_id).maybeSingle();
      if (!rule) return json({ error: "rule not found" }, 404);
      if (!rule.enabled) return json({ error: "rule disabled" }, 400);
      let r: any;
      if (rule.trigger_type === "opportunity_score" || rule.trigger_type === "lifecycle_change") {
        r = await evalOpportunityRule(sb, rule, "manual");
      } else {
        return json({ error: "alert_event rules can only fire from real alerts" }, 400);
      }
      await sb.from("automation_rules").update({
        last_run_at: new Date().toISOString(),
        fire_count: (rule.fire_count || 0) + r.fired,
      }).eq("id", rule.id);
      return json({ ok: true, trigger: "manual", ...r });
    }

    // Cron sweep: opportunity rules only (alert rules fire on alert insert)
    const { data: rules } = await sb.from("automation_rules")
      .select("*").eq("enabled", true).in("trigger_type", ["opportunity_score","lifecycle_change"]);
    for (const rule of (rules || []) as any[]) {
      rulesEvaluated++;
      const r = await evalOpportunityRule(sb, rule, "cron");
      totalFired += r.fired;
      allErrors.push(...r.errors);
      await sb.from("automation_rules").update({
        last_run_at: new Date().toISOString(),
        fire_count: (rule.fire_count || 0) + r.fired,
      }).eq("id", rule.id);
    }
    return json({ ok: true, trigger: "cron", rules_evaluated: rulesEvaluated, fired: totalFired, errors: allErrors.slice(0, 20) });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});