import { corsHeaders, ok, err } from "../_shared/pub.ts";
import { getServiceClient, parseEntityRequest, resolveEntity } from "../_shared/entityLookup.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const parsed = await parseEntityRequest(req);
  if (!parsed) return err("Missing entity_type / pub_entity_id", 400);

  const sb = getServiceClient();
  const ent = await resolveEntity(sb, parsed.entity_type, parsed.pub_entity_id);
  if (!ent) return err("Entity not found", 404);

  let credits: any[] = [];
  if (parsed.entity_type === "track") {
    const { data } = await sb.from("track_credits")
      .select("role, share, confidence, source, source_count, creators:creator_id(pub_creator_id, name, primary_role)")
      .eq("track_id", ent.uuid).limit(200);
    credits = (data ?? []).map((c: any) => ({
      pub_creator_id: c.creators?.pub_creator_id,
      name: c.creators?.name,
      role: c.role,
      share: c.share ?? null,
      confidence: Number(c.confidence ?? 1),
      source_count: c.source_count ?? 1,
      sources: c.source ? [c.source] : [],
    }));
  } else if (parsed.entity_type === "creator") {
    const { data } = await sb.from("track_credits")
      .select("role, share, confidence, source, source_count, tracks:track_id(pub_track_id, title, primary_artist_name)")
      .eq("creator_id", ent.uuid).limit(200);
    credits = (data ?? []).map((c: any) => ({
      pub_track_id: c.tracks?.pub_track_id,
      track_title: c.tracks?.title,
      track_artist: c.tracks?.primary_artist_name,
      role: c.role,
      share: c.share ?? null,
      confidence: Number(c.confidence ?? 1),
      source_count: c.source_count ?? 1,
      sources: c.source ? [c.source] : [],
    }));
  } else {
    // Artists/albums: aggregate via their tracks
    const trackTable = "tracks";
    const trackKey = parsed.entity_type === "artist" ? "primary_artist_id" : "album_id";
    const { data: tracks } = await sb.from(trackTable).select("id, pub_track_id, title").eq(trackKey, ent.uuid).limit(50);
    const trackIds = (tracks ?? []).map((t: any) => t.id);
    if (trackIds.length) {
      const { data: tc } = await sb.from("track_credits")
        .select("track_id, role, confidence, creators:creator_id(pub_creator_id, name, primary_role)")
        .in("track_id", trackIds).limit(500);
      credits = (tc ?? []).map((c: any) => ({
        pub_track_id: tracks?.find((t: any) => t.id === c.track_id)?.pub_track_id,
        pub_creator_id: c.creators?.pub_creator_id,
        name: c.creators?.name,
        role: c.role,
        confidence: Number(c.confidence ?? 1),
      }));
    }
  }

  return ok({ pub_entity_id: parsed.pub_entity_id, entity_type: parsed.entity_type, credits });
});