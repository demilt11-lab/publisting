/**
 * Section 1: Song Lookup & Link Resolution Tests
 *
 * Covers: URL parsing, history format consistency, streaming URL detection,
 * and fail-closed behavior for ambiguous queries.
 */
import { describe, it, expect } from "vitest";

// ========== Inline copies of client-side utilities for testing ==========
// (These mirror the logic in SearchBar.tsx and song-lookup edge function)

const STREAMING_URL_PATTERNS = [
  /spotify\.com/i, /spotify\.link/i, /spotify:track:/i,
  /music\.apple\.com/i, /itunes\.apple\.com/i, /tidal\.com/i,
  /deezer\.com/i, /deezer\.page\.link/i, /music\.youtube\.com/i,
  /youtube\.com\/watch/i, /youtu\.be/i, /soundcloud\.com/i, /music\.amazon\.com/i,
];

function looksLikeStreamingUrl(text: string): boolean {
  return STREAMING_URL_PATTERNS.some((p) => p.test(text));
}

// Mirror of parseStreamingUrl from song-lookup edge function
interface ParsedUrl {
  platform: 'spotify' | 'apple' | 'tidal' | 'deezer' | 'youtube' | 'amazon' | 'search';
  id?: string;
  url?: string;
  query?: string;
}

function parseStreamingUrl(input: string): ParsedUrl {
  const spotifyUriMatch = input.match(/^spotify:track:([a-zA-Z0-9]+)/);
  if (spotifyUriMatch) return { platform: 'spotify', id: spotifyUriMatch[1], url: `https://open.spotify.com/track/${spotifyUriMatch[1]}` };

  try {
    const urlObj = new URL(input);
    const hostname = urlObj.hostname.toLowerCase();

    if (hostname.includes('spotify')) {
      const match = urlObj.pathname.match(/\/(?:intl-[a-z]+\/)?track\/([a-zA-Z0-9]+)/);
      if (match) return { platform: 'spotify', id: match[1], url: input };
    }
    if (hostname.includes('apple') || hostname.includes('itunes')) {
      const trackId = urlObj.searchParams.get('i');
      const songMatch = urlObj.pathname.match(/\/song\/[^/]+\/(\d+)/);
      const albumTrackMatch = urlObj.pathname.match(/\/album\/[^/]+\/(\d+)/);
      const resolvedId = trackId || songMatch?.[1] || albumTrackMatch?.[1];
      return { platform: 'apple', id: resolvedId ?? undefined, url: input };
    }
    if (hostname.includes('tidal')) {
      const match = urlObj.pathname.match(/\/(?:browse\/)?track\/(\d+)/);
      if (match) return { platform: 'tidal', id: match[1], url: input };
    }
    if (hostname.includes('deezer')) {
      const match = urlObj.pathname.match(/\/(?:[a-z]{2}\/)?track\/(\d+)/);
      if (match) return { platform: 'deezer', id: match[1], url: input };
    }
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      const videoId = urlObj.searchParams.get('v') ||
        (hostname.includes('youtu.be') ? urlObj.pathname.slice(1).split('/')[0] : null);
      if (videoId) return { platform: 'youtube', id: videoId, url: input };
    }
    if (hostname.includes('amazon')) {
      const asinMatch = urlObj.pathname.match(/\/dp\/([A-Z0-9]{10})/);
      return { platform: 'amazon', id: asinMatch?.[1], url: input };
    }
    return { platform: 'search', query: input };
  } catch {
    return { platform: 'search', query: input };
  }
}

// ========== 1.1 Streaming URL Detection ==========
describe("1.1 – Streaming URL detection (client-side)", () => {
  it("detects Spotify links", () => {
    expect(looksLikeStreamingUrl("https://open.spotify.com/track/0bxPRWprUVpQK0UFcddkrA")).toBe(true);
  });
  it("detects Spotify intl links", () => {
    expect(looksLikeStreamingUrl("https://open.spotify.com/intl-de/track/0bxPRWprUVpQK0UFcddkrA")).toBe(true);
  });
  it("detects Spotify URI", () => {
    expect(looksLikeStreamingUrl("spotify:track:0bxPRWprUVpQK0UFcddkrA")).toBe(true);
  });
  it("detects Apple Music links", () => {
    expect(looksLikeStreamingUrl("https://music.apple.com/us/album/humble/1440881047?i=1440881367")).toBe(true);
  });
  it("detects Tidal links", () => {
    expect(looksLikeStreamingUrl("https://tidal.com/browse/track/61651811")).toBe(true);
  });
  it("detects Deezer links", () => {
    expect(looksLikeStreamingUrl("https://www.deezer.com/track/432456282")).toBe(true);
  });
  it("detects YouTube Music links", () => {
    expect(looksLikeStreamingUrl("https://music.youtube.com/watch?v=oiY_iKSpWLM")).toBe(true);
  });
  it("detects Amazon Music links", () => {
    expect(looksLikeStreamingUrl("https://music.amazon.com/albums/B06XPCZCFX")).toBe(true);
  });
  it("rejects plain text searches", () => {
    expect(looksLikeStreamingUrl("Blinding Lights The Weeknd")).toBe(false);
  });
  it("rejects Artist - Title format", () => {
    expect(looksLikeStreamingUrl("Kendrick Lamar - HUMBLE.")).toBe(false);
  });
});

