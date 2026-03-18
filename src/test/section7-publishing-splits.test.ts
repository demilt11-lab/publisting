/**
 * Section 7: Publishing Splits & Rights Data Tests
 *
 * Covers: partial split display, confidence levels, no normalization to 100%,
 * multi-source aggregation, conflicting registrations.
 */
import { describe, it, expect } from "vitest";
import { calculatePublishingConfidence } from "@/lib/confidence";

interface WriterShare {
  name: string;
  share?: number;
  source?: string;
  publisher?: string;
}

function computeSharesSummary(shares: WriterShare[]): {
  knownTotal: number;
  unknownRemainder: number;
  confidence: 'high' | 'medium' | 'low';
  hasConflict: boolean;
} {
  const knownShares = shares.filter(s => s.share != null && s.share > 0);
  const knownTotal = knownShares.reduce((sum, s) => sum + (s.share || 0), 0);
  const unknownRemainder = Math.max(0, 100 - knownTotal);

  // Check for conflicts: same person with different shares
  const byName = new Map<string, number[]>();
  for (const s of knownShares) {
    const key = s.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(s.share!);
  }
  const hasConflict = Array.from(byName.values()).some(
    vals => vals.length > 1 && new Set(vals).size > 1
  );

  const sources = new Set(knownShares.map(s => s.source).filter(Boolean));
  let confidence: 'high' | 'medium' | 'low';
  if (hasConflict) {
    confidence = 'low';
  } else if (knownTotal >= 95 && sources.size >= 2) {
    confidence = 'high';
  } else if (knownTotal >= 50 || sources.size >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { knownTotal, unknownRemainder, confidence, hasConflict };
}

describe("7.1 – Publishing splits do NOT normalize to 100%", () => {
  it("7.1.a – Complete splits from multiple sources = high confidence", () => {
    const shares: WriterShare[] = [
      { name: "Writer A", share: 50, source: "ASCAP" },
      { name: "Writer B", share: 50, source: "BMI" },
    ];
    const summary = computeSharesSummary(shares);
    expect(summary.knownTotal).toBe(100);
    expect(summary.unknownRemainder).toBe(0);
    expect(summary.confidence).toBe("high");
    expect(summary.hasConflict).toBe(false);
  });

  it("7.1.b – Partial splits show unknown remainder", () => {
    const shares: WriterShare[] = [
      { name: "Writer A", share: 40, source: "ASCAP" },
      { name: "Writer B", share: 35, source: "ASCAP" },
    ];
    const summary = computeSharesSummary(shares);
    expect(summary.knownTotal).toBe(75);
    expect(summary.unknownRemainder).toBe(25);
    expect(summary.confidence).toBe("medium");
  });

  it("7.1.c – No share data = low confidence", () => {
    const shares: WriterShare[] = [
      { name: "Writer A" },
      { name: "Writer B" },
    ];
    const summary = computeSharesSummary(shares);
    expect(summary.knownTotal).toBe(0);
    expect(summary.unknownRemainder).toBe(100);
    expect(summary.confidence).toBe("low");
  });

  it("7.1.d – Single source = medium confidence even if complete", () => {
    const shares: WriterShare[] = [
      { name: "Writer A", share: 50, source: "ASCAP" },
      { name: "Writer B", share: 50, source: "ASCAP" },
    ];
    const summary = computeSharesSummary(shares);
    expect(summary.knownTotal).toBe(100);
    expect(summary.confidence).toBe("medium");
  });

  it("7.1.e – Conflicting shares for same writer = low confidence + conflict flag", () => {
    const shares: WriterShare[] = [
      { name: "Writer A", share: 50, source: "ASCAP" },
      { name: "Writer A", share: 33, source: "BMI" },
    ];
    const summary = computeSharesSummary(shares);
    expect(summary.hasConflict).toBe(true);
    expect(summary.confidence).toBe("low");
  });
});

describe("7.2 – Publishing confidence via confidence module", () => {
  it("7.2.a – Writers with shares and publishers = high confidence", () => {
    const credits = [
      { name: "A", role: "writer", publishingShare: 50, publisher: "Sony/ATV", pro: "ASCAP" },
      { name: "B", role: "writer", publishingShare: 50, publisher: "Universal", pro: "BMI" },
    ];
    const result = calculatePublishingConfidence(credits);
    expect(result.level).toBe("high");
  });

  it("7.2.b – Writers with no shares = low confidence", () => {
    const credits = [
      { name: "A", role: "writer" },
      { name: "B", role: "writer" },
    ];
    const result = calculatePublishingConfidence(credits);
    expect(result.level).toBe("low");
  });

  it("7.2.c – No writers at all = low confidence", () => {
    const result = calculatePublishingConfidence([]);
    expect(result.level).toBe("low");
  });
});
