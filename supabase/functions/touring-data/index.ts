import { corsHeaders } from '@supabase/supabase-js/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BANDSINTOWN_BASE = 'https://rest.bandsintown.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('BANDSINTOWN_API_KEY');
    if (!apiKey) throw new Error('BANDSINTOWN_API_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { artist_name, person_id } = await req.json();
    if (!artist_name) {
      return new Response(JSON.stringify({ success: false, error: 'artist_name required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check recent data (cache 24h)
    const { data: existing } = await supabase
      .from('artist_tour_data')
      .select('*')
      .eq('artist_name', artist_name)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && (Date.now() - new Date(existing.updated_at).getTime()) < 24 * 60 * 60 * 1000) {
      return new Response(JSON.stringify({ success: true, data: existing, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch from Bandsintown
    const encodedArtist = encodeURIComponent(artist_name);

    const [artistRes, eventsRes] = await Promise.allSettled([
      fetch(`${BANDSINTOWN_BASE}/artists/${encodedArtist}?app_id=${apiKey}`),
      fetch(`${BANDSINTOWN_BASE}/artists/${encodedArtist}/events?app_id=${apiKey}&date=upcoming`),
    ]);

    let artistInfo = null;
    if (artistRes.status === 'fulfilled' && artistRes.value.ok) {
      artistInfo = await artistRes.value.json();
    } else if (artistRes.status === 'fulfilled') {
      await artistRes.value.text();
    }

    let events: any[] = [];
    if (eventsRes.status === 'fulfilled' && eventsRes.value.ok) {
      const eventsData = await eventsRes.value.json();
      events = Array.isArray(eventsData) ? eventsData : [];
    } else if (eventsRes.status === 'fulfilled') {
      await eventsRes.value.text();
    }

    // Process events
    const regions = new Set<string>();
    let totalCapacity = 0;
    let capacityCount = 0;

    const rawEvents = events.slice(0, 50).map((e: any) => {
      const venue = e.venue || {};
      const country = venue.country || '';
      const region = venue.region || '';
      if (country) regions.add(country);

      // Estimate capacity from venue type (Bandsintown doesn't always provide)
      const venueCapacity = e.venue?.capacity || null;
      if (venueCapacity) {
        totalCapacity += venueCapacity;
        capacityCount++;
      }

      return {
        date: e.datetime,
        venue_name: venue.name,
        city: venue.city,
        region,
        country,
        capacity: venueCapacity,
        status: e.offers?.length > 0 ? 'on_sale' : 'announced',
        ticket_url: e.offers?.[0]?.url || null,
      };
    });

    const sortedDates = rawEvents.map(e => e.date).filter(Boolean).sort();
    const nextShow = sortedDates[0] || null;
    const lastShow = sortedDates[sortedDates.length - 1] || null;

    const tourData = {
      artist_name,
      person_id: person_id || null,
      upcoming_shows_count: events.length,
      avg_venue_capacity: capacityCount > 0 ? Math.round(totalCapacity / capacityCount) : null,
      touring_regions: [...regions],
      next_show_date: nextShow ? new Date(nextShow).toISOString().split('T')[0] : null,
      last_tour_date: lastShow ? new Date(lastShow).toISOString().split('T')[0] : null,
      on_tour: events.length > 0,
      raw_events: rawEvents.slice(0, 20),
      updated_at: new Date().toISOString(),
    };

    // Upsert to DB
    if (existing) {
      await supabase.from('artist_tour_data')
        .update(tourData)
        .eq('id', existing.id);
    } else {
      await supabase.from('artist_tour_data').insert(tourData);
    }

    return new Response(JSON.stringify({ success: true, data: tourData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Touring data error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
