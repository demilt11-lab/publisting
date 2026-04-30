// Tidal coverage via Odesli (song.link) which already aggregates Tidal IDs
// without requiring Tidal's OAuth credentials. Returns Tidal URL + ID.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const isrc: string | null = body.isrc ? String(body.isrc).replace(/[-\s]/g, "").toUpperCase() : null;
    const spotifyUrl: string | null = body.spotifyUrl || null;
    const seed = isrc
      ? `https://api.song.link/v1-alpha.1/links?type=song&platform=spotify&id=${isrc}`
      : spotifyUrl
        ? `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`
        : null;
    if (!seed) return json({ success: false, error: "isrc or spotifyUrl required" }, 400);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(seed, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return json({ success: false, error: `odesli ${res.status}` }, 502);
    const data = await res.json();
    const tidal = data?.linksByPlatform?.tidal;
    const amazon = data?.linksByPlatform?.amazonMusic;
    const deezer = data?.linksByPlatform?.deezer;
    if (!tidal?.url && !amazon?.url && !deezer?.url) return json({ success: true, data: null });

    const entityId = tidal?.entityUniqueId || amazon?.entityUniqueId;
    const entity = entityId ? data?.entitiesByUniqueId?.[entityId] : null;

    return json({
      success: true,
      data: {
        platform: "tidal",
        url: tidal?.url || null,
        trackId: tidal?.entityUniqueId?.split("::")?.[1] || null,
        amazonUrl: amazon?.url || null,
        deezerUrl: deezer?.url || null,
        title: entity?.title || null,
        artist: entity?.artistName || null,
        coverUrl: entity?.thumbnailUrl || null,
      },
    });
  } catch (e) {
    return json({ success: false, error: String((e as Error).message) }, 500);
  }
});