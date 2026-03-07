const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface RadioStation {
  station: string;
  market?: string;
  format?: string;
  spins?: number;
  source?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songTitle, artist } = await req.json();

    if (!songTitle || !artist) {
      return new Response(
        JSON.stringify({ success: false, error: 'Song title and artist are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Search service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Radio airplay lookup for:', songTitle, 'by', artist);

    const stations: RadioStation[] = [];

    // Search multiple sources in parallel for radio airplay data
    const queries = [
      `"${songTitle}" "${artist}" radio airplay stations spins site:mediabase.com OR site:billboard.com/charts/radio`,
      `"${songTitle}" "${artist}" radio "most added" OR "most played" OR "spins" OR "airplay"`,
      `"${songTitle}" "${artist}" radio chart station playlist 2024 OR 2025 OR 2026`,
    ];

    const searchPromises = queries.map(query =>
      fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 5,
          scrapeOptions: { formats: ['markdown'] },
        }),
      }).then(r => r.ok ? r.json() : null).catch(() => null)
    );

    const results = await Promise.all(searchPromises);

    const allContent = results
      .filter(Boolean)
      .flatMap((r: any) => r?.data || [])
      .map((r: any) => r?.markdown || r?.description || '')
      .join('\n\n');

    console.log('Radio content length:', allContent.length);

    const titleLower = songTitle.toLowerCase();
    const artistLower = artist.toLowerCase();

    if (allContent.toLowerCase().includes(titleLower) || allContent.toLowerCase().includes(artistLower)) {
      // Extract radio station mentions
      // Pattern: station call signs like KIIS, WHTZ, Z100, etc.
      const stationPatterns = [
        // "WXYZ-FM" or "WXYZ" followed by market info
        /\b([KW][A-Z]{2,4}(?:-[FA]M)?)\b[^]*?(?:(\d+)\s*spins?)?/gi,
        // "Z100" style
        /\b([A-Z]\d{2,3}(?:\.\d)?)\b/gi,
        // "Hot 97" style
        /\b(Hot\s+\d{2,3}|Power\s+\d{2,3}|Kiss\s+\d{2,3}|Mix\s+\d{2,3}|WILD\s+\d{2,3})\b/gi,
      ];

      const seenStations = new Set<string>();

      // Extract formatted station entries from tables/lists
      const lines = allContent.split('\n');
      for (const line of lines) {
        // Try to match tabular data: "KIIS-FM | Los Angeles | CHR | 45 spins"
        const tableMatch = line.match(/\b([KW][A-Z]{2,4}(?:-[FA]M)?)\b.*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z]{2})?)/);
        if (tableMatch) {
          const callSign = tableMatch[1].toUpperCase();
          if (!seenStations.has(callSign)) {
            seenStations.add(callSign);
            const spinsMatch = line.match(/(\d+)\s*spins?/i);
            const formatMatch = line.match(/\b(CHR|Pop|Urban|R&B|Country|Rock|Alternative|Adult\s+Contemporary|AC|Hot\s+AC|Rhythmic|Hip[\s-]?Hop)\b/i);
            stations.push({
              station: callSign,
              market: tableMatch[2] || undefined,
              format: formatMatch ? formatMatch[1] : undefined,
              spins: spinsMatch ? parseInt(spinsMatch[1]) : undefined,
              source: 'Mediabase / Billboard',
            });
          }
        }
      }

      // If no structured data found, extract any station call signs mentioned
      if (stations.length === 0) {
        const callSignRegex = /\b([KW][A-Z]{2,4}(?:-[FA]M)?)\b/g;
        let match;
        while ((match = callSignRegex.exec(allContent)) !== null) {
          const callSign = match[1].toUpperCase();
          if (!seenStations.has(callSign) && callSign.length >= 3) {
            seenStations.add(callSign);
            stations.push({
              station: callSign,
              source: 'Web Search',
            });
          }
          if (stations.length >= 20) break;
        }
      }

      // Also look for named stations (Z100, Hot 97, etc.)
      const namedStationRegex = /\b(Z\d{2,3}|Hot\s+\d{2,3}|Power\s+\d{2,3}|Kiss\s+\d{2,3}|Mix\s+\d{2,3})\b/gi;
      let namedMatch;
      while ((namedMatch = namedStationRegex.exec(allContent)) !== null) {
        const name = namedMatch[1];
        if (!seenStations.has(name.toUpperCase())) {
          seenStations.add(name.toUpperCase());
          stations.push({
            station: name,
            source: 'Web Search',
          });
        }
        if (stations.length >= 25) break;
      }
    }

    // Sort by spins descending, then alphabetically
    stations.sort((a, b) => {
      if (a.spins && b.spins) return b.spins - a.spins;
      if (a.spins) return -1;
      if (b.spins) return 1;
      return a.station.localeCompare(b.station);
    });

    console.log('Found radio stations:', stations.length);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          songTitle,
          artist,
          stations: stations.slice(0, 25),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Radio airplay lookup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to lookup radio data' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
