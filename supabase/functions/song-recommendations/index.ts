import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { searchHistory, favorites } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build a profile summary from user data
    const historySnippet = (searchHistory || []).slice(0, 20).map((h: any) =>
      `"${h.title}" by ${h.artist}${h.signedCount !== undefined ? ` (${h.signedCount}/${h.totalCount} signed)` : ""}`
    ).join("; ");

    const favSnippet = (favorites || []).map((f: any) =>
      `${f.name} (${f.role}${f.publisher ? `, publisher: ${f.publisher}` : ""}${f.pro ? `, PRO: ${f.pro}` : ""})`
    ).join("; ");

    const systemPrompt = `You are a music industry A&R recommendation engine. Your job is to suggest songs with UNSIGNED writers or producers that the user might want to discover for potential publishing deals.

Based on the user's search history and saved favorites, infer their preferences for:
- Genre/style patterns
- Regional preferences  
- Stream count ranges they typically look at
- Types of roles they save (writers vs producers vs artists)

Then suggest 5 songs that:
1. Have writers or producers who are likely UNSIGNED (independent, no major publisher affiliation)
2. Match the user's inferred genre/style preferences
3. Are real, verifiable songs that exist
4. Include a mix of emerging and moderately known tracks
5. Prioritize songs where the creative talent behind them may be discoverable

For each song, explain briefly WHY you're recommending it based on the user's pattern.`;

    const userPrompt = `Here is my search history (recent songs I've looked up):
${historySnippet || "No search history yet."}

Here are my saved favorites (artists/writers/producers I'm tracking):
${favSnippet || "No favorites saved yet."}

Based on these patterns, suggest 5 songs I should look into. Focus on tracks with potentially unsigned writers or producers that match my interests.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_songs",
              description: "Return 5 song recommendations with unsigned writers/producers",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Song title" },
                        artist: { type: "string", description: "Primary artist" },
                        reason: { type: "string", description: "Why this song is recommended (1-2 sentences)" },
                        unsigned_talent: { type: "string", description: "Name of the likely unsigned writer/producer on the track" },
                        talent_role: { type: "string", enum: ["writer", "producer", "artist"], description: "Role of the unsigned talent" },
                        genre: { type: "string", description: "Genre/style of the song" },
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
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ success: true, data: parsed.recommendations }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "No recommendations generated" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Recommendation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
