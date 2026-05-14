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
        headers: { "User-Agent": "Publisting/1.0 (https://publisting.app)" },
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
            headers: { "User-Agent": "Publisting/1.0 (https://publisting.app)" },
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
    const variants = Array.from(new Set([
      nameLower,
      canonicalizeName(name),
      reorderName(canonicalizeName(name)),
    ])).filter(Boolean);

    // 1) Exact match on any normalized variant
    let { data: rows } = await supabase
      .from("pro_cache")
      .select("name_lower, data, expires_at")
      .in("name_lower", variants)
      .gt("expires_at", new Date().toISOString())
      .limit(5);

    // 2) Fuzzy fallback: prefix scan + similarity check
    if (!rows || rows.length === 0) {
      const canon = canonicalizeName(name);
      const firstToken = canon.split(" ")[0] || canon;
      if (firstToken.length >= 3) {
        const { data: prefix } = await supabase
          .from("pro_cache")
          .select("name_lower, data, expires_at")
          .ilike("name_lower", `%${firstToken}%`)
          .gt("expires_at", new Date().toISOString())
          .limit(50);
        rows = (prefix || []).filter((r: any) => fuzzyNameMatch(name, r.name_lower));
      }
    }

    const hit = (rows || [])[0];
    if (hit?.data) {
      const d = hit.data as any;
      const majorPublishers = ["sony", "universal", "warner", "kobalt", "bmg", "concord", "chappell"];
      const pubLower = (d.publisher || "").toLowerCase();
      const isMajor = majorPublishers.some(m => pubLower.includes(m));
      return { found: true, publisher: d.publisher, pro: d.pro, isMajor };
    }

    return { found: false };
  } catch {
    return { found: false };
  }
}

// ── Name normalization & fuzzy matching ─────────────────────────
/**
 * Canonicalize a name for robust matching across diacritics, punctuation,
 * casing, ampersands, abbreviations, and whitespace.
 *  - Lowercases
 *  - Strips diacritics via NFKD decomposition
 *  - Normalises curly quotes/dashes
 *  - Removes punctuation, parentheticals, role suffixes, "the " prefix
 *  - Expands "&" → "and"
 *  - Collapses whitespace
 */
