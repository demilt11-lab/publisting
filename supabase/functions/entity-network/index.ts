import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest, resolveEntity } from "../_shared/entityLookup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);
  const sb = getServiceClient();
  const ent = await resolveEntity(sb, parsed.entity_type, parsed.pub_entity_id);
  if (!ent) return err("Entity not found", 404);

  const nodes: any[] = [{ id: parsed.pub_entity_id, label: ent.display_name, type: parsed.entity_type, root: true }];
  const edges: any[] = [];
  let topCollab = 0; let repeat = 0;

  if (parsed.entity_type === "creator") {
    // Find tracks for this creator → other creators on those tracks
    const { data: tc } = await sb.from("track_credits").select("track_id").eq("creator_id", ent.uuid).limit(200);
    const trackIds = Array.from(new Set((tc ?? []).map((x: any) => x.track_id)));
    if (trackIds.length) {
      const { data: collabs } = await sb.from("track_credits")
        .select("creator_id, role, creators:creator_id(pub_creator_id, name)")
        .in("track_id", trackIds).neq("creator_id", ent.uuid).limit(500);
      const counts = new Map<string, { name: string; pub: string; count: number; role: string }>();
      for (const c of (collabs ?? []) as any[]) {
        const pid = c.creators?.pub_creator_id; if (!pid) continue;
        const cur = counts.get(pid);
        if (cur) { cur.count++; }
        else counts.set(pid, { pub: pid, name: c.creators?.name, count: 1, role: c.role });
      }
      for (const c of counts.values()) {
        nodes.push({ id: c.pub, label: c.name, type: "creator", weight: c.count });
        edges.push({ source: parsed.pub_entity_id, target: c.pub, weight: c.count, role: c.role });
        topCollab++;
        if (c.count > 1) repeat++;
      }
    }
  }

  return ok({
    pub_entity_id: parsed.pub_entity_id, entity_type: parsed.entity_type,
    nodes, edges,
    summary: { top_collaborators: topCollab, repeat_collaborators: repeat },
  });
});