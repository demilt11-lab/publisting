import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

function buildCacheKey(input: { url?: string; title?: string; artist?: string }) {
  if (input.url) return `url::${input.url.toLowerCase()}`;
  return `q::${(input.title ?? "").toLowerCase()}::${(input.artist ?? "").toLowerCase()}`;
}

async function readCache(cacheKey: string): Promise<any | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("odesli_cache")
      .select("response, expires_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.response;
  } catch {
    return null;
  }
}

async function writeCache(cacheKey: string, payload: any, input: { url?: string; title?: string; artist?: string }) {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("odesli_cache").upsert({
      cache_key: cacheKey,
      query_url: input.url ?? null,
      query_title: input.title ?? null,
      query_artist: input.artist ?? null,
      response: payload,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "cache_key" });
  } catch (err) {
    console.warn("odesli_cache write failed:", err);
  }
}

interface OdesliResponse {
  entityUniqueId: string;
  userCountry: string;
  pageUrl: string;
  linksByPlatform: {
    [platform: string]: {
      url: string;
      entityUniqueId: string;
    };
  };
  entitiesByUniqueId: {
    [id: string]: {
      id: string;
      type: string;
      title?: string;
      artistName?: string;
      thumbnailUrl?: string;
      thumbnailWidth?: number;
      thumbnailHeight?: number;
    };
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, title, artist } = await req.json();
    
    // Input validation
    if (url && (typeof url !== 'string' || url.length > 2000)) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (title && (typeof title !== 'string' || title.length > 500)) {
      return new Response(
        JSON.stringify({ error: 'Title too long (max 500 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (artist && (typeof artist !== 'string' || artist.length > 500)) {
      return new Response(
        JSON.stringify({ error: 'Artist too long (max 500 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let queryUrl = '';
    
    if (url) {
      queryUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    } else if (title && artist) {
      const searchQuery = `${title} ${artist}`;
      queryUrl = `https://api.song.link/v1-alpha.1/links?q=${encodeURIComponent(searchQuery)}&userCountry=US`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Either url or title+artist required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cache check (7-day TTL)
    const cacheKey = buildCacheKey({ url, title, artist });
    const cached = await readCache(cacheKey);
    if (cached) {
      console.log('Odesli cache hit:', cacheKey);
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      });
    }

    console.log('Fetching Odesli data:', queryUrl);
    
    const response = await fetch(queryUrl);
    
    if (!response.ok) {
      console.log('Odesli API returned:', response.status);
      return new Response(
        JSON.stringify({ error: 'Song not found on streaming platforms', links: {} }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data: OdesliResponse = await response.json();
    
    // Extract the main streaming links
    const platforms = ['spotify', 'appleMusic', 'youtube', 'youtubeMusic', 'tidal', 'deezer', 'amazonMusic', 'soundcloud', 'pandora'];
    
    const links: Record<string, string> = {};
    
    for (const platform of platforms) {
      if (data.linksByPlatform[platform]) {
        links[platform] = data.linksByPlatform[platform].url;
      }
    }

    const payload = { pageUrl: data.pageUrl, links };
    // Best-effort write; do not block response on cache errors.
    writeCache(cacheKey, payload, { url, title, artist });
    return new Response(
      JSON.stringify(payload),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' } }
    );
  } catch (error: unknown) {
    console.error('Odesli lookup error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, links: {} }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
