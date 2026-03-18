/**
 * Section 2: Credits Deduplication, Signing Status & Source Provenance Tests
 *
 * Covers: credit merging, dedup by normalized identity, evidence-based signing status,
 * SourceProvenance structure, and confidence levels.
 */
import { describe, it, expect } from "vitest";
import { getSigningConfidence, validateSocialUrl } from "@/lib/types/sourceProvenance";
import type { SourceProvenance } from "@/lib/types/sourceProvenance";

// ========== Inline credit mapping logic (mirrors useSongLookup.ts) ==========
interface CreditData {
  name: string;
  role: 'artist' | 'writer' | 'producer';
  publishingStatus: 'signed' | 'unsigned' | 'unknown';
  publisher?: string;
  recordLabel?: string;
  ipi?: string;
  pro?: string;
  socialLinks?: Record<string, string>;
}

function normalizeName(name: string): string {
  return String(name || '').trim()
    .replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '')
    .replace(/\s*&\s*/g, ' and ').replace(/\s*,\s+/g, ', ')
    .replace(/^(?:feat\.?|ft\.?|featuring)\s+/i, '')
    .trim();
}

function deduplicateCredits(credits: CreditData[]): CreditData[] {
  const seen = new Map<string, CreditData>();
  for (const credit of credits) {
    const key = `${normalizeName(credit.name).toLowerCase()}:${credit.role}`;
    if (!seen.has(key)) {
      seen.set(key, credit);
    } else {
      // Merge: keep entry with most metadata
      const existing = seen.get(key)!;
      if (!existing.publisher && credit.publisher) seen.set(key, { ...existing, ...credit });
    }
  }
  return Array.from(seen.values());
}

function resolveSigningStatus(
  proInfo: { publisher?: string; recordLabel?: string; ipi?: string; pro?: string } | null,
  role: string,
  inheritedLabel?: string | null
): 'signed' | 'unsigned' | 'unknown' {
  const effectiveLabel = proInfo?.recordLabel || inheritedLabel || null;
  const hasPublisher = !!proInfo?.publisher;
  const hasLabel = !!effectiveLabel;
  if (hasPublisher) return 'signed';
  if (role === 'artist' && hasLabel) return 'signed';
  return 'unknown';
}

// ========== 2.1 Credit Deduplication ==========
describe("2.1 – Credit deduplication", () => {
  it("2.1.a – Same person as writer and producer stays in both role lists", () => {
    const credits: CreditData[] = [
      { name: "Jack Antonoff", role: "writer", publishingStatus: "signed", publisher: "Sony/ATV" },
      { name: "Jack Antonoff", role: "producer", publishingStatus: "signed", publisher: "Sony/ATV" },
    ];
    const deduped = deduplicateCredits(credits);
    expect(deduped).toHaveLength(2);
    expect(deduped.find(c => c.role === "writer")?.name).toBe("Jack Antonoff");
    expect(deduped.find(c => c.role === "producer")?.name).toBe("Jack Antonoff");
  });

  it("2.1.b – Duplicate writer with same name is removed", () => {
    const credits: CreditData[] = [
      { name: "Max Martin", role: "writer", publishingStatus: "signed" },
      { name: "Max Martin", role: "writer", publishingStatus: "signed" },
    ];
    const deduped = deduplicateCredits(credits);
    expect(deduped).toHaveLength(1);
  });

  it("2.1.c – Normalized name dedup handles parentheticals", () => {
    const credits: CreditData[] = [
      { name: "Abel Tesfaye", role: "writer", publishingStatus: "unknown" },
      { name: "Abel Tesfaye (The Weeknd)", role: "writer", publishingStatus: "unknown" },
    ];
    const deduped = deduplicateCredits(credits);
    expect(deduped).toHaveLength(1);
  });

  it("2.1.d – Different people with different names are kept", () => {
    const credits: CreditData[] = [
      { name: "Max Martin", role: "writer", publishingStatus: "signed" },
      { name: "Shellback", role: "writer", publishingStatus: "signed" },
    ];
    const deduped = deduplicateCredits(credits);
    expect(deduped).toHaveLength(2);
  });

  it("2.1.e – Same person across roles shares canonical metadata after merge", () => {
    const credits: CreditData[] = [
      { name: "Jack Antonoff", role: "writer", publishingStatus: "signed", publisher: "Sony/ATV", pro: "ASCAP" },
      { name: "Jack Antonoff", role: "producer", publishingStatus: "signed", publisher: "Sony/ATV", pro: "ASCAP" },
    ];
    const deduped = deduplicateCredits(credits);
    const writer = deduped.find(c => c.role === "writer")!;
    const producer = deduped.find(c => c.role === "producer")!;
    expect(writer.publisher).toBe(producer.publisher);
    expect(writer.pro).toBe(producer.pro);
  });

  it("2.1.f – Duplicate with better metadata wins during merge", () => {
    const credits: CreditData[] = [
      { name: "Max Martin", role: "writer", publishingStatus: "unknown" },
      { name: "Max Martin", role: "writer", publishingStatus: "signed", publisher: "MXM Music" },
    ];
    const deduped = deduplicateCredits(credits);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].publisher).toBe("MXM Music");
  });
});

