// Spotify provider sync. Resolves an entity, queries the Spotify catalog API,
// and writes external_ids + field_provenance through the shared helper.
import { corsHeaders, ok } from "../_shared/pub.ts";
import { runProviderSync } from "../_shared/providerSync.ts";
import { readSpotifyArtistCache, writeSpotifyArtistCache } from "../_shared/spotifyArtistCache.ts";

let _token: { value: string; exp: number } | null = null;
async function spotifyToken(): Promise<string | null> {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) return null;
  if (_token && _token.exp > Date.now() + 30_000) return _token.value;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) return null;
  const j = await r.json();
  _token = { value: j.access_token, exp: Date.now() + (j.expires_in * 1000) };
  return _token.value;
}

async function sFetch(token: string, path: string): Promise<any | null> {
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const report = await runProviderSync("spotify", req, async ({ client, entity, recordMatch }) => {
    const token = await spotifyToken();
    if (!token) throw new Error("spotify credentials missing");

    const links: Array<{ platform: string; external_id: string; url?: string; confidence?: number }> = [];
    const fields: Array<{ field: string; value: string | null; confidence?: number }> = [];
    let metadata: Record<string, unknown> = {};

    if (entity.entity_type === "artist") {
      const r = (entity.raw as any);
      const existing = r?.spotify_id || r?.artist_pub_ids?.spotify;
      let id: string | null = existing ?? null;
      const query_used = `artist:${entity.display_name}`;
      if (!id) {
        const search = await sFetch(token, `/search?type=artist&limit=5&q=${encodeURIComponent(entity.display_name)}`);
        const items = (search?.artists?.items ?? []) as any[];
        const candidates = items.map((it, i) => ({
          external_id: it.id,
          display_name: it.name,
          score: 1 - (i * 0.1),
          reason: i === 0 ? "top_result" : "alt_result",
          raw: { popularity: it.popularity, followers: it.followers?.total },
        }));
        id = items[0]?.id ?? null;
        recordMatch({
          query_used,
          candidates,
          chosen: candidates[0] ?? null,
          rejected: candidates.slice(1),
          score_breakdown: { name_match: 0.85, popularity: (items[0]?.popularity ?? 0) / 100 },
          confidence_contribution: 0.95,
        });
      } else {
        recordMatch({
          query_used: `pre-known:${id}`,
          candidates: [{ external_id: id, display_name: entity.display_name, score: 1, reason: "cached_id" }],
          chosen: { external_id: id, display_name: entity.display_name, score: 1, reason: "cached_id" },
          confidence_contribution: 0.99,
        });
      }
      if (!id) return { links, fields, metadata: { matched: false } };
      // Use cache to avoid hammering Spotify on repeat syncs.
      const cached = await readSpotifyArtistCache(id);
      const a = cached?.raw ?? await sFetch(token, `/artists/${id}`);
      if (a) {
        links.push({ platform: "spotify", external_id: id, url: a.external_urls?.spotify, confidence: 0.95 });
        if (a.images?.[0]?.url) fields.push({ field: "image_url", value: a.images[0].url, confidence: 0.9 });
        fields.push({ field: "popularity", value: String(a.popularity ?? ""), confidence: 0.9 });
        if (Array.isArray(a.genres) && a.genres.length) fields.push({ field: "genres", value: a.genres.join(", "), confidence: 0.85 });
        if (a.followers?.total != null) fields.push({ field: "followers_spotify", value: String(a.followers.total), confidence: 0.95 });
        metadata = {
          popularity: a.popularity,
          followers: a.followers?.total,
          image_url: a.images?.[0]?.url ?? null,
          cache: cached ? "hit" : "miss",
        };
        if (!cached) {
          await writeSpotifyArtistCache(id, {
            followers: a.followers?.total ?? null,
            popularity: a.popularity ?? null,
            display_name: a.name ?? null,
            image_url: a.images?.[0]?.url ?? null,
            genres: Array.isArray(a.genres) ? a.genres : null,
            external_url: a.external_urls?.spotify ?? null,
            raw: a,
          });
        }
      }
    } else if (entity.entity_type === "track") {
      const r = (entity.raw as any);
      let id: string | null = r?.spotify_id ?? null;
      const query_used = r?.isrc ? `isrc:${r.isrc}` : `${r?.title ?? entity.display_name} ${r?.primary_artist_name ?? ""}`.trim();
      if (!id && r?.isrc) {
        const s = await sFetch(token, `/search?type=track&limit=3&q=${encodeURIComponent("isrc:" + r.isrc)}`);
        const items = (s?.tracks?.items ?? []) as any[];
        const candidates = items.map((it, i) => ({
          external_id: it.id,
          display_name: `${it.name} — ${it.artists?.[0]?.name ?? ""}`,
          score: 1 - (i * 0.05),
          reason: i === 0 ? "isrc_top" : "isrc_alt",
          raw: { isrc: it.external_ids?.isrc, popularity: it.popularity },
        }));
        id = items[0]?.id ?? null;
        recordMatch({ query_used, candidates, chosen: candidates[0] ?? null, rejected: candidates.slice(1), confidence_contribution: 0.99 });
      }
      if (!id) {
        const q = encodeURIComponent(`${r?.title ?? entity.display_name} ${r?.primary_artist_name ?? ""}`.trim());
        const s = await sFetch(token, `/search?type=track&limit=5&q=${q}`);
        const items = (s?.tracks?.items ?? []) as any[];
        const candidates = items.map((it, i) => ({
          external_id: it.id,
          display_name: `${it.name} — ${it.artists?.[0]?.name ?? ""}`,
          score: 1 - (i * 0.1),
          reason: i === 0 ? "title_artist_top" : "title_artist_alt",
          raw: { isrc: it.external_ids?.isrc, popularity: it.popularity },
        }));
        const conflicts: string[] = [];
        if (items[0] && items[0].artists?.[0]?.name && r?.primary_artist_name &&
          items[0].artists[0].name.toLowerCase() !== String(r.primary_artist_name).toLowerCase()) {
          conflicts.push(`artist mismatch: ${items[0].artists[0].name} vs ${r.primary_artist_name}`);
        }
        id = items[0]?.id ?? null;
        recordMatch({
          query_used, candidates,
          chosen: candidates[0] ?? null,
          rejected: candidates.slice(1),
          conflict_reasons: conflicts,
          confidence_contribution: conflicts.length ? 0.7 : 0.9,
        });
      }
      if (!id) return { links, fields, metadata: { matched: false } };
      const t = await sFetch(token, `/tracks/${id}`);
      if (t) {
        links.push({ platform: "spotify", external_id: id, url: t.external_urls?.spotify, confidence: 0.95 });
        if (t.external_ids?.isrc) fields.push({ field: "isrc", value: t.external_ids.isrc, confidence: 0.99 });
        fields.push({ field: "popularity", value: String(t.popularity ?? ""), confidence: 0.9 });
        if (t.duration_ms) fields.push({ field: "duration_ms", value: String(t.duration_ms), confidence: 0.99 });
        if (t.album?.release_date) fields.push({ field: "release_date", value: t.album.release_date, confidence: 0.95 });
        metadata = { popularity: t.popularity, isrc: t.external_ids?.isrc };
      }
    } else if (entity.entity_type === "album") {
      const r = (entity.raw as any);
      let id: string | null = r?.spotify_id ?? null;
      if (!id && r?.upc) {
        const s = await sFetch(token, `/search?type=album&limit=1&q=${encodeURIComponent("upc:" + r.upc)}`);
        id = s?.albums?.items?.[0]?.id ?? null;
      }
      if (!id) {
        const q = encodeURIComponent(`${r?.title ?? entity.display_name} ${r?.primary_artist_name ?? ""}`.trim());
        const s = await sFetch(token, `/search?type=album&limit=1&q=${q}`);
        id = s?.albums?.items?.[0]?.id ?? null;
      }
      if (!id) return { links, fields, metadata: { matched: false } };
      const al = await sFetch(token, `/albums/${id}`);
      if (al) {
        links.push({ platform: "spotify", external_id: id, url: al.external_urls?.spotify, confidence: 0.95 });
        if (al.external_ids?.upc) fields.push({ field: "upc", value: al.external_ids.upc, confidence: 0.99 });
        if (al.release_date) fields.push({ field: "release_date", value: al.release_date, confidence: 0.95 });
        if (al.label) fields.push({ field: "label", value: al.label, confidence: 0.9 });
        metadata = { upc: al.external_ids?.upc };
      }
    } else {
      return { links, fields, metadata: { skipped: "creator entities not synced via spotify" } };
    }
    if (entity.entity_type === "artist" && (metadata.popularity || metadata.followers || metadata.image_url)) {
      const raw = entity.raw as any;
      const imageUrl = typeof metadata.image_url === "string" ? metadata.image_url : null;
      const genres = fields.find((f) => f.field === "genres")?.value ?? null;
      await client.from("artists").update({
        image_url: raw.image_url ?? imageUrl,
        primary_genre: raw.primary_genre ?? (genres?.split(",")[0]?.trim() || null),
        metadata: { ...(raw.metadata ?? {}), spotify: metadata },
      }).eq("id", entity.uuid);
    }
    return { links, fields, metadata };
  });

  return ok(report);
});