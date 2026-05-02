import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest, resolveEntity, summarizeTrust } from "../_shared/entityLookup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);
  const sb = getServiceClient();
  const ent = await resolveEntity(sb, parsed.entity_type, parsed.pub_entity_id);
  if (!ent) return err("Entity not found", 404);

  const [{ data: ext }, { data: stats }, { data: prov }] = await Promise.all([
    sb.from("external_ids").select("platform, external_id, url, source, confidence")
      .eq("entity_type", parsed.entity_type as any).eq("entity_id", ent.uuid),
    sb.from("entity_stats_daily").select("platform, metric_name, metric_value, as_of_date")
      .eq("entity_type", parsed.entity_type).eq("pub_entity_id", parsed.pub_entity_id)
      .order("as_of_date", { ascending: false }).limit(50),
    sb.from("field_provenance").select("field_name, source, conflict_state")
      .eq("entity_type", parsed.entity_type as any).eq("entity_id", ent.uuid),
  ]);

  // collapse latest stat per metric/platform
  const latest: Record<string, number> = {};
  for (const s of (stats ?? []) as any[]) {
    const k = `${s.platform}_${s.metric_name}`;
    if (latest[k] === undefined) latest[k] = Number(s.metric_value);
  }

  const conflicts = (prov ?? []).filter((p: any) => p.conflict_state === "high").length;
  const trust = summarizeTrust(ext ?? [], conflicts, Math.min(1, (ext ?? []).length / 4));

  return ok({
    entity_type: parsed.entity_type,
    pub_entity_id: parsed.pub_entity_id,
    name: ent.display_name,
    subtitle: ent.subtitle,
    stats: latest,
    externals: (ext ?? []).map((x: any) => ({ platform: x.platform, external_id: x.external_id, url: x.url, source: x.source, confidence: Number(x.confidence) })),
    trust,
    raw: { ...ent.raw },
  });
});