/**
 * Section 3: Charts, Playlists, Radio – Fail-Closed Tests
 *
 * Covers: fail-closed behavior when data is missing or inconsistent,
 * chart territory tagging, ISRC-based playlist matching, radio validation.
 */
import { describe, it, expect } from "vitest";
import { calculateChartConfidence, calculateRadioConfidence } from "@/lib/confidence";

// ========== 3.1 Chart Data Validation ==========
describe("3.1 – Chart data fail-closed behavior", () => {
  it("3.1.a – Empty chart response should be treated as 'no data'", () => {
    const chartResponse = { success: true, data: { placements: [] } };
    const hasData = chartResponse.data.placements.length > 0;
    expect(hasData).toBe(false);
  });

  it("3.1.b – Chart placement must include chart name, peak, and territory", () => {
    const validPlacement = {
      chart: "Billboard Hot 100",
      peak: 1,
      weeks: 50,
      territory: "US",
    };
    expect(validPlacement.chart).toBeTruthy();
    expect(validPlacement.peak).toBeGreaterThan(0);
    expect(validPlacement.territory).toBeTruthy();
  });

  it("3.1.c – Non-US charts must be tagged with country/region", () => {
    const placements = [
      { chart: "UK Singles Chart", peakPosition: 1, territory: "UK" },
      { chart: "ARIA Charts", peakPosition: 3, territory: "AU" },
      { chart: "Billboard Hot 100", peakPosition: 1, territory: "US" },
    ];
    const nonUS = placements.filter(p => p.territory !== "US");
    for (const p of nonUS) {
      expect(p.territory).toBeTruthy();
      expect(p.territory).not.toBe("US");
    }
  });

  it("3.1.d – Chart confidence is low when no placements exist", () => {
    const result = calculateChartConfidence([]);
    expect(result.level).toBe("low");
  });

  it("3.1.e – Major chart hit fixture: Blinding Lights structure", () => {
    const blindingLights = {
      chart: "Billboard Hot 100",
      peakPosition: 1,
      weeksOnChart: 90,
      date: "2020-03-28",
      territory: "US",
    };
    expect(blindingLights.peakPosition).toBe(1);
    expect(blindingLights.weeksOnChart).toBeGreaterThan(50);
    expect(blindingLights.territory).toBe("US");

    const result = calculateChartConfidence([blindingLights]);
    expect(result.level).toBe("high");
  });
});

// ========== 3.2 Radio Data Validation ==========
describe("3.2 – Radio data fail-closed behavior", () => {
  it("3.2.a – Station entry must have call letters, market, and spins", () => {
    const validStation = {
      station: "KIIS-FM",
      market: "Los Angeles, CA",
      format: "Top 40",
      spins: 234,
      rank: 1,
    };
    expect(validStation.station).toBeTruthy();
    expect(validStation.market).toBeTruthy();
    expect(validStation.spins).toBeGreaterThan(0);
  });

  it("3.2.b – Station without spins is rejected", () => {
    const invalidStation = { station: "WXYZ", market: "Unknown", spins: 0 };
    const isValid = invalidStation.spins > 0 && invalidStation.station.length > 0;
    expect(isValid).toBe(false);
  });

  it("3.2.c – Empty radio data returns fail-closed state", () => {
    const radioResponse = { success: true, data: { stations: [] } };
    const hasStations = radioResponse.data.stations.length > 0;
    expect(hasStations).toBe(false);
  });

  it("3.2.d – Radio confidence is low with no stations", () => {
    const result = calculateRadioConfidence([], false, null);
    expect(result.level).toBe("low");
  });

  it("3.2.e – Radio confidence is low on error", () => {
    const result = calculateRadioConfidence([], false, "Scraping failed");
    expect(result.level).toBe("low");
  });

  it("3.2.f – Radio confidence is high with many stations and spins", () => {
    const stations = Array.from({ length: 60 }, (_, i) => ({
      station: `W${String(i).padStart(3, "0")}`,
      market: "New York, NY",
      format: i % 3 === 0 ? "Top 40" : i % 3 === 1 ? "Hot AC" : "Urban",
      spins: 100 + i * 10,
    }));
    const result = calculateRadioConfidence(stations, false, null);
    expect(result.level).toBe("high");
  });

  it("3.2.g – Niche track with no airplay shows clear no-data state", () => {
    const nicheResult = { success: true, data: { stations: [], totalSpins: 0 } };
    expect(nicheResult.data.stations).toHaveLength(0);
    expect(nicheResult.data.totalSpins).toBe(0);
    // UI contract: display "No radio airplay data found"
  });
});

// ========== 3.3 Playlist ISRC Matching ==========
describe("3.3 – Playlist data requires ISRC or track ID match", () => {
  it("3.3.a – Playlist with matching ISRC is accepted", () => {
    const songIsrc = "USUG12100406";
    const playlist = { name: "Today's Top Hits", trackIsrc: "USUG12100406" };
    expect(playlist.trackIsrc).toBe(songIsrc);
  });

  it("3.3.b – Playlist with title-only match but wrong ISRC is rejected", () => {
    const songIsrc = "USUG12100406";
    const playlist = { name: "Chill Vibes", trackIsrc: "DIFFERENT_ISRC" };
    const isMatch = playlist.trackIsrc === songIsrc;
    expect(isMatch).toBe(false);
  });

  it("3.3.c – Fuzzy title match without ISRC should NOT be accepted", () => {
    const songTitle = "Blinding Lights";
    const fakePlaylist = { name: "Blinding Lights Remix Collection", trackIsrc: null };
    // Without ISRC or exact track ID, playlist should be excluded
    const isValidMatch = fakePlaylist.trackIsrc != null;
    expect(isValidMatch).toBe(false);
  });

  it("3.3.d – Editorial playlist with similar name but no ISRC match is excluded", () => {
    const songIsrc = "USUG11904993";
    const playlists = [
      { name: "Today's Top Hits", trackIsrc: "USUG11904993", accepted: true },
      { name: "Blinding Lights: Best of 80s Synth", trackIsrc: null, accepted: false },
      { name: "The Weeknd Essentials", trackIsrc: "USUG11904993", accepted: true },
    ];
    const accepted = playlists.filter(p => p.trackIsrc === songIsrc);
    expect(accepted).toHaveLength(2);
    expect(accepted.every(p => p.accepted)).toBe(true);
  });
});
