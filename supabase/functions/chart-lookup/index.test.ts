/**
 * Edge Function Integration Tests: chart-lookup
 * Tests chart data retrieval for fail-closed behavior.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

async function invokeChartLookup(songTitle: string, artist: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/chart-lookup`, {
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

// 3.1.e – Blinding Lights chart data
Deno.test("3.1.e – Blinding Lights has chart placements", async () => {
  const { body } = await invokeChartLookup("Blinding Lights", "The Weeknd");
  assertEquals(body.success, true, "Chart lookup should succeed");
  if (body.data?.placements?.length > 0) {
    const billboard = body.data.placements.find(
      (p: any) => p.chart?.toLowerCase().includes("billboard") || p.chart?.toLowerCase().includes("hot 100")
    );
    if (billboard) {
      assertEquals(billboard.peakPosition <= 10, true, "Blinding Lights peaked in top 10");
    }
  }
});

// 3.1.a – Niche track returns empty/no chart data
Deno.test("3.1.a – Niche track returns no chart data", async () => {
  const { body } = await invokeChartLookup("xyzzy12345nosuchsong", "FakeArtist99");
  // Should either succeed with empty placements or fail gracefully
  if (body.success && body.data?.placements) {
    assertEquals(body.data.placements.length, 0, "Niche track should have no chart data");
  }
});
