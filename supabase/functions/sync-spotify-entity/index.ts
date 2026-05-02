// Spotify provider sync. Resolves an entity, queries the Spotify catalog API,
// and writes external_ids + field_provenance through the shared helper.
import { corsHeaders, ok } from "../_shared/pub.ts";
import { runProviderSync } from "../_shared/providerSync.ts";

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
  const report = await runProviderSync("spotify", req, async ({ entity }) => {
    const token = await spotifyToken();
    if (!token) throw new Error("spotify credentials missing");

    const links: Array<{ platform: string; external_id: string; url?: string; confidence?: number }> = [];
    const fields: Array<{ field: string; value: string | null; confidence?: number }> = [];
    let metadata: Record<string, unknown> = {};

    if (entity.entity_type === "artist") {
      const r = (entity.raw as any);
      const existing = r?.spotify_id || r?.artist_pub_ids?.spotify;
      let id: string | null = existing ?? null;
      if (!id) {
        const search = await sFetch(token, `/search?type=artist&limit=1&q=${encodeURIComponent(entity.display_name)}`);
        id = search?.artists?.items?.[0]?.id ?? null;
      }
      if (!id) return { links, fields, metadata: { matched: false } };
      const a = await sFetch(token, `/artists/${id}`);
      if (a) {
        links.push({ platform: "spotify", external_id: id, url: a.external_urls?.spotify, confidence: 0.95 });
        fields.push({ field: "popularity", value: String(a.popularity ?? ""), confidence: 0.9 });
        if (Array.isArray(a.genres) && a.genres.length) fields.push({ field: "genres", value: a.genres.join(", "), confidence: 0.85 });
        if (a.followers?.total != null) fields.push({ field: "followers_spotify", value: String(a.followers.total), confidence: 0.95 });
        metadata = { popularity: a.popularity, followers: a.followers?.total };
      }
    } else if (entity.entity_type === "track") {
      const r = (entity.raw as any);
      let id: string | null = r?.spotify_id ?? null;
      if (!id && r?.isrc) {
        const s = await sFetch(token, `/search?type=track&limit=1&q=${encodeURIComponent("isrc:" + r.isrc)}`);
        id = s?.tracks?.items?.[0]?.id ?? null;
      }
      if (!id) {
        const q = encodeURIComponent(`${r?.title ?? entity.display_name} ${r?.primary_artist_name ?? ""}`.trim());
        const s = await sFetch(token, `/search?type=track&limit=1&q=${q}`);
        id = s?.tracks?.items?.[0]?.id ?? null;
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
    return { links, fields, metadata };
  });

  return ok(report);
});