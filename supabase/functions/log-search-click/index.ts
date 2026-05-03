// Records a click on a search result tied to the most recent search row,
// or appends an explicit click-only row when no prior log exists.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { userFromReq } from "../_shared/userRateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const uid = await userFromReq(req);
    if (!uid) return new Response(JSON.stringify({ ok: false, error: "unauthenticated" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    const body = await req.json().catch(() => ({}));
    const query_text = String(body?.query_text ?? "").slice(0, 500);
    const clicked_entity_id = body?.clicked_entity_id ? String(body.clicked_entity_id) : null;
    const clicked_entity_type = body?.clicked_entity_type ? String(body.clicked_entity_type) : null;
    if (!clicked_entity_id) {
      return new Response(JSON.stringify({ ok: false, error: "clicked_entity_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await sb.from("user_search_logs").insert({
      user_id: uid,
      query_text: query_text || `(click:${clicked_entity_type ?? "entity"})`,
      result_count: 0,
      clicked_entity_id,
      clicked_entity_type,
      metadata: { event: "click" },
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});