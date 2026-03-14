import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── MusicBrainz verification ────────────────────────────────────
async function verifyInMusicBrainz(title: string, artist: string): Promise<{
  verified: boolean;
  mbid?: string;
  creditCount?: number;
  country?: string;
}> {
  try {
    const q = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/recording/?query=${q}&limit=3&fmt=json`,
      {
        headers: { "User-Agent": "PubCheck/1.0 (https://pubcheck.app)" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) { await res.text(); return { verified: false }; }
    const data = await res.json();
    const rec = data.recordings?.[0];
    if (!rec || rec.score < 70) return { verified: false };

    // Get artist credit count from MusicBrainz
    const artistMbid = rec["artist-credit"]?.[0]?.artist?.id;
    let creditCount: number | undefined;
    let country: string | undefined;

    if (artistMbid) {
      try {
        const artistRes = await fetch(
          `https://musicbrainz.org/ws/2/artist/${artistMbid}?inc=recording-rels&fmt=json`,
          {
            headers: { "User-Agent": "PubCheck/1.0 (https://pubcheck.app)" },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (artistRes.ok) {
          const artistData = await artistRes.json();
          country = artistData.country || artistData.area?.name;
        }
      } catch { /* ignore */ }
    }

    return { verified: true, mbid: rec.id, creditCount, country };
  } catch {
    return { verified: false };
  }
}

