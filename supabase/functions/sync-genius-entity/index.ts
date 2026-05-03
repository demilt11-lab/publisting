// Genius provider sync. Pulls song or artist data from the Genius API.
import { corsHeaders, ok } from "../_shared/pub.ts";
import { runProviderSync } from "../_shared/providerSync.ts";
import { callApi } from "../_shared/apiClient.ts";

async function gFetch(path: string): Promise<any | null> {
  const tok = Deno.env.get("GENIUS_TOKEN");
  if (!tok) throw new Error("GENIUS_TOKEN missing");
  const result = await callApi(
    {
      service: "genius",
      endpoint: path.split("?")[0],
      enqueueOnLimit: true,
      pendingEdgeFunction: "sync-genius-entity",
      pendingPayload: { path },
    },
    () =>
      fetch(`https://api.genius.com${path}`, {
        headers: { Authorization: `Bearer ${tok}` },
      }),
    (r) => r.json(),
  );
  return result.ok ? result.data : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const report = await runProviderSync("genius", req, async ({ entity, recordMatch }) => {
    const links: Array<{ platform: string; external_id: string; url?: string; confidence?: number }> = [];
    const fields: Array<{ field: string; value: string | null; confidence?: number }> = [];
    let metadata: Record<string, unknown> = {};
    const r = entity.raw as any;

    if (entity.entity_type === "track") {
      const q = `${r?.title ?? entity.display_name} ${r?.primary_artist_name ?? ""}`.trim();
      const s = await gFetch(`/search?q=${encodeURIComponent(q)}`);
      const hits = (s?.response?.hits ?? []).slice(0, 5).map((h: any) => h.result);
      const candidates = hits.map((h: any, i: number) => ({
        external_id: String(h.id), display_name: h.full_title, score: 1 - i * 0.1,
        reason: i === 0 ? "top_search" : "alt_search",
      }));
      const hit = hits[0];
      recordMatch({
        query_used: q, candidates, chosen: candidates[0] ?? null, rejected: candidates.slice(1),
        confidence_contribution: 0.9,
      });
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
      recordMatch({
        query_used: entity.display_name,
        candidates: hit ? [{ external_id: String(hit.id), display_name: hit.name, score: 0.85 }] : [],
        chosen: hit ? { external_id: String(hit.id), display_name: hit.name, score: 0.85 } : null,
        confidence_contribution: 0.85,
      });
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