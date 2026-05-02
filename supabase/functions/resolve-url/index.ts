import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, ok, err, detailPathFor, parsePlatformUrl } from "../_shared/pub.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let url = "";
  try {
    if (req.method === "POST") url = (await req.json()).url || "";
    else url = new URL(req.url).searchParams.get("url") || "";
  } catch { return err("Invalid body", 400); }

  if (!url) return err("Missing 'url'", 400);

  const parsed = parsePlatformUrl(url);
  if (!parsed) return ok({ resolved: false, reason: "unsupported_platform", url });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  // Try direct match in external_ids
  const { data: ext } = await sb.from("external_ids")
    .select("entity_type, entity_id")
    .eq("platform", parsed.platform).eq("external_id", parsed.external_id).maybeSingle();

  let pub_entity_id: string | null = null;
  let entity_type: string | null = null;
  let display_name: string | null = null;

  if (ext) {
    entity_type = String(ext.entity_type);
    if (entity_type === "artist") {
      const { data } = await sb.from("artists").select("pub_artist_id, name").eq("id", ext.entity_id).maybeSingle();
      if (data) { pub_entity_id = (data as any).pub_artist_id; display_name = (data as any).name; }
    } else if (entity_type === "track") {
      const { data } = await sb.from("tracks").select("pub_track_id, title").eq("id", ext.entity_id).maybeSingle();
      if (data) { pub_entity_id = (data as any).pub_track_id; display_name = (data as any).title; }
    } else if (entity_type === "album") {
      const { data } = await sb.from("albums").select("pub_album_id, title").eq("id", ext.entity_id).maybeSingle();
      if (data) { pub_entity_id = (data as any).pub_album_id; display_name = (data as any).title; }
    } else if (entity_type === "creator") {
      const { data } = await sb.from("creators").select("pub_creator_id, name").eq("id", ext.entity_id).maybeSingle();
      if (data) { pub_entity_id = (data as any).pub_creator_id; display_name = (data as any).name; }
    }
  }

  // Fallback: platform_urls table
  if (!pub_entity_id) {
    const { data: pu } = await sb.from("platform_urls")
      .select("entity_type, pub_entity_id").eq("normalized_url", parsed.canonical_url).maybeSingle();
    if (pu) { entity_type = (pu as any).entity_type; pub_entity_id = (pu as any).pub_entity_id; }
  }

  return ok({
    resolved: Boolean(pub_entity_id),
    parsed,
    entity_type,
    pub_entity_id,
    display_name,
    detail_path: pub_entity_id && entity_type ? detailPathFor(entity_type, pub_entity_id) : null,
  });
});