/**
 * Edge Function Integration Tests: radio-airplay-lookup
 * Tests radio data retrieval for fail-closed behavior.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

async function invokeRadioLookup(songTitle: string, artist: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/radio-airplay-lookup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ songTitle, artist }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

// 3.2.g – Niche track with no airplay returns empty stations
Deno.test("3.2.g – Niche track returns no radio data", async () => {
  const { body } = await invokeRadioLookup("xyzzy12345nosuchsong", "FakeArtist99");
  assertEquals(body.success, true, "Radio lookup should succeed");
  if (body.data?.stations) {
    assertEquals(body.data.stations.length, 0, "Niche track should have no radio stations");
  }
});

// 3.2.a – Radio data for a known hit should have station structure
Deno.test("3.2.a – Known hit radio data has valid station structure", async () => {
  const { body } = await invokeRadioLookup("Espresso", "Sabrina Carpenter");
  assertEquals(body.success, true, "Radio lookup should succeed");
  if (body.data?.stations?.length > 0) {
    const station = body.data.stations[0];
    // Validate structure
    assertEquals(typeof station.station, "string", "Station should have call letters");
    assertEquals(station.station.length > 0, true, "Station call letters should not be empty");
    if (station.spins !== undefined) {
      assertEquals(typeof station.spins, "number", "Spins should be a number");
    }
  }
});
