// Returns ranked search results WITH score breakdown for the ranking-QA admin tool.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, ok, err } from "../_shared/pub.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: { q?: string; type?: string; platform?: string; region?: string; limit?: number } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const q = (body.q ?? "").trim();
  if (!q) return err("Missing q", 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const { data, error } = await sb.rpc("pub_search_rank_debug", {
    _q: q, _type: body.type ?? null, _platform: body.platform ?? null,
    _region: body.region ?? null, _limit: body.limit ?? 20,
  });
  if (error) return err(error.message, 500);

  const { data: weights } = await sb.from("ranking_weights").select("*").eq("id", "default").maybeSingle();
  return ok({ q, results: data ?? [], weights: weights ?? null });
});