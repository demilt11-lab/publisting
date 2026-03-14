const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'PubCheck/1.0.0 (contact@pubcheck.app)';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    if (!query || query.trim().length < 3) {
      return new Response(
        JSON.stringify({ recordings: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const encoded = encodeURIComponent(query.trim());
    const res = await fetch(`${MB_BASE}/recording/?query=${encoded}&limit=5&fmt=json`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });

    if (!res.ok) {
      console.warn('MusicBrainz autocomplete failed:', res.status);
      return new Response(
        JSON.stringify({ recordings: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await res.json();
    const recordings = (data.recordings || []).slice(0, 5).map((r: any) => ({
      id: r.id,
      title: r.title,
      artist: r['artist-credit']?.map((ac: any) => ac.name).join(', ') || 'Unknown',
    }));

    return new Response(
      JSON.stringify({ recordings }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Autocomplete error:', error);
    return new Response(
      JSON.stringify({ recordings: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
