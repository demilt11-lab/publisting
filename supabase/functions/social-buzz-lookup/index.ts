// Social Buzz lookup edge function.
//
// Searches TikTok and Instagram for creator usage of a track via SearchApi.
// Returns approximate counts of posts/videos found for the query, used by
// the Exposure tab "Social Buzz" section. Fail-closed: returns zeros / nulls
// when upstream data is unavailable; never invents numbers.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SEARCHAPI_BASE = "https://www.searchapi.io/api/v1/search";

interface BuzzResult {
  platform: "tiktok" | "instagram";
  total_results: number | null;
  top_creators: Array<{
    username: string;
    display_name?: string | null;
    url?: string | null;
    views?: number | null;
    likes?: number | null;
  }>;
  status: "ok" | "no_data" | "error";
  error?: string;
}

async function searchTikTok(apiKey: string, query: string): Promise<BuzzResult> {
  const url = `${SEARCHAPI_BASE}?engine=tiktok_search&q=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) return { platform: "tiktok", total_results: null, top_creators: [], status: "error", error: `HTTP ${r.status}` };
    const data = await r.json();
    const items: any[] = data?.videos || data?.results || [];
    const top = items.slice(0, 6).map((v: any) => ({
      username: v?.author?.unique_id || v?.author?.username || "",
      display_name: v?.author?.nickname || v?.author?.display_name || null,
      url: v?.url || v?.video_url || null,
      views: typeof v?.play_count === "number" ? v.play_count : (typeof v?.statistics?.play_count === "number" ? v.statistics.play_count : null),
      likes: typeof v?.digg_count === "number" ? v.digg_count : (typeof v?.statistics?.digg_count === "number" ? v.statistics.digg_count : null),
    })).filter((c) => c.username);
    return {
      platform: "tiktok",
      total_results: items.length || null,
      top_creators: top,
      status: items.length > 0 ? "ok" : "no_data",
    };
  } catch (err) {
    return { platform: "tiktok", total_results: null, top_creators: [], status: "error", error: err instanceof Error ? err.message : "unknown" };
  }
}

async function searchInstagram(apiKey: string, query: string): Promise<BuzzResult> {
  const url = `${SEARCHAPI_BASE}?engine=instagram_hashtag&hashtag=${encodeURIComponent(query.replace(/\s+/g, ""))}`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) return { platform: "instagram", total_results: null, top_creators: [], status: "error", error: `HTTP ${r.status}` };
    const data = await r.json();
    const items: any[] = data?.posts || data?.results || data?.media || [];
    const top = items.slice(0, 6).map((p: any) => ({
      username: p?.user?.username || p?.owner?.username || p?.username || "",
      display_name: p?.user?.full_name || p?.owner?.full_name || null,
      url: p?.permalink || p?.url || null,
      views: typeof p?.video_view_count === "number" ? p.video_view_count : null,
      likes: typeof p?.like_count === "number" ? p.like_count : null,
    })).filter((c) => c.username);
    return {
      platform: "instagram",
      total_results: items.length || null,
      top_creators: top,
      status: items.length > 0 ? "ok" : "no_data",
    };
  } catch (err) {
    return { platform: "instagram", total_results: null, top_creators: [], status: "error", error: err instanceof Error ? err.message : "unknown" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    if (!title || title.length > 300 || artist.length > 300) {
      return new Response(JSON.stringify({ error: "title (and optional artist) required, <=300 chars" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("SEARCHAPI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "SEARCHAPI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const query = artist ? `${title} ${artist}` : title;
    const [tiktok, instagram] = await Promise.all([
      searchTikTok(apiKey, query),
      searchInstagram(apiKey, query),
    ]);

    return new Response(JSON.stringify({ query, tiktok, instagram }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
