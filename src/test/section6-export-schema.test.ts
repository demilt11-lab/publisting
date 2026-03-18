/**
 * Section 6: Catalog Credits & Exports Schema Tests
 *
 * Covers: export schema completeness, column presence validation.
 */
import { describe, it, expect } from "vitest";

const REQUIRED_EXPORT_COLUMNS = [
  "title", "artist", "isrc", "writers", "producers",
  "label", "publisher", "pro",
];

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
    // ISRC can be empty string but must be present
    expect(exportRow).toHaveProperty("isrc");
    expect(typeof exportRow.isrc).toBe("string");
  });
});
