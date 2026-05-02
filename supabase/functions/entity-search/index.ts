// Entity search: Postgres FTS over artists/tracks/albums + URL/ISRC/UPC parsing.
// Returns best match + alternates + confidence + source coverage.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EntityType = "artist" | "track" | "album";

interface SearchInput {
  query: string;
  types?: EntityType[];
  platforms?: string[];
  limit?: number;
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim();
}

// Parse an incoming query. Could be a URL, an ISRC, a UPC, or free text.
function parseQuery(q: string): {
  kind: "url" | "isrc" | "upc" | "text";
  platform?: string;
  externalId?: string;
  text?: string;
} {
  const trimmed = q.trim();
  // ISRC: 2 letters + 3 alnum + 7 digits
  if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(trimmed.replace(/-/g, ""))) {
    return { kind: "isrc", externalId: trimmed.replace(/-/g, "").toUpperCase() };
  }
  // UPC: 12 or 13 digits
  if (/^\d{12,13}$/.test(trimmed)) {
    return { kind: "upc", externalId: trimmed };
  }
  // URL parsing (Spotify / Apple / Deezer / YouTube)
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (host.includes("spotify.com")) {
      const m = u.pathname.match(/\/(track|album|artist)\/([A-Za-z0-9]+)/);
      if (m) return { kind: "url", platform: "spotify", externalId: m[2] };
    }
    if (host.includes("music.apple.com")) {
      const m = u.pathname.match(/\/(album|artist)\/[^/]+\/(\d+)/);
      if (m) return { kind: "url", platform: "apple", externalId: m[2] };
    }
    if (host.includes("deezer.com")) {
      const m = u.pathname.match(/\/(track|album|artist)\/(\d+)/);
      if (m) return { kind: "url", platform: "deezer", externalId: m[2] };
    }
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      const v = u.searchParams.get("v") ?? u.pathname.replace("/", "");
      if (v) return { kind: "url", platform: "youtube", externalId: v };
    }
  } catch { /* not a URL */ }
  return { kind: "text", text: trimmed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body: SearchInput = await req.json();
    const query = (body?.query ?? "").trim();
    if (!query) {
      return new Response(JSON.stringify({ success: false, error: "missing query" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const types = body.types?.length ? body.types : ["artist", "track", "album"];
    const limit = Math.min(body.limit ?? 10, 25);
    const parsed = parseQuery(query);

    let matches: any[] = [];

    // --- URL / ISRC / UPC: direct lookup ---
    if (parsed.kind === "url" && parsed.platform && parsed.externalId) {
      const { data: ext } = await supabase.from("external_ids")
        .select("entity_type, entity_id, platform, external_id, url, confidence")
        .eq("platform", parsed.platform).eq("external_id", parsed.externalId);
      if (ext?.length) {
        const m = await hydrate(supabase, ext);
        matches.push(...m.map((x) => ({ ...x, score: 1.0, reason: "exact platform id" })));
      }
    }
    if (parsed.kind === "isrc") {
      const { data } = await supabase.from("tracks")
        .select("id, pub_track_id, title, primary_artist_name, isrc, cover_url, release_date")
        .eq("isrc", parsed.externalId).limit(5);
      if (data?.length) {
        for (const r of data) {
          matches.push({
            entity_type: "track", id: r.id, pub_id: r.pub_track_id,
            title: r.title, name: r.title, primary_artist_name: r.primary_artist_name,
            isrc: r.isrc, cover_url: r.cover_url, release_date: r.release_date,
            score: 1.0, reason: "exact ISRC",
          });
        }
      }
    }
    if (parsed.kind === "upc") {
      const { data } = await supabase.from("albums")
        .select("id, pub_album_id, title, primary_artist_name, upc, cover_url, release_date")
        .eq("upc", parsed.externalId).limit(5);
      if (data?.length) {
        for (const r of data) {
          matches.push({
            entity_type: "album", id: r.id, pub_id: r.pub_album_id,
            title: r.title, name: r.title, primary_artist_name: r.primary_artist_name,
            upc: r.upc, cover_url: r.cover_url, release_date: r.release_date,
            score: 1.0, reason: "exact UPC",
          });
        }
      }
    }

    // --- Free text: FTS across types ---
    if (parsed.kind === "text" || matches.length < limit) {
      const text = parsed.text ?? query;
      const tsq = text.split(/\s+/).filter(Boolean).map((t) => t.replace(/[^a-z0-9]/gi, "")).filter((t) => t.length).map((t) => `${t}:*`).join(" & ");
      const norm = normalize(text);

      if (types.includes("artist")) {
        const { data } = await supabase.from("artists")
          .select("id, pub_artist_id, name, country, image_url, primary_genre, normalized_name")
          .or(`normalized_name.eq.${norm},search_doc.fts.${tsq || norm}`).limit(limit);
        for (const r of (data ?? [])) {
          const exact = r.normalized_name === norm;
          matches.push({
            entity_type: "artist", id: r.id, pub_id: r.pub_artist_id,
            name: r.name, primary_artist_name: r.name, image_url: r.image_url,
            country: r.country, primary_genre: r.primary_genre,
            score: exact ? 0.98 : 0.7, reason: exact ? "exact name" : "name match",
          });
        }
      }
      if (types.includes("track")) {
        const { data } = await supabase.from("tracks")
          .select("id, pub_track_id, title, primary_artist_name, isrc, cover_url, release_date, normalized_title")
          .or(`normalized_title.eq.${norm},search_doc.fts.${tsq || norm}`).limit(limit);
        for (const r of (data ?? [])) {
          const exact = r.normalized_title === norm;
          matches.push({
            entity_type: "track", id: r.id, pub_id: r.pub_track_id,
            title: r.title, name: r.title, primary_artist_name: r.primary_artist_name,
            isrc: r.isrc, cover_url: r.cover_url, release_date: r.release_date,
            score: exact ? 0.95 : 0.65, reason: exact ? "exact title" : "title match",
          });
        }
      }
      if (types.includes("album")) {
        const { data } = await supabase.from("albums")
          .select("id, pub_album_id, title, primary_artist_name, upc, cover_url, release_date, normalized_title")
          .or(`normalized_title.eq.${norm},search_doc.fts.${tsq || norm}`).limit(limit);
        for (const r of (data ?? [])) {
          const exact = r.normalized_title === norm;
          matches.push({
            entity_type: "album", id: r.id, pub_id: r.pub_album_id,
            title: r.title, name: r.title, primary_artist_name: r.primary_artist_name,
            upc: r.upc, cover_url: r.cover_url, release_date: r.release_date,
            score: exact ? 0.94 : 0.6, reason: exact ? "exact title" : "title match",
          });
        }
      }
    }

    // De-duplicate by (entity_type, id)
    const seen = new Set<string>();
    const unique = [];
    for (const m of matches.sort((a, b) => b.score - a.score)) {
      const key = `${m.entity_type}:${m.id}`;
      if (seen.has(key)) continue;
      seen.add(key); unique.push(m);
    }

    // Attach external IDs and source coverage to top results
    const top = unique.slice(0, limit);
    for (const m of top) {
      const { data } = await supabase.from("external_ids")
        .select("platform, external_id, url, source")
        .eq("entity_type", m.entity_type).eq("entity_id", m.id);
      m.external_ids = data ?? [];
      m.source_coverage = new Set((data ?? []).map((x: any) => x.platform)).size;
    }

    const best = top[0] ?? null;
    const alternates = top.slice(1);
    const confidence = best?.score ?? 0;

    return new Response(JSON.stringify({
      success: true,
      query, parsed_kind: parsed.kind,
      best_match: best, alternates, confidence,
      types_searched: types,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function hydrate(supabase: any, ext: any[]) {
  const out: any[] = [];
  for (const x of ext) {
    if (x.entity_type === "artist") {
      const { data } = await supabase.from("artists")
        .select("id, pub_artist_id, name, country, image_url").eq("id", x.entity_id).maybeSingle();
      if (data) out.push({ entity_type: "artist", id: data.id, pub_id: data.pub_artist_id,
        name: data.name, primary_artist_name: data.name, image_url: data.image_url, country: data.country });
    } else if (x.entity_type === "track") {
      const { data } = await supabase.from("tracks")
        .select("id, pub_track_id, title, primary_artist_name, isrc, cover_url, release_date").eq("id", x.entity_id).maybeSingle();
      if (data) out.push({ entity_type: "track", id: data.id, pub_id: data.pub_track_id,
        title: data.title, name: data.title, primary_artist_name: data.primary_artist_name,
        isrc: data.isrc, cover_url: data.cover_url, release_date: data.release_date });
    } else {
      const { data } = await supabase.from("albums")
        .select("id, pub_album_id, title, primary_artist_name, upc, cover_url, release_date").eq("id", x.entity_id).maybeSingle();
      if (data) out.push({ entity_type: "album", id: data.id, pub_id: data.pub_album_id,
        title: data.title, name: data.title, primary_artist_name: data.primary_artist_name,
        upc: data.upc, cover_url: data.cover_url, release_date: data.release_date });
    }
  }
  return out;
}
