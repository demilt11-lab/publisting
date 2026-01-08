import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    
    let queryUrl = '';
    
    if (url) {
      queryUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    } else if (title && artist) {
      // Search using a Spotify search URL as a workaround
      const searchQuery = `${title} ${artist}`;
      queryUrl = `https://api.song.link/v1-alpha.1/links?q=${encodeURIComponent(searchQuery)}&userCountry=US`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Either url or title+artist required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    return new Response(
      JSON.stringify({
        pageUrl: data.pageUrl,
        links,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
