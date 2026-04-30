// Deezer public search adapter (no API key required).
// Returns canonical track + ISRC + cover + preview when match found.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function sim(a: string, b: string): number {
  const an = norm(a), bn = norm(b);
  if (!an || !bn) return 0;
  if (an === bn) return 1;
  const tg = (s: string) => { const t = ` ${s} `; const o = new Set<string>(); for (let i = 0; i < t.length - 2; i++) o.add(t.slice(i, i + 3)); return o; };
  const A = tg(an), B = tg(bn); let inter = 0; for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size || 1);
}

async function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await p; } finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const title: string = String(body.title || "").trim();
    const artist: string = String(body.artist || "").trim();
    if (!title) return json({ success: false, error: "title required" }, 400);

    const q = encodeURIComponent(`track:"${title}" artist:"${artist}"`);
    const url = `https://api.deezer.com/search?q=${q}&limit=10`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal, headers: { "Accept": "application/json" } });
    clearTimeout(t);
    if (!res.ok) return json({ success: false, error: `deezer ${res.status}` }, 502);
    const data = await res.json();
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    if (!list.length) return json({ success: true, data: null });

    let best: any = null; let bestScore = 0;
    for (const t of list) {
      const s = 0.6 * sim(t?.title || "", title) + 0.4 * sim(t?.artist?.name || "", artist);
      if (s > bestScore) { bestScore = s; best = t; }
    }
    if (!best || bestScore < 0.5) return json({ success: true, data: null });

    // Optional ISRC enrichment via /track/{id}
    let isrc: string | null = null;
    try {
      const tr = await withTimeout(fetch(`https://api.deezer.com/track/${best.id}`).then((r) => r.json()), 6000);
      isrc = tr?.isrc || null;
    } catch {}

    return json({
      success: true,
      data: {
        platform: "deezer",
        url: best.link || null,
        trackId: String(best.id),
        title: best.title,
        artist: best.artist?.name,
        album: best.album?.title || null,
        coverUrl: best.album?.cover_xl || best.album?.cover_big || null,
        previewUrl: best.preview || null,
        isrc,
        rank: best.rank ?? null,
        matchScore: bestScore,
      },
    });
  } catch (e) {
    return json({ success: false, error: String((e as Error).message) }, 500);
  }
});