// ========== 2.2 Evidence-Based Signing Status ==========
describe("2.2 – Evidence-based signing status", () => {
  it("2.2.a – PRO/IPI alone does NOT mark as signed", () => {
    const status = resolveSigningStatus({ pro: "ASCAP", ipi: "123456789" }, "writer");
    expect(status).toBe("unknown");
  });

  it("2.2.b – Publisher present marks as signed", () => {
    const status = resolveSigningStatus({ publisher: "Sony/ATV", pro: "ASCAP" }, "writer");
    expect(status).toBe("signed");
  });

  it("2.2.c – Artist with record label marks as signed", () => {
    const status = resolveSigningStatus({}, "artist", "Republic Records");
    expect(status).toBe("signed");
  });

  it("2.2.d – Writer with record label but no publisher stays unknown", () => {
    const status = resolveSigningStatus({}, "writer", "Republic Records");
    expect(status).toBe("unknown");
  });

  it("2.2.e – No data at all returns unknown", () => {
    const status = resolveSigningStatus(null, "producer");
    expect(status).toBe("unknown");
  });
});

// ========== 2.3 Name Normalization ==========
describe("2.3 – Name normalization", () => {
  it("strips parentheticals", () => {
    expect(normalizeName("Abel Tesfaye (The Weeknd)")).toBe("Abel Tesfaye");
  });
  it("strips feat. prefix", () => {
    expect(normalizeName("feat. Justin Bieber")).toBe("Justin Bieber");
  });
  it("normalizes ampersand", () => {
    expect(normalizeName("ROSÉ & Bruno Mars")).toBe("ROSÉ and Bruno Mars");
  });
  it("trims whitespace", () => {
    expect(normalizeName("  Max Martin  ")).toBe("Max Martin");
  });
});

// ========== 2.4 SourceProvenance & Confidence ==========
describe("2.4 – SourceProvenance signing confidence", () => {
  it("2.4.a – No provenance data = low confidence", () => {
    expect(getSigningConfidence([])).toBe("low");
  });

  it("2.4.b – Single trusted source = medium confidence", () => {
    const sources: SourceProvenance[] = [
      { field: "publisher", value: "Sony/ATV", source: "musicbrainz", verified: true },
    ];
    expect(getSigningConfidence(sources)).toBe("medium");
  });

  it("2.4.c – Two trusted sources agreeing = high confidence", () => {
    const sources: SourceProvenance[] = [
      { field: "publisher", value: "Sony/ATV", source: "musicbrainz", verified: true },
      { field: "publisher", value: "Sony/ATV", source: "ascap", verified: true },
    ];
    expect(getSigningConfidence(sources)).toBe("high");
  });

  it("2.4.d – Conflicting publisher values = conflicting", () => {
    const sources: SourceProvenance[] = [
      { field: "publisher", value: "Sony/ATV", source: "musicbrainz", verified: true },
      { field: "publisher", value: "Universal Music Publishing", source: "bmi", verified: true },
    ];
    expect(getSigningConfidence(sources)).toBe("conflicting");
  });

  it("2.4.e – Conflicting label values = conflicting", () => {
    const sources: SourceProvenance[] = [
      { field: "label", value: "Republic Records", source: "spotify", verified: true },
      { field: "label", value: "Interscope Records", source: "musicbrainz", verified: true },
    ];
    expect(getSigningConfidence(sources)).toBe("conflicting");
  });

  it("2.4.f – Unverified sources only = low confidence", () => {
    const sources: SourceProvenance[] = [
      { field: "publisher", value: "Some Publisher", source: "genius", verified: false },
    ];
    expect(getSigningConfidence(sources)).toBe("low");
  });
});
