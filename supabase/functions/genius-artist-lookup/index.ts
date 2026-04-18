// Genius Artist Lookup
// Resolves an artist by name to a Genius artist record and returns verified
// social handles (instagram_name, twitter_name, facebook_name) plus website.
// These are *verified by Genius* (the artist or Genius staff confirms the
// handle on the artist's profile), so they are far more reliable than
// MusicBrainz URL relations for Instagram/Twitter/Facebook.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GENIUS_BASE = 'https://api.genius.com';
const CACHE_TTL_HOURS = 168; // 7 days

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function getCache(cacheKey: string): Promise<any | null> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('streaming_stats_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (data && new Date(data.expires_at) > new Date()) return data.data;
    return null;
  } catch { return null; }
}

async function setCache(cacheKey: string, value: any): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await supabase
      .from('streaming_stats_cache')
      .upsert({ cache_key: cacheKey, data: value, expires_at: expiresAt }, { onConflict: 'cache_key' });
  } catch { }
}

function normalizeName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface GeniusSocials {
  instagram?: string;
  twitter?: string;
  facebook?: string;
  website?: string;
  genius?: string;
  geniusArtistId?: number;
  matchedName?: string;
}

async function searchGeniusArtist(name: string, token: string): Promise<{ id: number; name: string; url?: string } | null> {
  const target = normalizeName(name);
  if (!target) return null;

  const res = await fetch(
    `${GENIUS_BASE}/search?q=${encodeURIComponent(name)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const hits: any[] = data?.response?.hits || [];

  // Look for an exact primary_artist match
  const seen = new Set<number>();
  const candidates: { id: number; name: string; url?: string }[] = [];
  for (const h of hits) {
    const a = h?.result?.primary_artist;
    if (!a?.id || seen.has(a.id)) continue;
    seen.add(a.id);
    candidates.push({ id: a.id, name: a.name, url: a.url });
  }

  // Strict exact match first
  const exact = candidates.find((c) => normalizeName(c.name) === target);
  if (exact) return exact;

  // Otherwise no match — refuse to guess. (Fail-closed policy.)
  return null;
}

async function fetchGeniusArtist(artistId: number, token: string): Promise<any | null> {
  const res = await fetch(
    `${GENIUS_BASE}/artists/${artistId}?text_format=plain`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.response?.artist || null;
}

function buildSocials(artist: any): GeniusSocials {
  const out: GeniusSocials = {
    geniusArtistId: artist?.id,
    matchedName: artist?.name,
  };
  if (artist?.instagram_name) out.instagram = `https://www.instagram.com/${String(artist.instagram_name).replace(/^@/, '')}`;
  if (artist?.twitter_name) out.twitter = `https://x.com/${String(artist.twitter_name).replace(/^@/, '')}`;
  if (artist?.facebook_name) out.facebook = `https://www.facebook.com/${String(artist.facebook_name).replace(/^@/, '')}`;
  if (artist?.url) out.genius = artist.url;
  // Genius sometimes includes a website link in description_annotation; the
  // public artist endpoint does not expose a clean website field, so we skip
  // it to avoid noise.
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name } = await req.json();

    if (!name || typeof name !== 'string' || name.length > 200) {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid name required (max 200 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = Deno.env.get('GENIUS_TOKEN');
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'GENIUS_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cacheKey = `v5::genius_artist_${normalizeName(name)}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return new Response(
        JSON.stringify({ success: true, data: cached, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const match = await searchGeniusArtist(name, token);
    if (!match) {
      const empty: GeniusSocials = {};
      await setCache(cacheKey, empty);
      return new Response(
        JSON.stringify({ success: true, data: empty }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const artist = await fetchGeniusArtist(match.id, token);
    if (!artist) {
      const minimal: GeniusSocials = { geniusArtistId: match.id, matchedName: match.name, genius: match.url };
      await setCache(cacheKey, minimal);
      return new Response(
        JSON.stringify({ success: true, data: minimal }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const socials = buildSocials(artist);
    console.log(`Genius artist lookup for "${name}": matched "${socials.matchedName}", socials:`, {
      instagram: !!socials.instagram, twitter: !!socials.twitter, facebook: !!socials.facebook,
    });

    await setCache(cacheKey, socials);

    return new Response(
      JSON.stringify({ success: true, data: socials }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Genius artist lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
