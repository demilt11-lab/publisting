import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest, resolveEntity } from "../_shared/entityLookup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);

  const sb = getServiceClient();
  const ent = await resolveEntity(sb, parsed.entity_type, parsed.pub_entity_id);
  if (!ent) return err("Entity not found", 404);

  const related: any[] = [];

  if (parsed.entity_type === "creator") {
    const { data } = await sb.from("creator_relationships")
      .select("target_creator_pub_id, relationship_type, weight")
      .eq("source_creator_pub_id", parsed.pub_entity_id)
      .order("weight", { ascending: false }).limit(50);
    related.push(...(data ?? []).map((r: any) => ({
      pub_entity_id: r.target_creator_pub_id, entity_type: "creator",
      relationship_type: r.relationship_type, weight: Number(r.weight),
    })));
  } else if (parsed.entity_type === "artist") {
    const { data } = await sb.from("artist_creator_links")
      .select("pub_creator_id, relationship_type, weight")
      .eq("pub_artist_id", parsed.pub_entity_id)
      .order("weight", { ascending: false }).limit(50);
    related.push(...(data ?? []).map((r: any) => ({
      pub_entity_id: r.pub_creator_id, entity_type: "creator",
      relationship_type: r.relationship_type, weight: Number(r.weight),
    })));
  }

  return ok({ pub_entity_id: parsed.pub_entity_id, entity_type: parsed.entity_type, related });
});