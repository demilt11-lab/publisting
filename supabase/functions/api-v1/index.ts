import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Public /api/v1 router for external API consumers.
 * Auth: Bearer <api_key> where api_key is the api_clients.id (UUID).
 * Quotas: enforced via api_check_and_increment RPC.
 * Errors: { error: { code, message, details? } }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function err(status: number, code: string, message: string, details?: any) {
  return new Response(JSON.stringify({ error: { code, message, details } }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function ok(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = Date.now();
  const url = new URL(req.url);
  // Path is /api-v1/<resource>/...; strip the function prefix
  const parts = url.pathname.replace(/^\/?api-v1\/?/, "").split("/").filter(Boolean);
  const resource = parts[0] || "";
  const id = parts[1];

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return err(401, "missing_token", "API key is required");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: client } = await admin.from("api_clients").select("*").eq("id", token).maybeSingle();
  if (!client || !client.is_active) return err(401, "invalid_token", "API key is invalid or inactive");

  const { data: gate } = await admin.rpc("api_check_and_increment", { _client_id: client.id });
  const gateObj = gate as any;
  if (gateObj && !gateObj.allowed) {
    await admin.from("api_request_log").insert({
      client_id: client.id, method: req.method, path: url.pathname,
      status_code: 429, error: gateObj.reason, latency_ms: Date.now() - started,
    });
    return err(429, gateObj.reason, "Rate limit or quota exceeded", gateObj);
  }

  let response: Response;
  try {
    if (resource === "search") {
      const q = url.searchParams.get("q") || "";
      const type = url.searchParams.get("type");
      const limit = Math.min(50, parseInt(url.searchParams.get("limit") || "20"));
      if (!q) { response = err(400, "missing_q", "query parameter 'q' is required"); }
      else {
        const { data, error } = await admin.rpc("pub_search_rank", {
          _q: q, _type: type, _limit: limit,
        });
        if (error) response = err(500, "search_failed", error.message);
        else response = ok({ results: data });
      }
    } else if (["artists","tracks","creators","albums","playlists","publishers","labels","works"].includes(resource)) {
      const table = resource;
      const pubCol = resource === "creators"
        ? "pub_creator_id"
        : resource === "playlists" ? "pub_playlist_id"
        : resource === "publishers" ? "pub_publisher_id"
        : resource === "labels" ? "pub_label_id"
        : resource === "works" ? "pub_work_id"
        : `pub_${resource.slice(0, -1)}_id`;
      if (id) {
        const { data, error } = await admin.from(table as any).select("*").eq(pubCol, id).maybeSingle();
        if (error) response = err(500, "db_error", error.message);
        else if (!data) response = err(404, "not_found", `${resource.slice(0, -1)} not found`);
        else response = ok({ data });
      } else {
        const limit = Math.min(100, parseInt(url.searchParams.get("limit") || "50"));
        const { data, error } = await admin.from(table as any).select("*").limit(limit);
        if (error) response = err(500, "db_error", error.message);
        else response = ok({ data });
      }
    } else if (resource === "alerts") {
      const limit = Math.min(100, parseInt(url.searchParams.get("limit") || "50"));
      const { data, error } = await admin.from("lookup_alerts")
        .select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) response = err(500, "db_error", error.message);
      else response = ok({ data });
    } else if (resource === "" || resource === "health") {
      response = ok({ status: "ok", version: client.api_version, scopes: client.scopes });
    } else {
      response = err(404, "unknown_resource", `Unknown resource '${resource}'`);
    }
  } catch (e) {
    response = err(500, "server_error", (e as Error).message);
  }

  await admin.from("api_request_log").insert({
    client_id: client.id, method: req.method, path: url.pathname,
    status_code: response.status, latency_ms: Date.now() - started,
    user_agent: req.headers.get("user-agent"),
  });

  return response;
});