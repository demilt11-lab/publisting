// Soundcharts provider sync for canonical entities.
import { corsHeaders, ok } from "../_shared/pub.ts";
import { runProviderSync } from "../_shared/providerSync.ts";

const BASE = "https://customer.api.soundcharts.com";

function creds() {
  const appId = Deno.env.get("SOUNDCHARTS_APP_ID");
  const raw = Deno.env.get("SOUNDCHARTS_API_KEY");
  if (!appId || !raw) return null;
  return { appId, apiKey: raw.includes(":") ? raw.split(":")[1] : raw };
}

async function sc(path: string, c: { appId: string; apiKey: string }) {
  const res = await fetch(`${BASE}${path}`, { headers: { "x-app-id": c.appId, "x-api-key": c.apiKey, Accept: "application/json" } });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const report = await runProviderSync("soundcharts", req, async ({ entity, recordMatch }) => {
    const c = creds();
    if (!c) throw new Error("Soundcharts credentials missing");
    if (entity.entity_type !== "artist") return { links: [], fields: [], metadata: { skipped: entity.entity_type } };

    let artistUuid: string | null = null;
    const raw = entity.raw as any;
    const spotifyId = raw?.spotify_id ?? raw?.metadata?.spotify?.id ?? null;
    if (spotifyId) {
      const bySpotify = await sc(`/api/v2.25/artist/by-platform/spotify/${encodeURIComponent(spotifyId)}`, c);
      artistUuid = bySpotify.json?.object?.uuid ?? null;
    }
    if (!artistUuid) {
      const searched = await sc(`/api/v2.9/artist/search/${encodeURIComponent(entity.display_name)}`, c);
      const items = searched.json?.items ?? searched.json?.data ?? [];
      artistUuid = items?.[0]?.uuid ?? items?.[0]?.id ?? null;
      recordMatch({ query_used: entity.display_name, candidates: items.slice(0, 5).map((x: any, i: number) => ({ external_id: x.uuid ?? x.id, display_name: x.name, score: 1 - i * 0.1 })), chosen: items[0] ? { external_id: items[0].uuid ?? items[0].id, display_name: items[0].name, score: 0.85 } : null });
    }
    if (!artistUuid) return { links: [], fields: [], metadata: { matched: false } };

    const [spotify, instagram] = await Promise.all([
      sc(`/api/v2.9/artist/${artistUuid}/streaming/spotify/listening?period=month`, c).catch(() => null),
      sc(`/api/v2.9/artist/${artistUuid}/social/instagram/audience`, c).catch(() => null),
    ]);
    const latest = spotify?.json?.items?.[0]?.value ?? null;
    const followers = instagram?.json?.items?.[0]?.value ?? null;
    return {
      links: [{ platform: "soundcharts", external_id: artistUuid, confidence: 0.82 }],
      fields: [
        { field: "soundcharts_artist_uuid", value: artistUuid, confidence: 0.9 },
        { field: "monthly_listeners_spotify", value: latest == null ? null : String(latest), confidence: 0.75 },
        { field: "followers_instagram", value: followers == null ? null : String(followers), confidence: 0.75 },
      ],
      metadata: { matched: true, artist_uuid: artistUuid },
    };
  });
  return ok(report);
});