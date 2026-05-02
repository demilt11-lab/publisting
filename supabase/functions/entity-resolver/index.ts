// Entity resolver: upserts canonical artists/tracks/albums + external_ids.
// Returns canonical pub_* IDs so the client can anchor watchlist / outreach.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EntityType = "artist" | "track" | "album" | "creator";

interface ExternalIdInput {
  platform: string;
  external_id: string;
  url?: string | null;
  confidence?: number;
  source?: string;
}

interface ResolveInput {
  entity_type: EntityType;
  name?: string;
  title?: string;
  primary_artist_name?: string;
  isrc?: string;
  upc?: string;
  release_date?: string;
  cover_url?: string;
  duration_ms?: number;
  language?: string;
  country?: string;
  primary_genre?: string;
  image_url?: string;
  label?: string;
  primary_role?: string;
  aliases?: string[];
  ipi?: string;
  pro?: string;
  metadata?: Record<string, unknown>;
  external_ids?: ExternalIdInput[];
  provenance?: Array<{ field_name: string; field_value?: string | null; source: string; confidence?: number }>;
}

function normalize(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json();
    const inputs: ResolveInput[] = Array.isArray(body?.entities) ? body.entities : body ? [body] : [];
    if (!inputs.length) {
      return new Response(JSON.stringify({ success: false, error: "no entities provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const results = [];
    for (const input of inputs) {
      try { results.push(await resolveOne(supabase, input)); }
      catch (e) {
        console.error("resolveOne failed", e);
        results.push({ entity_type: input.entity_type, pub_id: null, uuid: null, created: false,
          error: e instanceof Error ? e.message : (typeof e === "object" && e !== null ? JSON.stringify(e) : String(e)) });
      }
    }
    return new Response(JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function resolveOne(supabase: any, input: ResolveInput) {
  const { entity_type } = input;
  let entityUuid: string | null = null;
  let pubId: string | null = null;
  let created = false;

  // 1) Find via external_ids
  if (input.external_ids?.length) {
    for (const x of input.external_ids) {
      if (!x.platform || !x.external_id) continue;
      const { data } = await supabase.from("external_ids").select("entity_id")
        .eq("entity_type", entity_type).eq("platform", x.platform.toLowerCase())
        .eq("external_id", x.external_id).maybeSingle();
      if (data?.entity_id) { entityUuid = data.entity_id; break; }
    }
  }
  // 2) Identifier-based
  if (!entityUuid && entity_type === "track" && input.isrc) {
    const { data } = await supabase.from("tracks").select("id, pub_track_id").eq("isrc", input.isrc).maybeSingle();
    if (data) { entityUuid = data.id; pubId = data.pub_track_id; }
  }
  if (!entityUuid && entity_type === "album" && input.upc) {
    const { data } = await supabase.from("albums").select("id, pub_album_id").eq("upc", input.upc).maybeSingle();
    if (data) { entityUuid = data.id; pubId = data.pub_album_id; }
  }
  // 3) Normalized name match
  if (!entityUuid) {
    if (entity_type === "artist" && input.name) {
      const { data } = await supabase.from("artists").select("id, pub_artist_id")
        .eq("normalized_name", normalize(input.name)).maybeSingle();
      if (data) { entityUuid = data.id; pubId = data.pub_artist_id; }
    } else if (entity_type === "creator" && input.name) {
      const { data } = await supabase.from("creators").select("id, pub_creator_id")
        .eq("normalized_name", normalize(input.name)).maybeSingle();
      if (data) { entityUuid = data.id; pubId = data.pub_creator_id; }
    } else if (entity_type === "track" && input.title && input.primary_artist_name) {
      const { data } = await supabase.from("tracks").select("id, pub_track_id")
        .eq("normalized_title", normalize(input.title))
        .ilike("primary_artist_name", input.primary_artist_name).maybeSingle();
      if (data) { entityUuid = data.id; pubId = data.pub_track_id; }
    } else if (entity_type === "album" && input.title && input.primary_artist_name) {
      const { data } = await supabase.from("albums").select("id, pub_album_id")
        .eq("normalized_title", normalize(input.title))
        .ilike("primary_artist_name", input.primary_artist_name).maybeSingle();
      if (data) { entityUuid = data.id; pubId = data.pub_album_id; }
    }
  }
  // 4) Create
  if (!entityUuid) {
    if (entity_type === "artist") {
      if (!input.name) throw new Error("artist requires name");
      const { data, error } = await supabase.from("artists").insert({
        name: input.name, normalized_name: normalize(input.name),
        country: input.country ?? null, image_url: input.image_url ?? null,
        primary_genre: input.primary_genre ?? null, metadata: input.metadata ?? {},
      }).select("id, pub_artist_id").single();
      if (error) throw error;
      entityUuid = data.id; pubId = data.pub_artist_id; created = true;
    } else if (entity_type === "creator") {
      if (!input.name) throw new Error("creator requires name");
      const role = (input.primary_role ?? "mixed").toLowerCase();
      const safeRole = ["writer","producer","composer","mixed"].includes(role) ? role : "mixed";
      const { data, error } = await supabase.from("creators").insert({
        name: input.name, normalized_name: normalize(input.name),
        primary_role: safeRole, aliases: input.aliases ?? [],
        ipi: input.ipi ?? null, pro: input.pro ?? null,
        image_url: input.image_url ?? null, country: input.country ?? null,
        metadata: input.metadata ?? {},
      }).select("id, pub_creator_id").single();
      if (error) throw error;
      entityUuid = data.id; pubId = data.pub_creator_id; created = true;
    } else if (entity_type === "track") {
      if (!input.title) throw new Error("track requires title");
      let primaryArtistId: string | null = null;
      if (input.primary_artist_name) {
        const sub = await resolveOne(supabase, { entity_type: "artist", name: input.primary_artist_name });
        primaryArtistId = sub.uuid;
      }
      const { data, error } = await supabase.from("tracks").insert({
        title: input.title, normalized_title: normalize(input.title),
        primary_artist_id: primaryArtistId, primary_artist_name: input.primary_artist_name ?? null,
        isrc: input.isrc ?? null, duration_ms: input.duration_ms ?? null,
        release_date: input.release_date ?? null, cover_url: input.cover_url ?? null,
        language: input.language ?? null, metadata: input.metadata ?? {},
      }).select("id, pub_track_id").single();
      if (error) throw error;
      entityUuid = data.id; pubId = data.pub_track_id; created = true;
    } else {
      if (!input.title) throw new Error("album requires title");
      let primaryArtistId: string | null = null;
      if (input.primary_artist_name) {
        const sub = await resolveOne(supabase, { entity_type: "artist", name: input.primary_artist_name });
        primaryArtistId = sub.uuid;
      }
      const { data, error } = await supabase.from("albums").insert({
        title: input.title, normalized_title: normalize(input.title),
        primary_artist_id: primaryArtistId, primary_artist_name: input.primary_artist_name ?? null,
        upc: input.upc ?? null, release_date: input.release_date ?? null,
        cover_url: input.cover_url ?? null, label: input.label ?? null,
        metadata: input.metadata ?? {},
      }).select("id, pub_album_id").single();
      if (error) throw error;
      entityUuid = data.id; pubId = data.pub_album_id; created = true;
    }
  } else if (!pubId) {
    const tbl = entity_type === "artist" ? "artists"
      : entity_type === "track" ? "tracks"
      : entity_type === "album" ? "albums"
      : "creators";
    const col = entity_type === "artist" ? "pub_artist_id"
      : entity_type === "track" ? "pub_track_id"
      : entity_type === "album" ? "pub_album_id"
      : "pub_creator_id";
    const { data } = await supabase.from(tbl).select(col).eq("id", entityUuid).maybeSingle();
    pubId = data?.[col] ?? null;
  }
  // 5) Upsert external_ids
  if (entityUuid && input.external_ids?.length) {
    const rows = input.external_ids.filter((x) => x.platform && x.external_id).map((x) => ({
      entity_type, entity_id: entityUuid, platform: x.platform.toLowerCase(),
      external_id: x.external_id, url: x.url ?? null,
      confidence: x.confidence ?? 1.0, source: x.source ?? null,
    }));
    if (rows.length) {
      await supabase.from("external_ids").upsert(rows, { onConflict: "entity_type,platform,external_id" });
    }
  }
  // 6) Provenance
  if (entityUuid && input.provenance?.length) {
    const rows = input.provenance.map((p) => ({
      entity_type, entity_id: entityUuid, field_name: p.field_name,
      field_value: p.field_value ?? null, source: p.source, confidence: p.confidence ?? 1.0,
    }));
    await supabase.from("field_provenance").upsert(rows, { onConflict: "entity_type,entity_id,field_name,source" });
  }
  return { entity_type, pub_id: pubId, uuid: entityUuid, created };
}
