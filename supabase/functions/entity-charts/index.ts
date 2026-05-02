import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest, resolveEntity } from "../_shared/entityLookup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);
  const sb = getServiceClient();
  const ent = await resolveEntity(sb, parsed.entity_type, parsed.pub_entity_id);
  if (!ent) return err("Entity not found", 404);

  const { data } = await sb.from("chart_history")
    .select("platform, chart_type, country, rank, date")
    .eq("entity_type", parsed.entity_type as any).eq("entity_id", ent.uuid)
    .order("date", { ascending: false }).limit(200);

  const peak = (data ?? []).reduce((acc: any, r: any) => {
    const k = `${r.platform}::${r.chart_type}::${r.country ?? ""}`;
    if (!acc[k] || r.rank < acc[k].rank) acc[k] = { ...r };
    return acc;
  }, {} as Record<string, any>);

  return ok({
    pub_entity_id: parsed.pub_entity_id, entity_type: parsed.entity_type,
    history: data ?? [], peaks: Object.values(peak),
  });
});