function canonicalizeName(input?: string): string {
  if (!input) return "";
  let s = String(input).normalize("NFKD");
  // Strip combining diacritics
  s = s.replace(/[\u0300-\u036f]/g, "");
  s = s.toLowerCase();
  // Normalise quotes/dashes
  s = s.replace(/[\u2018\u2019\u02bc'`´]/g, "")
       .replace(/[\u201c\u201d"]/g, "")
       .replace(/[\u2010-\u2015\u2212]/g, "-");
  // Strip parentheticals/brackets
  s = s.replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ");
  // Strip common role/featuring noise
  s = s.replace(/\b(feat\.?|ft\.?|featuring|with|presents|prod\.?\s*by|aka)\b.*$/g, " ");
  // Common honorifics / drop "the " prefix
  s = s.replace(/^the\s+/, "");
  // & → and
  s = s.replace(/\s*&\s*/g, " and ");
  // Replace any remaining punctuation with space
  s = s.replace(/[^a-z0-9 ]+/g, " ");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** "Lastname, Firstname" → "firstname lastname"; otherwise return as-is. */
function reorderName(canon: string): string {
  if (!canon) return canon;
  // Already canonicalized → no comma; but handle Latin "lastname firstname" patterns is not safe.
  // We do support input that originally had a comma by re-running on a comma-aware variant below.
  return canon;
}
function reorderRaw(input?: string): string {
  if (!input) return "";
  const m = String(input).split(",");
  if (m.length === 2) {
    return canonicalizeName(`${m[1].trim()} ${m[0].trim()}`);
  }
  return canonicalizeName(input);
}

/** Token-set similarity (Jaccard on word tokens after canonicalization). */
function tokenSetSimilarity(a: string, b: string): number {
  const ta = new Set(canonicalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(canonicalizeName(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Damerau–Levenshtein distance (used for short single-token names). */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

/**
 * Returns true if two names should be treated as the same person under
 * permissive matching: same canonical form, reordered ("Last, First")
 * match, high token-set Jaccard, or near edit-distance for short names.
 */
function fuzzyNameMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const ca = canonicalizeName(a);
  const cb = canonicalizeName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (reorderRaw(a) === cb || ca === reorderRaw(b)) return true;

  const sim = tokenSetSimilarity(ca, cb);
  if (sim >= 0.8) return true;

  // For multi-token names, all tokens of the shorter must appear in the longer
  const ta = ca.split(" ").filter(Boolean);
  const tb = cb.split(" ").filter(Boolean);
  if (ta.length >= 2 && tb.length >= 2) {
    const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    if (shorter.every(tok => longer.includes(tok))) return true;
  }

  // Single-token / short-name edit-distance fallback
  const minLen = Math.min(ca.length, cb.length);
  if (minLen >= 4) {
    const dist = editDistance(ca, cb);
    if (dist <= Math.max(1, Math.floor(minLen * 0.15))) return true;
  }
  return false;
}

// ── Known-signed blocklist ──────────────────────────────────────
// Curated list of artists/writers/producers known to be signed to a
// major label or major publisher. Recommendations whose `artist` or
// `unsigned_talent` match any of these are dropped before returning.
// Stored raw — matched via fuzzy/canonicalized comparison so diacritics,
// punctuation, ordering, and abbreviations cannot bypass the block.
const KNOWN_SIGNED_NAMES: ReadonlyArray<string> = [
  // Reported by users as miscategorised
  "leon bridges", "sofia reyes", "kenny beats",
  // Common majors / well-known signed talent we should never suggest as unsigned
  "drake", "taylor swift", "beyonce", "beyoncé", "rihanna", "adele", "ed sheeran",
  "billie eilish", "finneas", "finneas o'connell", "post malone", "the weeknd",
  "dua lipa", "harry styles", "olivia rodrigo", "doja cat", "sza", "bruno mars",
  "kendrick lamar", "j cole", "j. cole", "travis scott", "future", "21 savage",
  "lil baby", "lil durk", "lil wayne", "nicki minaj", "cardi b", "megan thee stallion",
  "tyler the creator", "tyler, the creator", "frank ocean", "anderson .paak",
  "bad bunny", "karol g", "rosalia", "rosalía", "peso pluma", "feid",
  "max martin", "shellback", "savan kotecha", "ali payami", "oscar holter",
  "metro boomin", "mike will made it", "murda beatz", "boi-1da", "wheezy",
  "tay keith", "southside", "pierre bourne", "hit-boy", "no i.d.", "no id",
  "jack antonoff", "aaron dessner", "greg kurstin", "ryan tedder", "louis bell",
  "andrew watt", "benny blanco", "diplo", "skrillex", "calvin harris", "david guetta",
  "khalid", "h.e.r.", "her", "lizzo", "sam smith", "shawn mendes", "justin bieber",
  "ariana grande", "selena gomez", "miley cyrus", "katy perry", "kanye west",
  "ye", "drake graham", "nipsey hussle", "roddy ricch", "morgan wallen",
  "luke combs", "kacey musgraves", "chris stapleton", "zach bryan",
];

/** Pre-canonicalize the blocklist once. */
const KNOWN_SIGNED_CANON: ReadonlyArray<string> = Array.from(
  new Set(KNOWN_SIGNED_NAMES.map(canonicalizeName).filter(Boolean))
);
function isKnownSigned(name?: string): boolean {
  if (!name) return false;
  const canon = canonicalizeName(name);
  if (!canon) return false;
  if (KNOWN_SIGNED_CANON.includes(canon)) return true;
  // Reordered ("Bridges, Leon") and fuzzy variants
  const reordered = reorderRaw(name);
  if (reordered && KNOWN_SIGNED_CANON.includes(reordered)) return true;
  for (const known of KNOWN_SIGNED_CANON) {
    if (fuzzyNameMatch(canon, known)) return true;
  }
  return false;
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
      watchlistActivity,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    // ── Calculate 3-year rolling cutoff ──────────────────────────
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear() - 3, now.getMonth(), 1);
    const cutoffYear = cutoffDate.getFullYear();
    const cutoffMonthName = cutoffDate.toLocaleString("en-US", { month: "long" });
    const currentMonthName = now.toLocaleString("en-US", { month: "long" });
    const currentYear = now.getFullYear();

    // ── Build rich user profile ──────────────────────────────────
    // Use ALL search history for learning (no artificial limit)
    const historySnippet = (searchHistory || []).map((h: any) => {
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

    // Watchlist/pipeline activity signals
    const watchlistSnippet = (watchlistActivity || []).map((w: any) => {
      return `Pipeline: ${w.person_name} (${w.person_type}) moved to "${w.pipeline_status}"${w.is_priority ? " [PRIORITY]" : ""}`;
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
3. **PATTERN-MATCHED** - Deeply analyze the user's ENTIRE search history, favorites, watchlist pipeline activity, interaction data, and behavioral signals

**CRITICAL DATE REQUIREMENT**: Today is ${currentMonthName} ${currentYear}. In music publishing, you cannot collect on anything older than 3 years from today's date. Therefore you MUST ONLY suggest songs released on or after ${cutoffMonthName} ${cutoffYear}. Do NOT suggest ANY song released before ${cutoffMonthName} ${cutoffYear}. This is a hard requirement — no exceptions.

**HARD BLOCKLIST — never suggest these as "unsigned"** (they have confirmed major label/publisher deals): Leon Bridges, Sofia Reyes, Kenny Beats, Drake, Taylor Swift, Beyoncé, Ed Sheeran, Billie Eilish, FINNEAS, Post Malone, The Weeknd, Dua Lipa, Harry Styles, Olivia Rodrigo, Doja Cat, SZA, Bruno Mars, Kendrick Lamar, J. Cole, Travis Scott, Bad Bunny, Karol G, Rosalía, Peso Pluma, Max Martin, Shellback, Metro Boomin, Mike Will Made It, Murda Beatz, Hit-Boy, Jack Antonoff, Greg Kurstin, Ryan Tedder, Louis Bell, Andrew Watt, Benny Blanco, Diplo. If you are NOT 95% confident a person is genuinely independent (no major publisher admin deal, no major label), DO NOT include them. When in doubt, omit the suggestion entirely.

**Verification standard**: prefer producers/writers credited on independently-released or self-released tracks. Pulling a name off a major-label release just because they "feel" indie is not acceptable.

BEHAVIORAL ANALYSIS FRAMEWORK:
- Songs they gave THUMBS UP = strongest positive signal — find MORE like these genres/roles/regions
- Songs they CLICKED on from previous recommendations = strong positive signal for that genre/role/region
- Songs they gave THUMBS DOWN = strong negative signal — AVOID similar genres/roles/styles
- Songs they IGNORED/DISMISSED = moderate negative signal, deprioritize similar patterns
- Artists they SAVED to favorites = high-interest signal for that person's genre/role/region
- Artists they moved in the WATCHLIST PIPELINE = strongest intent signal — prioritize similar profiles
- Streaming range they typically search = target similar popularity levels
- Publisher signing patterns = understand what "unsigned" means to them
- PRO affiliations = regional/market focus indicators
- Favorite roles = whether they're scouting writers, producers, or artists

RECOMMENDATION QUALITY RULES:
- Never suggest songs by mainstream artists signed to major labels
- ONLY suggest songs released ${cutoffMonthName} ${cutoffYear} or later (within the last 3 years)
- Mix different sub-genres within the user's taste profile
- Include specific, lesser-known tracks, not obvious hits
- The unsigned talent name must be a real person who worked on the track
- Explain the connection to the user's specific search patterns

${streamingNote}
${signingNote}
${proNote}
${roleBreakdown}`;

    const userPrompt = `## My Search History (all songs I've researched — learn from every one):
${historySnippet || "No search history yet."}

## My Saved Favorites (people I'm tracking):
${favSnippet || "No favorites saved yet."}

## My Watchlist Pipeline Activity (artists I'm actively pursuing):
${watchlistSnippet || "No pipeline activity yet."}

## My Recommendation Feedback (MOST IMPORTANT — these are explicit preferences):
${likedSnippet || "No thumbs up yet."}
${clickedSnippet || "No previous clicks."}
${dismissedSnippet || "No thumbs down or dismissals."}

REMEMBER: Only suggest songs released on or after ${cutoffMonthName} ${cutoffYear}. Today is ${currentMonthName} ${currentYear}.

Based on ALL of these signals, suggest 5 songs I should investigate. Each must have a verifiable unsigned writer or producer.`;

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
    let rawRecs = parsed.recommendations || [];

    // ── Drop hard-blocklisted names (artist or talent) ───────────
    const beforeBlock = rawRecs.length;
    rawRecs = rawRecs.filter((rec: any) => {
      if (isKnownSigned(rec.artist)) return false;
      if (isKnownSigned(rec.unsigned_talent)) return false;
      return true;
    });
    if (beforeBlock !== rawRecs.length) {
      console.log(`Blocked ${beforeBlock - rawRecs.length} known-signed recs`);
    }

    // ── Post-process: enforce 3-year rolling date cutoff ─────────
    // Filter out any songs the AI suggested that are too old
    rawRecs = rawRecs.filter((rec: any) => {
      if (!rec.release_year) return true; // If no year provided, keep it (will be verified later)
      const year = parseInt(rec.release_year, 10);
      if (isNaN(year)) return true;
      return year >= cutoffYear;
    });
    console.log(`After date filter (>= ${cutoffYear}): ${rawRecs.length} recommendations remain`);

    // ── Parallel verification: MusicBrainz + PRO cache ──────────
    const verified = await Promise.all(
      rawRecs.map(async (rec: any) => {
        const [mbResult, proResult, artistProResult] = await Promise.all([
          verifyInMusicBrainz(rec.title, rec.artist),
          SUPABASE_URL && SUPABASE_ANON_KEY
            ? checkProStatus(rec.unsigned_talent, SUPABASE_URL, SUPABASE_ANON_KEY)
            : Promise.resolve({ found: false }),
          SUPABASE_URL && SUPABASE_ANON_KEY
            ? checkProStatus(rec.artist, SUPABASE_URL, SUPABASE_ANON_KEY)
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
            artist_is_major: artistProResult.found ? !!artistProResult.isMajor : undefined,
          },
        };
      })
    );

    // Drop anything where the artist is confirmed to be on a major.
    const beforeMajor = verified.length;
    const filteredVerified = verified.filter((rec: any) =>
      rec.verification?.artist_is_major !== true && rec.verification?.confirmed_unsigned !== false
    );
    if (filteredVerified.length !== beforeMajor) {
      console.log(`Dropped ${beforeMajor - filteredVerified.length} confirmed-major recs`);
    }

    // Sort: verified songs first, confirmed unsigned first
    filteredVerified.sort((a: any, b: any) => {
      const aScore = (a.verification.musicbrainz_verified ? 2 : 0) +
                     (a.verification.confirmed_unsigned ? 1 : 0);
      const bScore = (b.verification.musicbrainz_verified ? 2 : 0) +
                     (b.verification.confirmed_unsigned ? 1 : 0);
      return bScore - aScore;
    });

    return new Response(JSON.stringify({ success: true, data: filteredVerified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Recommendation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
