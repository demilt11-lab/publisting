import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Publisting/1.0.0 (contact@publisting.app)';
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

// Extract platform IDs from URLs
function extractPlatformId(url: string, platform: string): string | null {
  try {
    const u = new URL(url);
    switch (platform) {
      case 'spotify': {
        const m = u.pathname.match(/\/artist\/([a-zA-Z0-9]+)/);
        return m ? m[1] : null;
      }
      case 'apple_music': {
        const m = u.pathname.match(/\/artist\/[^/]+\/(\d+)/);
        return m ? m[1] : null;
      }
      case 'youtube': {
        const m = u.pathname.match(/\/(channel|c|@)\/([^/?]+)/);
        return m ? m[2] : null;
      }
      case 'tidal': {
        const m = u.pathname.match(/\/artist\/(\d+)/);
        return m ? m[1] : null;
      }
      case 'amazon_music': {
        const m = u.pathname.match(/\/artist\/([a-zA-Z0-9]+)/);
        return m ? m[1] : null;
      }
      case 'deezer': {
        const m = u.pathname.match(/\/artist\/(\d+)/);
        return m ? m[1] : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// Classify MusicBrainz URL relationships
function classifyUrl(url: string): { platform: string; url: string } | null {
  const u = url.toLowerCase();
  if (u.includes('open.spotify.com/artist')) return { platform: 'spotify', url };
  if (u.includes('music.apple.com') && u.includes('artist')) return { platform: 'apple_music', url };
  if (u.includes('music.youtube.com/channel')) return { platform: 'youtube_music', url };
  if (u.includes('youtube.com/channel') || u.includes('youtube.com/@') || u.includes('youtube.com/c/')) return { platform: 'youtube', url };
  if (u.includes('tidal.com/artist') || u.includes('tidal.com/browse/artist')) return { platform: 'tidal', url };
  if (u.includes('deezer.com/artist')) return { platform: 'deezer', url };
  if (u.includes('music.amazon') && u.includes('artist')) return { platform: 'amazon_music', url };
  if (u.includes('soundcloud.com/')) return { platform: 'soundcloud', url };
  if (u.includes('pandora.com/artist')) return { platform: 'pandora', url };
  if (u.includes('audiomack.com/')) return { platform: 'audiomack', url };
  if (u.includes('bandcamp.com')) return { platform: 'bandcamp', url };
  if (u.includes('instagram.com/')) return { platform: 'instagram', url };
  if (u.includes('twitter.com/') || u.includes('x.com/')) return { platform: 'twitter', url };
  if (u.includes('tiktok.com/@')) return { platform: 'tiktok', url };
  if (u.includes('facebook.com/')) return { platform: 'facebook', url };
  if (u.includes('genius.com/artists/')) return { platform: 'genius', url };
  if (u.includes('discogs.com/artist')) return { platform: 'discogs', url };
  if (u.includes('allmusic.com/artist')) return { platform: 'allmusic', url };
  if (u.includes('wikidata.org/')) return { platform: 'wikidata', url };
  return null;
}

const ODESLI_PLATFORM_MAP: Record<string, string> = {
  spotify: 'spotify',
  appleMusic: 'apple_music',
  youtube: 'youtube',
  youtubeMusic: 'youtube_music',
  tidal: 'tidal',
  deezer: 'deezer',
  amazonMusic: 'amazon_music',
  soundcloud: 'soundcloud',
  pandora: 'pandora',
};

async function searchMusicBrainz(artistName: string): Promise<{ mbid: string; score: number } | null> {
  await delay(1100);
  const res = await fetch(
    `${MB_BASE}/artist?query=artist:"${encodeURIComponent(artistName)}"&fmt=json&limit=3`,
    { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const match = (data.artists || []).find((a: any) =>
    a.name.toLowerCase() === artistName.toLowerCase() || a.score >= 90
  );
  return match ? { mbid: match.id, score: match.score || 100 } : null;
}

async function fetchMbUrlRels(mbid: string): Promise<Record<string, string>> {
  await delay(1100);
  const res = await fetch(
    `${MB_BASE}/artist/${mbid}?inc=url-rels&fmt=json`,
    { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
  );
  if (!res.ok) return {};
  const data = await res.json();
  const links: Record<string, string> = {};
  for (const rel of data.relations || []) {
    if (rel.url?.resource) {
      const classified = classifyUrl(rel.url.resource);
      if (classified && !links[classified.platform]) {
        links[classified.platform] = classified.url;
      }
    }
  }
  return links;
}

// Fetch verified socials from Genius (instagram_name / twitter_name /
// facebook_name are confirmed on the artist's Genius profile and are far
// more reliable than MusicBrainz URL relations for socials).
async function fetchGeniusArtistSocials(name: string): Promise<Record<string, string>> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return {};

    const res = await fetch(`${supabaseUrl}/functions/v1/genius-artist-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return {};
    const data = await res.json().catch(() => null);
    if (!data?.success || !data?.data) return {};

    const out: Record<string, string> = {};
    if (data.data.instagram) out.instagram = data.data.instagram;
    if (data.data.twitter) out.twitter = data.data.twitter;
    if (data.data.facebook) out.facebook = data.data.facebook;
    if (data.data.genius) out.genius = data.data.genius;
    return out;
  } catch {
    return {};
  }
}

async function fetchOdesliLinks(trackUrl: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(trackUrl)}&userCountry=US`
    );
    if (!res.ok) return {};
    const data = await res.json();
    const links: Record<string, string> = {};
    for (const [platform, info] of Object.entries(data.linksByPlatform || {})) {
      const mapped = ODESLI_PLATFORM_MAP[platform];
      if (mapped && (info as any)?.url) {
        links[mapped] = (info as any).url;
      }
    }
    return links;
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, role, trackUrl } = await req.json();

    if (!name || typeof name !== 'string' || name.length > 500) {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid name required (max 500 chars)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validRoles = ['artist', 'writer', 'producer', 'mixed'];
    const safeRole = validRoles.includes(role) ? role : 'mixed';
    const nameLower = name.toLowerCase().trim();

    const supabase = getSupabaseClient();

    // Check if person already exists and is recently enriched
    const { data: existing } = await supabase
      .from('people')
      .select('id, last_enriched_at, enrichment_version')
      .eq('name_lower', nameLower)
      .eq('role', safeRole)
      .maybeSingle();

    if (existing?.last_enriched_at) {
      const enrichedAt = new Date(existing.last_enriched_at);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (enrichedAt > sevenDaysAgo) {
        // Return existing enriched data
        const { data: links } = await supabase
          .from('people_links')
          .select('platform, url, confidence, source')
          .eq('person_id', existing.id)
          .order('confidence', { ascending: false });

        return new Response(
          JSON.stringify({ success: true, personId: existing.id, links: links || [], cached: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 1: Search MusicBrainz
    console.log(`Enriching: ${name} (${safeRole})`);
    const allLinks: { platform: string; url: string; confidence: number; source: string }[] = [];
    let mbid: string | null = null;

    const mbMatch = await searchMusicBrainz(name);
    if (mbMatch) {
      mbid = mbMatch.mbid;
      const confidence = mbMatch.score >= 100 ? 1.0 : mbMatch.score / 100;

      // Step 2: Fetch URL relationships
      const mbLinks = await fetchMbUrlRels(mbid);
      for (const [platform, url] of Object.entries(mbLinks)) {
        allLinks.push({ platform, url, confidence, source: 'musicbrainz' });
      }
      console.log(`MusicBrainz: ${Object.keys(mbLinks).length} links found for ${name}`);
    }

    // Step 3: Odesli fallback if fewer than 3 DSP links
    const dspPlatforms = ['spotify', 'apple_music', 'tidal', 'deezer', 'amazon_music', 'youtube_music', 'soundcloud', 'pandora'];
    const dspCount = allLinks.filter(l => dspPlatforms.includes(l.platform)).length;

    if (dspCount < 3 && trackUrl) {
      console.log(`Odesli fallback for ${name} (only ${dspCount} DSP links)`);
      const odesliLinks = await fetchOdesliLinks(trackUrl);
      for (const [platform, url] of Object.entries(odesliLinks)) {
        if (!allLinks.some(l => l.platform === platform)) {
          allLinks.push({ platform, url, confidence: 0.8, source: 'odesli' });
        }
      }
    }

    // Step 3b: Genius artist socials (verified instagram/twitter/facebook).
    // Only meaningful for artist-like roles (artists, performers).
    if (safeRole === 'artist' || safeRole === 'mixed') {
      const geniusSocials = await fetchGeniusArtistSocials(name);
      const overridable = new Set(['instagram', 'twitter', 'facebook']);
      for (const [platform, url] of Object.entries(geniusSocials)) {
        if (overridable.has(platform)) {
          // Genius is verified — drop any prior MB/Odesli value for this socialplatform
          for (let i = allLinks.length - 1; i >= 0; i--) {
            if (allLinks[i].platform === platform) allLinks.splice(i, 1);
          }
          allLinks.push({ platform, url, confidence: 1.0, source: 'genius' });
        } else if (!allLinks.some(l => l.platform === platform)) {
          allLinks.push({ platform, url, confidence: 0.95, source: 'genius' });
        }
      }
      if (Object.keys(geniusSocials).length > 0) {
        console.log(`Genius socials for ${name}:`, Object.keys(geniusSocials));
      }
    }

    // Step 4: Upsert person record
    const platformFields: Record<string, string> = {};
    const idFields: Record<string, string | null> = {};

    for (const link of allLinks) {
      // Extract IDs for main table columns
      const id = extractPlatformId(link.url, link.platform);
      switch (link.platform) {
        case 'spotify': idFields.spotify_id = id; break;
        case 'apple_music': idFields.apple_music_id = id; break;
        case 'youtube': idFields.youtube_channel_id = id; break;
        case 'tidal': idFields.tidal_id = id; break;
        case 'amazon_music': idFields.amazon_music_id = id; break;
        case 'deezer': idFields.deezer_id = id; break;
        case 'soundcloud': platformFields.soundcloud_url = link.url; break;
        case 'instagram': platformFields.instagram_url = link.url; break;
        case 'tiktok': platformFields.tiktok_url = link.url; break;
        case 'twitter': platformFields.twitter_url = link.url; break;
        case 'facebook': platformFields.facebook_url = link.url; break;
      }
    }

    const personData = {
      name: name.trim(),
      role: safeRole,
      mbid,
      ...idFields,
      ...platformFields,
      last_enriched_at: new Date().toISOString(),
      enrichment_version: 2,
    };

    let personId: string;

    if (existing) {
      personId = existing.id;
      await supabase.from('people').update(personData).eq('id', existing.id);
    } else {
      // Try insert (name_lower is a generated column, don't set it explicitly)
      const { data: inserted, error: insertError } = await supabase
        .from('people')
        .insert(personData)
        .select('id')
        .single();

      if (insertError) {
        // Race condition: another request may have inserted; look it up
        const { data: found } = await supabase
          .from('people')
          .select('id')
          .eq('name_lower', nameLower)
          .eq('role', safeRole)
          .maybeSingle();

        if (found) {
          personId = found.id;
          await supabase.from('people').update(personData).eq('id', found.id);
        } else {
          throw new Error(`Failed to create person: ${insertError.message}`);
        }
      } else {
        personId = inserted.id;
      }
    }

    // Step 5: Upsert links
    if (allLinks.length > 0) {
      // Delete old automated links (keep manual ones)
      await supabase
        .from('people_links')
        .delete()
        .eq('person_id', personId)
        .neq('source', 'manual');

      const linkRows = allLinks.map(l => ({
        person_id: personId,
        platform: l.platform,
        url: l.url,
        confidence: l.confidence,
        source: l.source,
      }));

      await supabase.from('people_links').upsert(linkRows, {
        onConflict: 'person_id,platform,source',
      });
    }

    // Fetch final state
    const { data: finalLinks } = await supabase
      .from('people_links')
      .select('platform, url, confidence, source')
      .eq('person_id', personId)
      .order('confidence', { ascending: false });

    console.log(`Enrichment complete for ${name}: ${(finalLinks || []).length} total links`);

    return new Response(
      JSON.stringify({ success: true, personId, links: finalLinks || [], cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('People enrich error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Enrichment failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
