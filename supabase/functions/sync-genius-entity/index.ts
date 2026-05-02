// Genius provider sync. Pulls song or artist data from the Genius API.
import { corsHeaders, ok } from "../_shared/pub.ts";
import { runProviderSync } from "../_shared/providerSync.ts";

async function gFetch(path: string): Promise<any | null> {
  const tok = Deno.env.get("GENIUS_TOKEN");
  if (!tok) throw new Error("GENIUS_TOKEN missing");
  const r = await fetch(`https://api.genius.com${path}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  if (!r.ok) return null;
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const report = await runProviderSync("genius", req, async ({ entity }) => {
    const links: Array<{ platform: string; external_id: string; url?: string; confidence?: number }> = [];
    const fields: Array<{ field: string; value: string | null; confidence?: number }> = [];
    let metadata: Record<string, unknown> = {};
    const r = entity.raw as any;

    if (entity.entity_type === "track") {
      const q = `${r?.title ?? entity.display_name} ${r?.primary_artist_name ?? ""}`.trim();
      const s = await gFetch(`/search?q=${encodeURIComponent(q)}`);
      const hit = s?.response?.hits?.[0]?.result;
      if (!hit) return { links, fields, metadata: { matched: false } };
      const song = await gFetch(`/songs/${hit.id}`);
      const data = song?.response?.song ?? hit;
      links.push({ platform: "genius", external_id: String(data.id), url: data.url, confidence: 0.9 });
      if (data.release_date) fields.push({ field: "release_date", value: data.release_date, confidence: 0.85 });
      if (data.album?.name) fields.push({ field: "album", value: data.album.name, confidence: 0.85 });
      const writers = (song?.response?.song?.writer_artists ?? []).map((w: any) => w.name).filter(Boolean);
      if (writers.length) fields.push({ field: "writers", value: writers.join(", "), confidence: 0.8 });
      const producers = (song?.response?.song?.producer_artists ?? []).map((w: any) => w.name).filter(Boolean);
      if (producers.length) fields.push({ field: "producers", value: producers.join(", "), confidence: 0.8 });
      metadata = { writers: writers.length, producers: producers.length };
    } else if (entity.entity_type === "artist" || entity.entity_type === "creator") {
      const s = await gFetch(`/search?q=${encodeURIComponent(entity.display_name)}`);
      const hit = s?.response?.hits?.[0]?.result?.primary_artist;
      if (!hit) return { links, fields, metadata: { matched: false } };
      links.push({ platform: "genius", external_id: String(hit.id), url: hit.url, confidence: 0.85 });
      if (hit.image_url) fields.push({ field: "image_url", value: hit.image_url, confidence: 0.85 });
      metadata = { genius_id: hit.id };
    } else {
      return { links, fields, metadata: { skipped: entity.entity_type } };
    }
    return { links, fields, metadata };
  });

  return ok(report);
});