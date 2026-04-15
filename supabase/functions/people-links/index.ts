import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getSupabaseClient();

  try {
    const body = await req.json();

    // GET by person ID or name lookup
    if (req.method === 'POST' && body.action === 'get') {
      const { personId, name, role } = body;

      let personData;

      if (personId) {
        const { data } = await supabase
          .from('people')
          .select('id, name, role, mbid, spotify_id, apple_music_id, youtube_channel_id, tidal_id, amazon_music_id, deezer_id, soundcloud_url, instagram_url, tiktok_url, twitter_url, facebook_url, website_url, last_enriched_at')
          .eq('id', personId)
          .maybeSingle();
        personData = data;
      } else if (name) {
        const query = supabase
          .from('people')
          .select('id, name, role, mbid, spotify_id, apple_music_id, youtube_channel_id, tidal_id, amazon_music_id, deezer_id, soundcloud_url, instagram_url, tiktok_url, twitter_url, facebook_url, website_url, last_enriched_at')
          .eq('name_lower', name.toLowerCase().trim());

        if (role) query.eq('role', role);

        const { data } = await query.maybeSingle();
        personData = data;
      }

      if (!personData) {
        return new Response(
          JSON.stringify({ success: true, person: null, links: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: links } = await supabase
        .from('people_links')
        .select('id, platform, url, confidence, source, created_at')
        .eq('person_id', personData.id)
        .order('confidence', { ascending: false });

      return new Response(
        JSON.stringify({ success: true, person: personData, links: links || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PATCH — manual override
    if (req.method === 'POST' && body.action === 'update') {
      const { personId, links: manualLinks } = body;

      if (!personId || !Array.isArray(manualLinks)) {
        return new Response(
          JSON.stringify({ success: false, error: 'personId and links array required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate each link
      for (const link of manualLinks) {
        if (!link.platform || typeof link.platform !== 'string' || link.platform.length > 50) {
          return new Response(
            JSON.stringify({ success: false, error: `Invalid platform: ${link.platform}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (!link.url || typeof link.url !== 'string' || link.url.length > 2000) {
          return new Response(
            JSON.stringify({ success: false, error: `Invalid URL for ${link.platform}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Upsert manual links (manual always takes priority)
      const rows = manualLinks.map((l: { platform: string; url: string }) => ({
        person_id: personId,
        platform: l.platform,
        url: l.url,
        confidence: 1.0,
        source: 'manual',
      }));

      const { error } = await supabase.from('people_links').upsert(rows, {
        onConflict: 'person_id,platform,source',
      });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return updated links
      const { data: allLinks } = await supabase
        .from('people_links')
        .select('id, platform, url, confidence, source, created_at')
        .eq('person_id', personId)
        .order('confidence', { ascending: false });

      return new Response(
        JSON.stringify({ success: true, links: allLinks || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Batch lookup by names
    if (req.method === 'POST' && body.action === 'batch') {
      const { names } = body;
      if (!Array.isArray(names) || names.length === 0 || names.length > 20) {
        return new Response(
          JSON.stringify({ success: false, error: 'names array required (1-20)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const lowerNames = names.map((n: string) => n.toLowerCase().trim());
      const { data: people } = await supabase
        .from('people')
        .select('id, name, name_lower, role, last_enriched_at')
        .in('name_lower', lowerNames);

      if (!people || people.length === 0) {
        return new Response(
          JSON.stringify({ success: true, results: {} }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const personIds = people.map(p => p.id);
      const { data: allLinks } = await supabase
        .from('people_links')
        .select('person_id, platform, url, confidence, source')
        .in('person_id', personIds)
        .order('confidence', { ascending: false });

      const results: Record<string, { personId: string; links: any[]; needsEnrichment: boolean }> = {};
      for (const person of people) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const needsEnrichment = !person.last_enriched_at || new Date(person.last_enriched_at) < sevenDaysAgo;
        results[person.name_lower] = {
          personId: person.id,
          links: (allLinks || []).filter(l => l.person_id === person.id),
          needsEnrichment,
        };
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action. Use get, update, or batch' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('People links error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
