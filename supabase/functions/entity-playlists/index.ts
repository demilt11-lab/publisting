import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest, resolveEntity } from "../_shared/entityLookup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);
  const sb = getServiceClient();
  const ent = await resolveEntity(sb, parsed.entity_type, parsed.pub_entity_id);
  if (!ent) return err("Entity not found", 404);

  const { data } = await sb.from("playlist_history")
    .select("platform, playlist_id, playlist_name, position, followers, date")
    .eq("entity_type", parsed.entity_type as any).eq("entity_id", ent.uuid)
    .order("date", { ascending: false }).limit(200);

  return ok({
    pub_entity_id: parsed.pub_entity_id, entity_type: parsed.entity_type,
    placements: data ?? [],
    summary: {
      total: (data ?? []).length,
      unique_playlists: new Set((data ?? []).map((p: any) => p.playlist_id)).size,
    },
  });
});