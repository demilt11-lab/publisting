// Cron-fired batch runner: loops every subscribed saved query and invokes
// run-saved-query for each. Designed for pg_cron via net.http_post.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, ok, err } from "../_shared/pub.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: queries, error } = await sb.from("saved_queries")
    .select("id, name, user_id")
    .eq("is_subscribed", true);
  if (error) return err(error.message, 500);

  const reports: Array<{ id: string; status: string; result_count?: number; added?: number; removed?: number; error?: string }> = [];

  for (const q of (queries ?? []) as Array<{ id: string }>) {
    try {
      const { data, error: e } = await sb.functions.invoke("run-saved-query", {
        body: { saved_query_id: q.id },
      });
      if (e) reports.push({ id: q.id, status: "error", error: e.message });
      else reports.push({ id: q.id, status: "ok", ...(data as any) });
    } catch (ex) {
      reports.push({ id: q.id, status: "error", error: ex instanceof Error ? ex.message : String(ex) });
    }
  }

  return ok({ ran: reports.length, reports });
});