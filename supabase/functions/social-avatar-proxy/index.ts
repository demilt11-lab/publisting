// Streams Instagram/TikTok/YouTube/Spotify avatars through our origin so
// that the browser doesn't get blocked by upstream hotlink protection or
// regional CDN restrictions. Cached at the edge for 24h.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const ALLOWED_HOSTS = [
  "scontent.cdninstagram.com",
  "instagram.com",
  "cdninstagram.com",
  "fbcdn.net",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "ttwstatic.com",
  "ytimg.com",
  "googleusercontent.com",
  "scdn.co",
  "spotifycdn.com",
];

function isAllowed(u: URL): boolean {
  return ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const target = new URL(req.url).searchParams.get("url");
    if (!target) return new Response("missing url", { status: 400, headers: corsHeaders });
    let parsed: URL;
    try { parsed = new URL(target); } catch {
      return new Response("invalid url", { status: 400, headers: corsHeaders });
    }
    if (parsed.protocol !== "https:") {
      return new Response("https only", { status: 400, headers: corsHeaders });
    }
    if (!isAllowed(parsed)) {
      return new Response("host not allowed", { status: 400, headers: corsHeaders });
    }
    const upstream = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PublistingBot/1.0)" },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("upstream failed", { status: 502, headers: corsHeaders });
    }
    const ct = upstream.headers.get("content-type") || "image/jpeg";
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e) {
    return new Response(`error: ${e instanceof Error ? e.message : String(e)}`, {
      status: 500, headers: corsHeaders,
    });
  }
});