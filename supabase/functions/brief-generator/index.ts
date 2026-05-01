// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { team_id, kind, title, subject_type, subject_key } = await req.json();
    if (!team_id || !kind || !title) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sections: Array<{ title: string; body: string }> = [];
    let summary = "";

    if (kind === "artist" || kind === "deal") {
      const { data: alerts } = await admin
        .from("lookup_alerts")
        .select("kind, severity, summary, created_at")
        .ilike("track_key", `%${subject_key ?? ""}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      sections.push({ title: "Recent Alerts", body: (alerts ?? []).map((a: any) => `- [${a.severity}] ${a.kind}: ${a.summary}`).join("\n") || "_No alerts on file._" });

      const { data: scores } = await admin
        .from("opportunity_scores")
        .select("*")
        .eq("entity_type", subject_type ?? "artist")
        .eq("entity_key", subject_key ?? "")
        .order("computed_at", { ascending: false })
        .limit(1);
      const top = scores?.[0];
      if (top) {
        sections.push({ title: "Opportunity Score", body: `**Composite:** ${top.composite_score?.toFixed?.(1) ?? "?"} • **State:** ${top.state ?? "unknown"}` });
        summary = `${title} is currently scored ${top.composite_score?.toFixed?.(1) ?? "?"} (${top.state ?? "unknown"}).`;
      }
    }

    if (kind === "portfolio") {
      const { data: outreach } = await admin.from("outreach_records").select("stage,status,priority").eq("team_id", team_id);
      const counts: Record<string, number> = {};
      (outreach ?? []).forEach((o: any) => { counts[o.stage] = (counts[o.stage] ?? 0) + 1; });
      sections.push({ title: "Pipeline Overview", body: Object.entries(counts).map(([k, v]) => `- **${k}:** ${v}`).join("\n") || "_Empty pipeline._" });
      summary = `Portfolio brief covering ${(outreach ?? []).length} outreach records.`;
    }

    const payload = { summary, sections };

    const { data: brief, error } = await admin
      .from("briefs")
      .insert({ team_id, kind, title, subject_type: subject_type ?? null, subject_key: subject_key ?? null, payload, generated_by: user.id })
      .select()
      .single();
    if (error) throw error;

    return new Response(JSON.stringify(brief), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});