const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
import { createClient } from 'npm:@supabase/supabase-js@2';

const SOUNDCHARTS_BASE = 'https://customer.api.soundcharts.com/api/v2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('SOUNDCHARTS_API_KEY');
    if (!apiKey) throw new Error('SOUNDCHARTS_API_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { artist_name, spotify_id } = await req.json();
    if (!artist_name && !spotify_id) {
      return new Response(JSON.stringify({ success: false, error: 'artist_name or spotify_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cacheKey = `soundcharts::${(spotify_id || artist_name).toLowerCase()}`;

    // Check cache
    const { data: cached } = await supabase
      .from('soundcharts_cache')
      .select('data, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cached && new Date(cached.expires_at) > new Date()) {
      return new Response(JSON.stringify({ success: true, data: cached.data, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const headers = {
      'x-app-id': apiKey.split(':')[0] || apiKey,
      'x-api-key': apiKey.split(':')[1] || apiKey,
      'Accept': 'application/json',
    };

    // Step 1: Find the artist on Soundcharts
    let artistUuid = null;
    if (spotify_id) {
      try {
        const identRes = await fetch(`${SOUNDCHARTS_BASE}/artist/by-platform/spotify/${spotify_id}`, { headers });
        if (identRes.ok) {
          const identData = await identRes.json();
          artistUuid = identData?.object?.uuid;
        }
      } catch (e) { console.log('Soundcharts spotify lookup failed:', e); }
    }

    if (!artistUuid && artist_name) {
      try {
        const searchRes = await fetch(`${SOUNDCHARTS_BASE}/artist/search/${encodeURIComponent(artist_name)}`, { headers });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const items = searchData?.items || [];
          if (items.length > 0) artistUuid = items[0]?.uuid;
        }
      } catch (e) { console.log('Soundcharts search failed:', e); }
    }

    if (!artistUuid) {
      return new Response(JSON.stringify({ success: false, error: 'Artist not found on Soundcharts' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 2: Fetch analytics in parallel
    const [streamingRes, socialRes, playlistRes, chartRes] = await Promise.allSettled([
      fetch(`${SOUNDCHARTS_BASE}/artist/${artistUuid}/streaming/spotify/listening?period=month`, { headers }),
      fetch(`${SOUNDCHARTS_BASE}/artist/${artistUuid}/social/instagram/audience`, { headers }),
      fetch(`${SOUNDCHARTS_BASE}/artist/${artistUuid}/playlist/spotify/current`, { headers }),
      fetch(`${SOUNDCHARTS_BASE}/artist/${artistUuid}/chart/entry/spotify?limit=10`, { headers }),
    ]);

    const parseResult = async (res: PromiseSettledResult<Response>) => {
      if (res.status === 'fulfilled' && res.value.ok) {
        return await res.value.json();
      }
      if (res.status === 'fulfilled') await res.value.text(); // consume body
      return null;
    };

    const streaming = await parseResult(streamingRes);
    const social = await parseResult(socialRes);
    const playlists = await parseResult(playlistRes);
    const charts = await parseResult(chartRes);

    // Step 3: Extract key metrics
    const listeningItems = streaming?.items || [];
    const latestStreaming = listeningItems[0];
    const weekAgo = listeningItems[6];

    const playlistItems = playlists?.items || [];
    const chartItems = charts?.items || [];

    const result = {
      artist_uuid: artistUuid,
      spotify: {
        monthly_listeners: latestStreaming?.value || null,
        monthly_listeners_delta_7d: latestStreaming && weekAgo ? latestStreaming.value - weekAgo.value : null,
        monthly_listeners_delta_pct: latestStreaming && weekAgo && weekAgo.value > 0
          ? Math.round(((latestStreaming.value - weekAgo.value) / weekAgo.value) * 10000) / 100 : null,
      },
      social: {
        instagram_followers: social?.items?.[0]?.value || null,
      },
      playlists: {
        total_playlists: playlistItems.length,
        editorial_playlists: playlistItems.filter((p: any) => p?.type === 'editorial').length,
        total_reach: playlistItems.reduce((sum: number, p: any) => sum + (p?.subscriberCount || 0), 0),
        top_playlists: playlistItems.slice(0, 5).map((p: any) => ({
          name: p?.name,
          followers: p?.subscriberCount,
          type: p?.type,
        })),
      },
      charts: {
        current_chart_positions: chartItems.slice(0, 5).map((c: any) => ({
          chart: c?.chartName,
          position: c?.position,
          country: c?.countryCode,
        })),
      },
      fetched_at: new Date().toISOString(),
    };

    // Cache result
    await supabase.from('soundcharts_cache').upsert({
      cache_key: cacheKey,
      data: result,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'cache_key' });

    return new Response(JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Soundcharts enrich error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
