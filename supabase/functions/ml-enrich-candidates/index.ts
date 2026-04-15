import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Spotify auth ────────────────────────────────────────────────
let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    spotifyTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
    return data.access_token;
  } catch { return null; }
}

// ── Spotify audio features ──────────────────────────────────────
async function fetchAudioFeatures(trackId: string): Promise<{
  tempo?: number; energy?: number; danceability?: number;
  valence?: number; acousticness?: number; instrumentalness?: number;
  popularity?: number; genres?: string[];
} | null> {
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    // Fetch track details + audio features in parallel
    const [trackRes, featuresRes] = await Promise.all([
      fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    let popularity: number | undefined;
    let genres: string[] = [];

    if (trackRes.ok) {
      const track = await trackRes.json();
      popularity = track.popularity;
      // Get artist genres
      const artistId = track.artists?.[0]?.id;
      if (artistId) {
        try {
          const artistRes = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });
          if (artistRes.ok) {
            const artist = await artistRes.json();
            genres = artist.genres || [];
          } else { await artistRes.text(); }
        } catch { /* ignore */ }
      }
    } else { await trackRes.text(); }

    if (featuresRes.ok) {
      const f = await featuresRes.json();
      return {
        tempo: f.tempo, energy: f.energy, danceability: f.danceability,
        valence: f.valence, acousticness: f.acousticness, instrumentalness: f.instrumentalness,
        popularity, genres,
      };
    } else { await featuresRes.text(); }
    return popularity || genres.length ? { popularity, genres } : null;
  } catch { return null; }
}

// ── MusicBrainz region lookup ───────────────────────────────────
async function fetchArtistRegion(artist: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`artist:"${artist}"`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/artist/?query=${q}&limit=1&fmt=json`,
      {
        headers: { "User-Agent": "Publisting/1.0 (https://publisting.app)" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const a = data.artists?.[0];
    if (!a || a.score < 70) return null;
    return a.country || a.area?.name || null;
  } catch { return null; }
}

// ── Unsigned talent detection ───────────────────────────────────
async function findUnsignedTalent(
  title: string, artist: string, supabase: ReturnType<typeof getSupabase>
): Promise<Array<{ name: string; role: string; confidence: number }>> {
  const unsigned: Array<{ name: string; role: string; confidence: number }> = [];

  // Search people table for anyone associated with this song via pro_cache
  // and check their signing status
  const names = new Set<string>();
  names.add(artist.toLowerCase().trim());

  // Check pro_cache for all known names
  const { data: proCached } = await supabase
    .from("pro_cache")
    .select("name, data")
    .limit(100);

  // Check people table for known individuals
  const { data: people } = await supabase
    .from("people")
    .select("name, role, name_lower")
    .limit(500);

  // Cross-reference: find people without major publisher affiliations
  const majorPublishers = [
    "sony", "universal", "warner", "kobalt", "bmg", "concord",
    "sony/atv", "umpg", "warner chappell", "downtown", "pulse",
  ];

  if (proCached) {
    for (const entry of proCached) {
      const d = entry.data as any;
      const pub = (d?.publisher || "").toLowerCase();
      const isMajor = majorPublishers.some(m => pub.includes(m));
      if (!isMajor && d?.publisher) {
        // Has a publisher but it's indie
        unsigned.push({ name: entry.name, role: d.role || "writer", confidence: 0.7 });
      } else if (!d?.publisher) {
        // No publisher found = likely unsigned
        unsigned.push({ name: entry.name, role: d?.role || "writer", confidence: 0.85 });
      }
    }
  }

  return unsigned.slice(0, 10);
}

// ── Extract Spotify track ID from URL ───────────────────────────
function extractSpotifyId(url: string): string | null {
  const m = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, artist, spotifyUrl, appleUrl } = await req.json();
    if (!title || !artist) {
      return new Response(JSON.stringify({ error: "title and artist required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabase();
    const songKey = `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;

    // Check if already enriched recently (within 7 days)
    const { data: existing } = await supabase
      .from("ml_song_candidates")
      .select("*")
      .eq("song_key", songKey)
      .maybeSingle();

    if (existing?.enriched_at) {
      const age = Date.now() - new Date(existing.enriched_at).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) {
        return new Response(JSON.stringify({ success: true, data: existing, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Enrich in parallel: Spotify audio features + MusicBrainz region + unsigned talent
    const spotifyId = spotifyUrl ? extractSpotifyId(spotifyUrl) : null;
    const [audioFeatures, region, unsignedTalent] = await Promise.all([
      spotifyId ? fetchAudioFeatures(spotifyId) : Promise.resolve(null),
      fetchArtistRegion(artist),
      findUnsignedTalent(title, artist, supabase),
    ]);

    const candidateData = {
      song_key: songKey,
      title,
      artist,
      spotify_url: spotifyUrl || null,
      apple_url: appleUrl || null,
      genre: audioFeatures?.genres || [],
      region: region || null,
      popularity: audioFeatures?.popularity || null,
      tempo: audioFeatures?.tempo || null,
      energy: audioFeatures?.energy || null,
      danceability: audioFeatures?.danceability || null,
      valence: audioFeatures?.valence || null,
      acousticness: audioFeatures?.acousticness || null,
      instrumentalness: audioFeatures?.instrumentalness || null,
      unsigned_talent: unsignedTalent,
      unsigned_count: unsignedTalent.length,
      enriched_at: new Date().toISOString(),
    };

    // Upsert into ml_song_candidates
    const { data: upserted, error } = await supabase
      .from("ml_song_candidates")
      .upsert(candidateData, { onConflict: "song_key" })
      .select()
      .single();

    if (error) {
      console.error("Upsert error:", error);
      return new Response(JSON.stringify({ error: "Failed to store candidate" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Enriched: "${title}" by ${artist} — ${unsignedTalent.length} unsigned, genres: ${audioFeatures?.genres?.join(", ") || "none"}`);

    return new Response(JSON.stringify({ success: true, data: upserted, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Enrichment error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
