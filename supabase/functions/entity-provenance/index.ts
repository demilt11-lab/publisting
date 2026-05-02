import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest, resolveEntity } from "../_shared/entityLookup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);
  const sb = getServiceClient();
  const ent = await resolveEntity(sb, parsed.entity_type, parsed.pub_entity_id);
  if (!ent) return err("Entity not found", 404);

  const { data } = await sb.from("field_provenance")
    .select("field_name, source, field_value, source_value, normalized_value, confidence, conflict_state, observed_at")
    .eq("entity_type", parsed.entity_type as any).eq("entity_id", ent.uuid);

  const byField: Record<string, any[]> = {};
  for (const p of (data ?? []) as any[]) {
    (byField[p.field_name] = byField[p.field_name] || []).push(p);
  }

  return ok({
    pub_entity_id: parsed.pub_entity_id, entity_type: parsed.entity_type,
    fields: Object.entries(byField).map(([field, records]) => ({
      field, sources: records.map((r: any) => r.source),
      conflict_state: records.some((r: any) => r.conflict_state === "high") ? "high"
                    : records.some((r: any) => r.conflict_state === "medium") ? "medium" : "low",
      records,
    })),
  });
});