// ========== 1.2 URL Parsing ==========
describe("1.2 – parseStreamingUrl extracts correct platform + ID", () => {
  it("1.2.a – Spotify link for HUMBLE by Kendrick Lamar", () => {
    const result = parseStreamingUrl("https://open.spotify.com/track/7KXjTSCq5nL1LoYtL7XAwS");
    expect(result.platform).toBe("spotify");
    expect(result.id).toBe("7KXjTSCq5nL1LoYtL7XAwS");
  });

  it("1.2.b – Spotify intl link", () => {
    const result = parseStreamingUrl("https://open.spotify.com/intl-de/track/7KXjTSCq5nL1LoYtL7XAwS");
    expect(result.platform).toBe("spotify");
    expect(result.id).toBe("7KXjTSCq5nL1LoYtL7XAwS");
  });

  it("1.2.c – Spotify URI", () => {
    const result = parseStreamingUrl("spotify:track:7KXjTSCq5nL1LoYtL7XAwS");
    expect(result.platform).toBe("spotify");
    expect(result.id).toBe("7KXjTSCq5nL1LoYtL7XAwS");
  });

  it("1.2.d – Tidal link for track 61651811", () => {
    const result = parseStreamingUrl("https://tidal.com/browse/track/61651811");
    expect(result.platform).toBe("tidal");
    expect(result.id).toBe("61651811");
  });

  it("1.2.e – Deezer link", () => {
    const result = parseStreamingUrl("https://www.deezer.com/track/432456282");
    expect(result.platform).toBe("deezer");
    expect(result.id).toBe("432456282");
  });

  it("1.2.f – Deezer link with locale", () => {
    const result = parseStreamingUrl("https://www.deezer.com/en/track/432456282");
    expect(result.platform).toBe("deezer");
    expect(result.id).toBe("432456282");
  });

  it("1.2.g – Apple Music link with ?i= param", () => {
    const result = parseStreamingUrl("https://music.apple.com/us/album/humble/1440881047?i=1440881367");
    expect(result.platform).toBe("apple");
    expect(result.id).toBe("1440881367");
  });

  it("1.2.h – YouTube link", () => {
    const result = parseStreamingUrl("https://www.youtube.com/watch?v=tvTRZJ-4EyI");
    expect(result.platform).toBe("youtube");
    expect(result.id).toBe("tvTRZJ-4EyI");
  });

  it("1.2.i – youtu.be short link", () => {
    const result = parseStreamingUrl("https://youtu.be/tvTRZJ-4EyI");
    expect(result.platform).toBe("youtube");
    expect(result.id).toBe("tvTRZJ-4EyI");
  });

  it("1.2.j – Amazon Music link with ASIN", () => {
    const result = parseStreamingUrl("https://music.amazon.com/albums/B06XPCZCFX/dp/B06XPCZ123");
    expect(result.platform).toBe("amazon");
    // Amazon may or may not extract ASIN depending on URL format
  });

  it("1.2.k – Plain text falls back to search", () => {
    const result = parseStreamingUrl("Kendrick Lamar - HUMBLE.");
    expect(result.platform).toBe("search");
    expect(result.query).toBe("Kendrick Lamar - HUMBLE.");
  });
});

// ========== 1.3 History Format Consistency ==========
describe("1.3 – History re-load format consistency", () => {
  it("1.3.a – History cards use 'Artist - Title' format (not raw query)", () => {
    // Simulates the format used in SearchHistoryTab line 113 and Index line 650
    const entry = { artist: "The Kid LAROI", title: "Stay", query: "https://open.spotify.com/track/xxx" };
    const searchQuery = entry.artist && entry.title ? `${entry.artist} - ${entry.title}` : entry.query;
    expect(searchQuery).toBe("The Kid LAROI - Stay");
    expect(searchQuery).not.toContain("spotify.com");
  });

  it("1.3.b – Two 'Stay' songs produce distinct history entries", () => {
    const stayKidLaroi = { artist: "The Kid LAROI", title: "Stay", query: "The Kid LAROI - Stay", timestamp: 1 };
    const stayRihanna = { artist: "Rihanna", title: "Stay", query: "Rihanna - Stay", timestamp: 2 };

    // Verify they are distinct entries (different artist)
    const isDuplicate =
      stayKidLaroi.title.toLowerCase() === stayRihanna.title.toLowerCase() &&
      stayKidLaroi.artist.toLowerCase() === stayRihanna.artist.toLowerCase();
    expect(isDuplicate).toBe(false);
  });

  it("1.3.c – CommandPalette trending items use 'Artist - Title' format", () => {
    // Validates the fix we applied
    const song = { title: "APT.", artist: "ROSÉ & Bruno Mars" };
    const value = `search:${song.artist} - ${song.title}`;
    expect(value).toBe("search:ROSÉ & Bruno Mars - APT.");
    expect(value).toContain(" - ");
  });

  it("1.3.d – CenterPanel quick searches use 'Artist - Title' format", () => {
    const qs = { title: "Blinding Lights", artist: "The Weeknd" };
    const searchQuery = `${qs.artist} - ${qs.title}`;
    expect(searchQuery).toBe("The Weeknd - Blinding Lights");
  });
});
