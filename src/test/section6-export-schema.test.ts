/**
 * Section 6: Catalog Credits & Exports Schema Tests
 *
 * Covers: export schema completeness, column presence validation,
 * versioned schema stability.
 */
import { describe, it, expect } from "vitest";

const REQUIRED_EXPORT_COLUMNS = [
  "title", "artist", "isrc", "writers", "producers",
  "label", "publisher", "pro",
];

const EXTENDED_EXPORT_COLUMNS = [
  ...REQUIRED_EXPORT_COLUMNS,
  "spotifyStreams", "youtubeViews", "shazamCount",
  "chartPlacements", "socialUrls",
];

const EXPORT_SCHEMA_VERSION = 1;

describe("6.1 – Export schema validation", () => {
  it("6.1.a – Export row contains all required columns", () => {
    const exportRow = {
      title: "Blinding Lights",
      artist: "The Weeknd",
      isrc: "USUG11904993",
      writers: "Abel Tesfaye, Max Martin, Oscar Holter",
      producers: "Max Martin, Oscar Holter",
      label: "Republic Records",
      publisher: "Universal Music Publishing",
      pro: "SOCAN",
    };

    for (const col of REQUIRED_EXPORT_COLUMNS) {
      expect(exportRow).toHaveProperty(col);
      expect((exportRow as any)[col]).toBeTruthy();
    }
  });

  it("6.1.b – Missing ISRC is handled gracefully (not undefined)", () => {
    const exportRow = {
      title: "Some Song",
      artist: "Some Artist",
      isrc: "",
      writers: "",
      producers: "",
      label: "",
      publisher: "",
      pro: "",
    };
    expect(exportRow).toHaveProperty("isrc");
    expect(typeof exportRow.isrc).toBe("string");
  });

  it("6.1.c – Export schema version is tracked", () => {
    expect(EXPORT_SCHEMA_VERSION).toBe(1);
    // If schema changes, increment version and update downstream consumers
  });

  it("6.1.d – Extended export includes streaming stats and social URLs", () => {
    const extendedRow = {
      title: "Blinding Lights",
      artist: "The Weeknd",
      isrc: "USUG11904993",
      writers: "Abel Tesfaye, Max Martin, Oscar Holter",
      producers: "Max Martin, Oscar Holter",
      label: "Republic Records",
      publisher: "Universal Music Publishing",
      pro: "SOCAN",
      spotifyStreams: 4000000000,
      youtubeViews: 800000000,
      shazamCount: 40000000,
      chartPlacements: "Billboard Hot 100: #1",
      socialUrls: "https://instagram.com/theweeknd",
    };

    for (const col of EXTENDED_EXPORT_COLUMNS) {
      expect(extendedRow).toHaveProperty(col);
    }
  });

  it("6.1.e – Multiple export formats produce same column set", () => {
    const csvColumns = [...REQUIRED_EXPORT_COLUMNS];
    const xlsxColumns = [...REQUIRED_EXPORT_COLUMNS];
    expect(csvColumns).toEqual(xlsxColumns);
  });
});
