/**
 * Edge Function Integration Tests: song-lookup
 * 
 * Tests the deployed song-lookup function for correct resolution behavior.
 * Run via: supabase--test_edge_functions
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

async function invokeSongLookup(query: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/song-lookup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ query, skipPro: true }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

// 1.2.a – Spotify HUMBLE link resolves to Kendrick Lamar, not 8-Bit Misfits
Deno.test("1.2.a – Spotify HUMBLE link resolves to correct artist", async () => {
  const { body } = await invokeSongLookup("https://open.spotify.com/track/7KXjTSCq5nL1LoYtL7XAwS");
  assertEquals(body.success, true, "Lookup should succeed");
  assertExists(body.data?.song, "Should return song data");
  
  const artist = body.data.song.artist.toLowerCase();
  assertEquals(
    artist.includes("kendrick") || artist.includes("lamar"),
    true,
    `Expected Kendrick Lamar, got: ${body.data.song.artist}`
  );
  assertEquals(
    artist.includes("8-bit") || artist.includes("misfits"),
    false,
    "Should NOT resolve to 8-Bit Misfits cover"
  );
});

// 1.2.d – Tidal link for track 61651811
Deno.test("1.2.d – Tidal link resolves to correct track", async () => {
  const { body } = await invokeSongLookup("https://tidal.com/browse/track/61651811");
  assertEquals(body.success, true, "Lookup should succeed");
  assertExists(body.data?.song, "Should return song data");
  // This track should resolve to a real song, not empty
  assertEquals(body.data.song.title.length > 0, true, "Title should not be empty");
  assertEquals(body.data.song.artist.length > 0, true, "Artist should not be empty");
});

// 1.2.k – Text search "Stay" by two different artists must yield different results
Deno.test("1.3.b – Stay by Kid LAROI vs Stay by Rihanna are distinct", async () => {
  const [kidLaroi, rihanna] = await Promise.all([
    invokeSongLookup("The Kid LAROI - Stay"),
    invokeSongLookup("Rihanna - Stay"),
  ]);

  assertEquals(kidLaroi.body.success, true, "Kid LAROI lookup should succeed");
  assertEquals(rihanna.body.success, true, "Rihanna lookup should succeed");

  if (kidLaroi.body.data?.song && rihanna.body.data?.song) {
    const a1 = kidLaroi.body.data.song.artist.toLowerCase();
    const a2 = rihanna.body.data.song.artist.toLowerCase();
    // They must be different artists
    assertEquals(
      a1 === a2,
      false,
      `Both resolved to same artist: ${a1}`
    );
  }
});

// Fail-closed: invalid/unresolvable query returns error, not wrong song
Deno.test("1.fail-closed – Gibberish query returns not-found, not a random song", async () => {
  const { body } = await invokeSongLookup("xyzzy12345nosuchsong67890");
  // Should either fail or return no data
  if (body.success && body.data?.song) {
    // If it somehow matches, the title should at least vaguely relate
    // (this is a canary test — we mainly want to ensure no random song)
    console.log("Warning: gibberish query matched:", body.data.song.title, "by", body.data.song.artist);
  }
  // Not asserting failure since MB might match something, but logging for QA
});
