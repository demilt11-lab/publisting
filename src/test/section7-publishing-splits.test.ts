/**
 * Section 7: Publishing Splits & Rights Data Tests
 *
 * Covers: partial split display, confidence levels, no normalization to 100%.
 */
import { describe, it, expect } from "vitest";

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
} {
  const knownShares = shares.filter(s => s.share != null && s.share > 0);
  const knownTotal = knownShares.reduce((sum, s) => sum + (s.share || 0), 0);
  const unknownRemainder = Math.max(0, 100 - knownTotal);

  // Confidence: multiple sources agree = high, single source = medium, incomplete = low
  const sources = new Set(knownShares.map(s => s.source).filter(Boolean));
  let confidence: 'high' | 'medium' | 'low';
  if (knownTotal >= 95 && sources.size >= 2) {
    confidence = 'high';
  } else if (knownTotal >= 50 || sources.size >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { knownTotal, unknownRemainder, confidence };
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
    // Single source, so medium
    expect(summary.confidence).toBe("medium");
  });
});
