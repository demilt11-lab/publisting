import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest } from "../_shared/entityLookup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);
  if (parsed.entity_type !== "track") {
    return ok({ pub_entity_id: parsed.pub_entity_id, entity_type: parsed.entity_type, airplay: [], summary: { total_spins: 0 } });
  }
  const sb = getServiceClient();
  const { data } = await sb.from("airplay_history")
    .select("territory, station, spins, captured_at")
    .eq("pub_track_id", parsed.pub_entity_id)
    .order("captured_at", { ascending: false }).limit(500);

  const total = (data ?? []).reduce((s: number, r: any) => s + Number(r.spins || 0), 0);
  return ok({
    pub_entity_id: parsed.pub_entity_id, entity_type: "track",
    airplay: data ?? [],
    summary: { total_spins: total, stations: new Set((data ?? []).map((r: any) => r.station)).size },
  });
});