// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function nextRun(c: string): string | null {
  if (c === "adhoc") return null;
  const d = new Date();
  if (c === "daily") d.setDate(d.getDate() + 1);
  if (c === "weekly") d.setDate(d.getDate() + 7);
  if (c === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

async function buildReportPayload(admin: any, teamId: string, sources: string[], filters: Record<string, unknown>) {
  const sinceDays = (filters?.window_days as number) ?? 7;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const out: Record<string, unknown> = {};

  if (sources.includes("lookup")) {
    const { data } = await admin.from("lookup_history").select("query,result_summary,created_at").gte("created_at", since).limit(200);
    out.lookup = data ?? [];
  }
  if (sources.includes("chart")) {
    const { data } = await admin.from("chart_history").select("track_key,chart,position,recorded_at").gte("recorded_at", since).limit(200);
    out.chart = data ?? [];
  }
  if (sources.includes("alert")) {
    const { data } = await admin.from("lookup_alerts").select("kind,severity,summary,track_key,created_at").gte("created_at", since).limit(200);
    out.alerts = data ?? [];
  }
  if (sources.includes("portfolio")) {
    const { data } = await admin.from("outreach_records").select("entity_name,entity_type,stage,status,priority,updated_at").eq("team_id", teamId).gte("updated_at", since).limit(200);
    out.portfolio = data ?? [];
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({}));

    let schedules: any[] = [];
    if (body.schedule_id) {
      const { data } = await admin.from("report_schedules").select("*").eq("id", body.schedule_id).limit(1);
      schedules = data ?? [];
    } else {
      const { data } = await admin.from("report_schedules").select("*").eq("enabled", true).lte("next_run_at", new Date().toISOString());
      schedules = data ?? [];
    }

    const runs: any[] = [];
    for (const s of schedules) {
      const payload = await buildReportPayload(admin, s.team_id, s.source_kinds ?? [], s.filters ?? {});
      const rowCount = Object.values(payload).reduce<number>((acc, v) => acc + (Array.isArray(v) ? v.length : 0), 0);
      const { data: run } = await admin.from("report_runs").insert({ schedule_id: s.id, team_id: s.team_id, cadence: s.cadence, payload, row_count: rowCount }).select().single();
      await admin.from("report_schedules").update({ last_run_at: new Date().toISOString(), next_run_at: nextRun(s.cadence) }).eq("id", s.id);
      runs.push(run);
    }

    if (body.manual && runs.length === 1) {
      return new Response(JSON.stringify(runs[0]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ runs: runs.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});