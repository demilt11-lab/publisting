// Phase 3: Chart & playlist history poller.
// Snapshots top-100 / top-200 chart positions into chart_placements_history.
// Sources (no Chartmetric):
//   - Apple Music RSS (Top Songs, country=US/GB/etc) — official, JSON.
//   - Kworb Spotify Daily Top 200 (global) — HTML, scraped via Firecrawl.
//   - Shazam Top 200 (global) — HTML, scraped via Firecrawl.
//   - Billboard Hot 100 — HTML, scraped via Firecrawl.
// Each source is graceful-degrading: one failure does not abort the others.
// Also seeds Spotify editorial playlist appearances if a Spotify playlist id
// is referenced in playload.

import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
const trackKey = (title: string, artist: string) => `${norm(title)}::${norm(artist)}`;

async function withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await p; } finally { clearTimeout(t); }
}

type Row = {
  chart_name: string;
  region: string;
  position: number;
  title: string;
  primary_artist: string;
  isrc?: string | null;
  source_url?: string | null;
  raw?: any;
};

// ---------- Apple Music RSS ----------
async function pullAppleMusic(country = "us", limit = 100): Promise<Row[]> {
  try {
    const url = `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/${limit}/songs.json`;
    const r = await withTimeout(fetch(url).then((r) => r.json()), 9000);
    const items: any[] = r?.feed?.results || [];
    return items.map((it, i) => ({
      chart_name: "Apple Music Top Songs",
      region: country.toUpperCase(),
      position: i + 1,
      title: it.name,
      primary_artist: it.artistName,
      source_url: it.url || null,
      raw: { artworkUrl: it.artworkUrl100, releaseDate: it.releaseDate },
    }));
  } catch (e) { console.warn("apple rss failed", e); return []; }
}

// ---------- Firecrawl helper ----------
async function firecrawlMd(url: string): Promise<string | null> {
  if (!FIRECRAWL_KEY) return null;
  try {
    const r = await withTimeout(fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Authorization": `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    }).then((r) => r.json()), 25000);
    return (r?.data?.markdown || r?.markdown || null) as string | null;
  } catch (e) { console.warn("firecrawl failed", url, e); return null; }
}

// Generic markdown table parser: looks for "1." / "1)" or "| 1 |" prefixed lines
function parseRankedList(md: string, max = 100): Array<{ position: number; title: string; artist: string }> {
  if (!md) return [];
  const out: Array<{ position: number; title: string; artist: string }> = [];
  const lines = md.split("\n");
  for (const ln of lines) {
    // markdown table row: | 1 | Title | Artist | ...
    const tbl = ln.match(/^\s*\|\s*(\d{1,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*[|$]/);
    if (tbl) {
      const pos = Number(tbl[1]); if (pos > 0 && pos <= max)
        out.push({ position: pos, title: tbl[2].trim(), artist: tbl[3].trim() });
      continue;
    }
    // ordered list: "1. Title - Artist" or "1) Title - Artist"
    const ol = ln.match(/^\s*(\d{1,3})[.)]\s+(.+?)\s*[-–—]\s*(.+)$/);
    if (ol) {
      const pos = Number(ol[1]); if (pos > 0 && pos <= max)
        out.push({ position: pos, title: ol[2].trim(), artist: ol[3].trim() });
    }
  }
  // Dedupe by position
  const seen = new Set<number>(); return out.filter((r) => {
    if (seen.has(r.position)) return false; seen.add(r.position); return true;
  });
}

async function pullKworbSpotify(): Promise<Row[]> {
  const md = await firecrawlMd("https://kworb.net/spotify/country/global_daily.html");
  if (!md) return [];
  return parseRankedList(md, 200).map((r) => ({
    chart_name: "Spotify Daily Top 200",
    region: "global",
    position: r.position,
    title: r.title, primary_artist: r.artist,
    source_url: "https://kworb.net/spotify/country/global_daily.html",
  }));
}

async function pullShazam(): Promise<Row[]> {
  const md = await firecrawlMd("https://www.shazam.com/charts/top-200/world");
  if (!md) return [];
  return parseRankedList(md, 200).map((r) => ({
    chart_name: "Shazam Top 200",
    region: "global",
    position: r.position,
    title: r.title, primary_artist: r.artist,
    source_url: "https://www.shazam.com/charts/top-200/world",
  }));
}

async function pullBillboardHot100(): Promise<Row[]> {
  const md = await firecrawlMd("https://www.billboard.com/charts/hot-100/");
  if (!md) return [];
  return parseRankedList(md, 100).map((r) => ({
    chart_name: "Billboard Hot 100",
    region: "US",
    position: r.position,
    title: r.title, primary_artist: r.artist,
    source_url: "https://www.billboard.com/charts/hot-100/",
  }));
}

// ---------- Persist ----------
async function persist(rows: Row[]): Promise<number> {
  if (!rows.length) return 0;
  // Look up previous_position from latest snapshot per chart+region+key
  const prev = new Map<string, number>();
  try {
    const keys = rows.map((r) => trackKey(r.title, r.primary_artist));
    const { data } = await sb.from("chart_placements_history")
      .select("chart_name, region, track_key, position")
      .in("track_key", keys.slice(0, 500))
      .order("captured_on", { ascending: false }).limit(2000);
    for (const d of (data || [])) {
      const k = `${d.chart_name}::${d.region}::${d.track_key}`;
      if (!prev.has(k)) prev.set(k, d.position);
    }
  } catch {}

  const payload = rows.map((r) => {
    const tk = trackKey(r.title, r.primary_artist);
    const k = `${r.chart_name}::${r.region}::${tk}`;
    return {
      chart_name: r.chart_name,
      region: r.region,
      position: r.position,
      previous_position: prev.get(k) ?? null,
      track_key: tk,
      title: r.title,
      primary_artist: r.primary_artist,
      isrc: r.isrc ?? null,
      source_url: r.source_url ?? null,
      raw: r.raw ?? {},
    };
  });

  const { error, count } = await sb.from("chart_placements_history")
    .upsert(payload, { onConflict: "chart_name,region,captured_on,track_key", count: "exact" });
  if (error) { console.warn("chart upsert failed", error); return 0; }
  return count ?? payload.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    let body: any = {}; try { body = await req.json(); } catch {}
    const sources: string[] = Array.isArray(body?.sources) && body.sources.length
      ? body.sources
      : ["apple-us", "apple-gb", "kworb-spotify", "shazam", "billboard"];

    const tasks: Array<Promise<Row[]>> = [];
    if (sources.includes("apple-us")) tasks.push(pullAppleMusic("us", 100));
    if (sources.includes("apple-gb")) tasks.push(pullAppleMusic("gb", 100));
    if (sources.includes("kworb-spotify")) tasks.push(pullKworbSpotify());
    if (sources.includes("shazam")) tasks.push(pullShazam());
    if (sources.includes("billboard")) tasks.push(pullBillboardHot100());

    const results = await Promise.allSettled(tasks);
    const all: Row[] = [];
    const breakdown: Array<{ ok: boolean; count: number; reason?: string }> = [];
    for (const r of results) {
      if (r.status === "fulfilled") { all.push(...r.value); breakdown.push({ ok: true, count: r.value.length }); }
      else { breakdown.push({ ok: false, count: 0, reason: String((r as any).reason) }); }
    }
    const persisted = await persist(all);

    return json({ success: true, persisted, sources: breakdown, durationMs: Date.now() - t0 });
  } catch (e) {
    return json({ success: false, error: String((e as Error).message) }, 500);
  }
});