// ── PRO/MLC quick check ─────────────────────────────────────────
async function checkProStatus(name: string, supabaseUrl: string, supabaseKey: string): Promise<{
  found: boolean;
  publisher?: string;
  pro?: string;
  isMajor?: boolean;
}> {
  try {
    // Check PRO cache first
    const supabase = createClient(supabaseUrl, supabaseKey);
    const nameLower = name.toLowerCase().trim();
    const { data: cached } = await supabase
      .from("pro_cache")
      .select("data")
      .eq("name_lower", nameLower)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached?.data) {
      const d = cached.data as any;
      const majorPublishers = ["sony", "universal", "warner", "kobalt", "bmg", "concord"];
      const pubLower = (d.publisher || "").toLowerCase();
      const isMajor = majorPublishers.some(m => pubLower.includes(m));
      return {
        found: true,
        publisher: d.publisher,
        pro: d.pro,
        isMajor,
      };
    }

    return { found: false };
  } catch {
    return { found: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      searchHistory,
      favorites,
      interactionHistory,
      streamingProfile,
      signingProfile,
      proProfile,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    // ── Build rich user profile ──────────────────────────────────
    const historySnippet = (searchHistory || []).slice(0, 25).map((h: any) => {
      const parts = [`"${h.title}" by ${h.artist}`];
      if (h.signedCount !== undefined) parts.push(`(${h.signedCount}/${h.totalCount} signed)`);
      if (h.genre) parts.push(`[${h.genre}]`);
      if (h.region) parts.push(`{${h.region}}`);
      if (h.streams) parts.push(`~${h.streams} streams`);
      if (h.label) parts.push(`label: ${h.label}`);
      if (h.publishingMix) parts.push(`pub: ${h.publishingMix}`);
      return parts.join(" ");
    }).join("\n");

    const favSnippet = (favorites || []).map((f: any) => {
      const parts = [`${f.name} (${f.role})`];
      if (f.publisher) parts.push(`publisher: ${f.publisher}`);
      if (f.pro) parts.push(`PRO: ${f.pro}`);
      if (f.ipi) parts.push(`IPI: ${f.ipi}`);
      return parts.join(", ");
    }).join("\n");

    // Interaction learning signals
    const likedSnippet = (interactionHistory?.liked || []).slice(0, 10)
      .map((l: any) => `👍 LOVED: "${l.title}" by ${l.artist} (${l.genre}, ${l.talent_role}) — FIND MORE LIKE THIS`)
      .join("\n");
    const clickedSnippet = (interactionHistory?.clicked || []).slice(0, 10)
      .map((c: any) => `✓ Clicked: "${c.title}" by ${c.artist} (${c.genre}, ${c.talent_role})`)
      .join("\n");
    const dismissedSnippet = (interactionHistory?.dismissed || []).slice(0, 10)
      .map((d: any) => `✗ Disliked/Ignored: "${d.title}" by ${d.artist} (${d.genre}, ${d.talent_role}) — AVOID SIMILAR`)
      .join("\n");

    // Streaming & signing profile summaries
    const streamingNote = streamingProfile
      ? `Streaming preferences: avg streams ~${streamingProfile.avgStreams}, range ${streamingProfile.minStreams}-${streamingProfile.maxStreams}. Most searched popularity tier: ${streamingProfile.popularityTier}.`
      : "";

    const signingNote = signingProfile
      ? `Signing focus: ${signingProfile.unsignedPercent}% of searched credits are unsigned. User seems to target ${signingProfile.focus} talent. Publishing mix preference: ${signingProfile.publishingMixPreference}.`
      : "";

    const proNote = proProfile
      ? `PRO affiliations in searches: ${proProfile.topPros?.join(", ") || "various"}. Regions: ${proProfile.topRegions?.join(", ") || "various"}.`
      : "";

    // Role preference analysis
    const roleBreakdown = favorites?.length > 0
      ? (() => {
          const roles = { writer: 0, producer: 0, artist: 0 };
          favorites.forEach((f: any) => { if (roles[f.role as keyof typeof roles] !== undefined) roles[f.role as keyof typeof roles]++; });
          return `Saved favorites breakdown: ${roles.writer} writers, ${roles.producer} producers, ${roles.artist} artists.`;
        })()
      : "";

    const systemPrompt = `You are an elite A&R recommendation engine for a music publishing intelligence platform. Your recommendations MUST be:

1. **REAL SONGS** - Only suggest songs that definitively exist and are verifiable on streaming platforms
2. **UNSIGNED TALENT** - Each song must feature a writer or producer who is genuinely independent/unsigned (not affiliated with Sony/ATV, Universal, Warner Chappell, BMG, Kobalt, or Concord)
3. **PATTERN-MATCHED** - Deeply analyze the user's search history, favorites, interaction data, and behavioral signals

BEHAVIORAL ANALYSIS FRAMEWORK:
- Songs they gave THUMBS UP = strongest positive signal — find MORE like these genres/roles/regions
- Songs they CLICKED on from previous recommendations = strong positive signal for that genre/role/region
- Songs they gave THUMBS DOWN = strong negative signal — AVOID similar genres/roles/styles
- Songs they IGNORED/DISMISSED = moderate negative signal, deprioritize similar patterns
- Streaming range they typically search = target similar popularity levels
- Publisher signing patterns = understand what "unsigned" means to them
- PRO affiliations = regional/market focus indicators
- Favorite roles = whether they're scouting writers, producers, or artists

RECOMMENDATION QUALITY RULES:
- Never suggest songs by mainstream artists signed to major labels
- Prioritize songs from 2020-present for relevance
- Mix different sub-genres within the user's taste profile
- Include specific, lesser-known tracks, not obvious hits
- The unsigned talent name must be a real person who worked on the track
- Explain the connection to the user's specific search patterns

${streamingNote}
${signingNote}
${proNote}
${roleBreakdown}`;

    const userPrompt = `## My Recent Search History (songs I've researched):
${historySnippet || "No search history yet."}

## My Saved Favorites (people I'm tracking):
${favSnippet || "No favorites saved yet."}

## My Recommendation Feedback (MOST IMPORTANT — these are explicit preferences):
${likedSnippet || "No thumbs up yet."}
${clickedSnippet || "No previous clicks."}
${dismissedSnippet || "No thumbs down or dismissals."}

Based on ALL of these signals, suggest 5 songs I should investigate. Each must have a verifiable unsigned writer or producer. Prioritize accuracy over creativity.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_songs",
              description: "Return 5 verified song recommendations with unsigned writers/producers",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Exact song title" },
                        artist: { type: "string", description: "Primary artist name" },
                        reason: { type: "string", description: "Why recommended based on user's specific patterns (2-3 sentences)" },
                        unsigned_talent: { type: "string", description: "Full name of the unsigned writer/producer" },
                        talent_role: { type: "string", enum: ["writer", "producer", "artist"] },
                        genre: { type: "string", description: "Specific genre/sub-genre" },
                        estimated_streams: { type: "string", description: "Approximate stream count (e.g. '2.5M', '500K')" },
                        release_year: { type: "string", description: "Year of release" },
                        region: { type: "string", description: "Country/region of the unsigned talent" },
                      },
                      required: ["title", "artist", "reason", "unsigned_talent", "talent_role", "genre"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_songs" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ success: false, error: "No recommendations generated" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const rawRecs = parsed.recommendations || [];

    // ── Parallel verification: MusicBrainz + PRO cache ──────────
    const verified = await Promise.all(
      rawRecs.map(async (rec: any) => {
        const [mbResult, proResult] = await Promise.all([
          verifyInMusicBrainz(rec.title, rec.artist),
          SUPABASE_URL && SUPABASE_ANON_KEY
            ? checkProStatus(rec.unsigned_talent, SUPABASE_URL, SUPABASE_ANON_KEY)
            : Promise.resolve({ found: false }),
        ]);

        return {
          ...rec,
          verification: {
            musicbrainz_verified: mbResult.verified,
            mbid: mbResult.mbid,
            mb_country: mbResult.country,
            pro_checked: proResult.found,
            pro_publisher: proResult.publisher,
            pro_affiliation: proResult.pro,
            confirmed_unsigned: proResult.found ? !proResult.isMajor : undefined,
          },
        };
      })
    );

    // Sort: verified songs first, confirmed unsigned first
    verified.sort((a: any, b: any) => {
      const aScore = (a.verification.musicbrainz_verified ? 2 : 0) +
                     (a.verification.confirmed_unsigned ? 1 : 0);
      const bScore = (b.verification.musicbrainz_verified ? 2 : 0) +
                     (b.verification.confirmed_unsigned ? 1 : 0);
      return bScore - aScore;
    });

    return new Response(JSON.stringify({ success: true, data: verified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Recommendation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
