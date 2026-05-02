import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest, resolveEntity } from "../_shared/entityLookup.ts";

/**
 * Surface scouting opportunities for a given entity:
 *  - rising entity stats (latest > prior baseline)
 *  - new credits added in the last 30 days
 *  - high source coverage but no team subscription
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);
  const sb = getServiceClient();
  const ent = await resolveEntity(sb, parsed.entity_type, parsed.pub_entity_id);
  if (!ent) return err("Entity not found", 404);

  const opportunities: { kind: string; reason: string; weight: number }[] = [];

  // Source coverage signal
  const { data: ext } = await sb.from("external_ids")
    .select("platform").eq("entity_type", parsed.entity_type as any).eq("entity_id", ent.uuid);
  const platforms = new Set((ext ?? []).map((x: any) => x.platform));
  if (platforms.size >= 3) {
    const { data: sub } = await sb.from("pub_alert_subscriptions")
      .select("id").eq("entity_type", parsed.entity_type).eq("entity_id", ent.uuid).limit(1);
    if (!sub?.length) {
      opportunities.push({ kind: "untracked_high_coverage", reason: `${platforms.size} verified sources, nobody subscribed yet`, weight: 0.8 });
    }
  }

  // Recent credits
  const sinceDate = new Date(); sinceDate.setDate(sinceDate.getDate() - 30);
  if (parsed.entity_type === "creator") {
    const { data: rc } = await sb.from("track_credits")
      .select("id").eq("creator_id", ent.uuid).gte("created_at", sinceDate.toISOString()).limit(20);
    if ((rc ?? []).length >= 2) {
      opportunities.push({ kind: "active_creator", reason: `${rc!.length} new credits in the last 30 days`, weight: 0.7 });
    }
  }

  // Chart movement
  const { data: ch } = await sb.from("chart_history")
    .select("rank, date, platform").eq("entity_type", parsed.entity_type as any).eq("entity_id", ent.uuid)
    .order("date", { ascending: false }).limit(20);
  if ((ch ?? []).some((c: any) => c.rank <= 50)) {
    opportunities.push({ kind: "charting", reason: `Recent placement in top 50`, weight: 0.9 });
  }

  opportunities.sort((a, b) => b.weight - a.weight);
  return ok({ pub_entity_id: parsed.pub_entity_id, entity_type: parsed.entity_type, opportunities });
});