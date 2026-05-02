import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, json } from "../_shared/cors.ts";

/**
 * Admin-only entity merge. Caller must have role 'admin' in user_roles.
 * Body: { entity_type, source_pub_id, target_pub_id, reason? }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });

  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const { entity_type, source_pub_id, target_pub_id, reason } = await req.json().catch(() => ({}));
  if (!entity_type || !source_pub_id || !target_pub_id) {
    return json({ error: "entity_type, source_pub_id, target_pub_id required" }, { status: 400 });
  }

  const { data, error } = await sb.rpc("pub_merge_entities", {
    _entity_type: entity_type,
    _source_pub_id: source_pub_id,
    _target_pub_id: target_pub_id,
    _reason: reason ?? null,
  });
  if (error) return json({ error: error.message }, { status: 400 });
  return json({ merged: true, moved: data, target_pub_id });
});