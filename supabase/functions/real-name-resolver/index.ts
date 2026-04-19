// Real Name (Legal Name) Resolver
// Resolves a stage / performance name (e.g. "O Banga") to the artist's
// real / legal name(s) (e.g. "John Smith") so we can cross-reference against
// MLC / ASCAP / BMI / SongView publisher claim data, which lists writers under
// their LEGAL name, not their stage name.
//
// Sources, in priority order:
//   1. Genius  -> artist.alternate_names + description text ("born <name>", "real name <name>")
//   2. MusicBrainz -> aliases of type "Legal name" or sort-name when distinct
//   3. Discogs -> artist.realname field
//
// Strict exact-name matching is used downstream — we only return names we are
// highly confident in. Fail-closed: if no source returns a real name, we
// return an empty array (and the system should NOT guess).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CACHE_TTL_HOURS = 168; // 7 days

interface RealNameResult {
  stageName: string;
  realNames: string[];          // Distinct legal names (deduped, normalized)
  sources: string[];            // Which sources contributed
  matched: { name: string; source: string; confidence: number }[];
}

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function normalizeName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseClean(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** Looks like a real personal name: 2-4 words, mostly letters, not a stage handle. */
function looksLikeRealName(candidate: string, stageName: string): boolean {
  const c = candidate.trim();
  if (!c || c.length < 4 || c.length > 80) return false;
  // Must be 2-5 words
  const words = c.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  // Each word must start with a letter, contain only letters/apostrophes/hyphens/dots
  if (!words.every(w => /^[A-ZÀ-Ý][a-zà-ÿA-ZÀ-Ý.''\-]{0,30}\.?$/u.test(w))) return false;
  // Reject if equal to stage name (no info)
  if (normalizeName(c) === normalizeName(stageName)) return false;
  // Reject obvious junk
  if (/(records?|music|publishing|entertainment|productions?|llc|inc|the\s)/i.test(c)) return false;
  return true;
}

async function getCache(key: string): Promise<RealNameResult | null> {
  try {
    const supa = getSupabase();
    const { data } = await supa
      .from('streaming_stats_cache')
      .select('data, expires_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (data && new Date(data.expires_at) > new Date()) return data.data as RealNameResult;
    return null;
  } catch { return null; }
}

async function setCache(key: string, value: RealNameResult): Promise<void> {
  try {
    const supa = getSupabase();
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600_000).toISOString();
    await supa
      .from('streaming_stats_cache')
      .upsert({ cache_key: key, data: value, expires_at: expiresAt }, { onConflict: 'cache_key' });
  } catch { /* ignore */ }
}

// ---------------- GENIUS ----------------

async function resolveFromGenius(stageName: string, token: string): Promise<{ names: string[]; matched?: string }> {
  try {
    const target = normalizeName(stageName);
    if (!target) return { names: [] };

    const sr = await fetch(
      `https://api.genius.com/search?q=${encodeURIComponent(stageName)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!sr.ok) return { names: [] };
    const sd = await sr.json().catch(() => null);
    const hits: any[] = sd?.response?.hits || [];

    let artistId: number | undefined;
    let artistName: string | undefined;
    const seen = new Set<number>();
    for (const h of hits) {
      const a = h?.result?.primary_artist;
      if (!a?.id || seen.has(a.id)) continue;
      seen.add(a.id);
      if (normalizeName(a.name) === target) {
        artistId = a.id;
        artistName = a.name;
        break;
      }
    }
    if (!artistId) return { names: [] };

    // Fetch full artist with description
    const ar = await fetch(
      `https://api.genius.com/artists/${artistId}?text_format=plain`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!ar.ok) return { names: [] };
    const ad = await ar.json().catch(() => null);
    const artist = ad?.response?.artist;
    if (!artist) return { names: [] };

    const out = new Set<string>();

    // 1. alternate_names array
    const alts: string[] = Array.isArray(artist.alternate_names) ? artist.alternate_names : [];
    for (const alt of alts) {
      if (typeof alt === 'string' && looksLikeRealName(alt, stageName)) {
        out.add(titleCaseClean(alt));
      }
    }

    // 2. description -> "born <Name>" or "real name <Name>" or "<Name> (born ...)"
    const desc: string = artist?.description?.plain || '';
    if (desc && desc.length > 10) {
      const patterns = [
        /\b(?:born|birth name|real name|legally|legal name)[:\s]+([A-ZÀ-Ý][\p{L}.''\-]+(?:\s+[A-ZÀ-Ý][\p{L}.''\-]+){1,3})/gu,
        /(?:professionally\s+known\s+as|stage\s+name)[^.]{0,80}?\b([A-ZÀ-Ý][\p{L}.''\-]+(?:\s+[A-ZÀ-Ý][\p{L}.''\-]+){1,3})\b/gu,
        // "Foo Bar (born Baz Qux ..."
        /\(\s*born\s+([A-ZÀ-Ý][\p{L}.''\-]+(?:\s+[A-ZÀ-Ý][\p{L}.''\-]+){1,3})/gu,
      ];
      for (const p of patterns) {
        let m: RegExpExecArray | null;
        while ((m = p.exec(desc)) !== null) {
          const candidate = m[1];
          if (looksLikeRealName(candidate, stageName)) {
            out.add(titleCaseClean(candidate));
          }
        }
      }
    }

    return { names: Array.from(out), matched: artistName };
  } catch (e) {
    console.warn('Genius real-name lookup failed:', e);
    return { names: [] };
  }
}

// ---------------- MUSICBRAINZ ----------------

async function resolveFromMusicBrainz(stageName: string): Promise<string[]> {
  try {
    const target = normalizeName(stageName);
    if (!target) return [];

    // Search artist
    const sr = await fetch(
      `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${stageName}"`)}&fmt=json&limit=5`,
      { headers: { 'User-Agent': 'Publisting/1.0 (publisting.net)' } }
    );
    if (!sr.ok) return [];
    const sd = await sr.json().catch(() => null);
    const artists: any[] = sd?.artists || [];

    const exact = artists.find((a: any) => normalizeName(a.name) === target);
    if (!exact?.id) return [];

    // Get aliases
    const ar = await fetch(
      `https://musicbrainz.org/ws/2/artist/${exact.id}?inc=aliases&fmt=json`,
      { headers: { 'User-Agent': 'Publisting/1.0 (publisting.net)' } }
    );
    if (!ar.ok) return [];
    const ad = await ar.json().catch(() => null);
    const aliases: any[] = ad?.aliases || [];

    const out = new Set<string>();
    for (const al of aliases) {
      const name: string = al?.name || '';
      const type: string = (al?.type || '').toLowerCase();
      if (type === 'legal name' && looksLikeRealName(name, stageName)) {
        out.add(titleCaseClean(name));
      }
    }
    return Array.from(out);
  } catch (e) {
    console.warn('MusicBrainz real-name lookup failed:', e);
    return [];
  }
}

// ---------------- DISCOGS ----------------

async function resolveFromDiscogs(stageName: string, token: string): Promise<string[]> {
  try {
    const target = normalizeName(stageName);
    if (!target) return [];

    const sr = await fetch(
      `https://api.discogs.com/database/search?type=artist&q=${encodeURIComponent(stageName)}&per_page=5`,
      {
        headers: {
          'User-Agent': 'Publisting/1.0',
          Authorization: `Discogs token=${token}`,
        },
      }
    );
    if (!sr.ok) return [];
    const sd = await sr.json().catch(() => null);
    const results: any[] = sd?.results || [];

    const exact = results.find((r: any) => normalizeName(r.title) === target);
    if (!exact?.id) return [];

    const ar = await fetch(
      `https://api.discogs.com/artists/${exact.id}`,
      {
        headers: {
          'User-Agent': 'Publisting/1.0',
          Authorization: `Discogs token=${token}`,
        },
      }
    );
    if (!ar.ok) return [];
    const ad = await ar.json().catch(() => null);
    const realname: string = ad?.realname || '';

    const out = new Set<string>();
    if (realname && looksLikeRealName(realname, stageName)) {
      out.add(titleCaseClean(realname));
    }
    // Discogs sometimes lists multiple comma-separated names
    if (realname.includes(',')) {
      for (const part of realname.split(/,\s*/)) {
        if (looksLikeRealName(part, stageName)) out.add(titleCaseClean(part));
      }
    }
    return Array.from(out);
  } catch (e) {
    console.warn('Discogs real-name lookup failed:', e);
    return [];
  }
}

// ---------------- HANDLER ----------------

async function resolveOne(stageName: string): Promise<RealNameResult> {
  const cacheKey = `v1::real_name::${normalizeName(stageName)}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const geniusToken = Deno.env.get('GENIUS_TOKEN');
  const discogsToken = Deno.env.get('DISCOGS_TOKEN');

  const [geniusRes, mbRes, dgRes] = await Promise.all([
    geniusToken ? resolveFromGenius(stageName, geniusToken) : Promise.resolve({ names: [] as string[] }),
    resolveFromMusicBrainz(stageName),
    discogsToken ? resolveFromDiscogs(stageName, discogsToken) : Promise.resolve([] as string[]),
  ]);

  const matched: { name: string; source: string; confidence: number }[] = [];
  const used = new Set<string>();
  const sources = new Set<string>();

  const add = (name: string, source: string, confidence: number) => {
    const norm = normalizeName(name);
    if (!norm) return;
    if (used.has(norm)) return;
    used.add(norm);
    matched.push({ name, source, confidence });
    sources.add(source);
  };

  // MusicBrainz "Legal name" alias is the most authoritative.
  for (const n of mbRes) add(n, 'musicbrainz', 1.0);
  // Discogs realname is curator-edited and reliable.
  for (const n of dgRes) add(n, 'discogs', 0.95);
  // Genius alternate_names + parsed description.
  for (const n of geniusRes.names) add(n, 'genius', 0.9);

  const result: RealNameResult = {
    stageName,
    realNames: matched.map(m => m.name),
    sources: Array.from(sources),
    matched,
  };

  await setCache(cacheKey, result);
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const names: string[] = Array.isArray(body?.names)
      ? body.names
      : (typeof body?.name === 'string' ? [body.name] : []);

    const cleaned = names
      .map((n) => (typeof n === 'string' ? n.trim() : ''))
      .filter((n) => n.length > 0 && n.length <= 200)
      .slice(0, 25); // hard cap

    if (cleaned.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No names provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve in parallel but cap concurrency at 5 to be polite to upstream APIs.
    const results: Record<string, RealNameResult> = {};
    const concurrency = 5;
    for (let i = 0; i < cleaned.length; i += concurrency) {
      const batch = cleaned.slice(i, i + concurrency);
      const resolved = await Promise.all(batch.map((n) => resolveOne(n).catch((e) => {
        console.warn('resolveOne failed for', n, e);
        return { stageName: n, realNames: [], sources: [], matched: [] } as RealNameResult;
      })));
      for (const r of resolved) results[r.stageName] = r;
    }

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('real-name-resolver error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
