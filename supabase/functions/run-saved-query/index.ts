import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, ok, err, normalizeName } from "../_shared/pub.ts";

/**
 * Execute a saved query, snapshot results, compute diff vs. last run,
 * and emit alerts for newly matching entities (and removals).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let body: { saved_query_id?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  if (!body.saved_query_id) return err("Missing saved_query_id", 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: sq } = await sb.from("saved_queries").select("*").eq("id", body.saved_query_id).maybeSingle();
  if (!sq) return err("Saved query not found", 404);

  const filt = (sq as any).query_json ?? {};
  // Translate the query JSON into a search_documents lookup
  let q = sb.from("search_documents")
    .select("entity_type, pub_entity_id, display_name, subtitle, popularity_score, trust_score").limit(200);
  if (filt.type) q = q.eq("entity_type", filt.type);
  if (filt.region) q = q.contains("region_tags", [filt.region]);
  if (filt.q) q = q.ilike("normalized_name", `${normalizeName(String(filt.q))}%`);

  const { data: rows, error } = await q;
  if (error) return err(error.message, 500);

  const snapshot = (rows ?? []).map((r: any) => ({
    entity_type: r.entity_type, pub_entity_id: r.pub_entity_id,
    display_name: r.display_name, subtitle: r.subtitle,
  }));
  const currentKeys = new Set(snapshot.map((r) => `${r.entity_type}:${r.pub_entity_id}`));

  // Diff against last snapshot
  const { data: prev } = await sb.from("saved_query_runs")
    .select("snapshot").eq("saved_query_id", body.saved_query_id)
    .order("run_at", { ascending: false }).limit(1);
  const prevSnap = ((prev?.[0] as any)?.snapshot ?? []) as any[];
  const prevKeys = new Set(prevSnap.map((r: any) => `${r.entity_type}:${r.pub_entity_id}`));

  const added = snapshot.filter((r) => !prevKeys.has(`${r.entity_type}:${r.pub_entity_id}`));
  const removed = prevSnap.filter((r: any) => !currentKeys.has(`${r.entity_type}:${r.pub_entity_id}`));

  await sb.from("saved_query_runs").insert({
    saved_query_id: body.saved_query_id,
    result_count: snapshot.length,
    diff_count: added.length + removed.length,
    snapshot, added, removed,
  });

  // Emit alerts for newly matching entities to the saved-query owner
  for (const a of added) {
    await sb.from("lookup_alerts").insert({
      user_id: (sq as any).user_id,
      kind: "saved_query_match",
      severity: "info",
      title: `New match for "${(sq as any).name}"`,
      body: `${a.display_name} (${a.entity_type}) now matches your saved filter.`,
      entity_type: a.entity_type,
      payload: { saved_query_id: body.saved_query_id, ...a },
    });
  }

  return ok({ result_count: snapshot.length, added: added.length, removed: removed.length });
});