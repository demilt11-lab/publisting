import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest, resolveEntity } from "../_shared/entityLookup.ts";

/**
 * Queue a refresh for an entity. Logs to entity_refresh_log + refreshes search_documents.
 * Provider-specific syncs (sync-spotify-entity etc.) can be invoked separately and will
 * write back to the relevant raw tables; this function handles the canonical bookkeeping.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);
  const sb = getServiceClient();
  const ent = await resolveEntity(sb, parsed.entity_type, parsed.pub_entity_id);
  if (!ent) return err("Entity not found", 404);

  let reason = "manual";
  try {
    const u = new URL(req.url);
    reason = u.searchParams.get("reason") || reason;
  } catch { /* ignore */ }

  const { data: log } = await sb.from("entity_refresh_log").insert({
    entity_type: parsed.entity_type, pub_entity_id: parsed.pub_entity_id,
    refresh_reason: reason, source: "refresh-entity", status: "running",
  }).select("id").single();

  // Refresh denormalized search doc (pure SQL — fast, deterministic)
  const { error: rpcErr } = await sb.rpc("pub_refresh_search_document", {
    _entity_type: parsed.entity_type, _pub_entity_id: parsed.pub_entity_id,
  });

  // Touch last_refreshed_at on the canonical row
  const tableMap: Record<string, [string, string]> = {
    artist: ["artists", "pub_artist_id"],
    track: ["tracks", "pub_track_id"],
    album: ["albums", "pub_album_id"],
    creator: ["creators", "pub_creator_id"],
  };
  const [tbl, key] = tableMap[parsed.entity_type];
  await sb.from(tbl).update({ last_refreshed_at: new Date().toISOString() }).eq(key, parsed.pub_entity_id);

  await sb.from("entity_refresh_log").update({
    status: rpcErr ? "error" : "completed",
    completed_at: new Date().toISOString(),
    error_text: rpcErr?.message ?? null,
  }).eq("id", (log as any).id);

  return ok({ refreshed: !rpcErr, error: rpcErr?.message ?? null });
});