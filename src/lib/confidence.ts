import { Credit } from "@/components/CreditsSection";
import { ChartPlacement } from "@/lib/api/chartLookup";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number; // 0-100
  reasons: string[];
}

export interface GapMessage {
  type: "warning" | "info";
  message: string;
  action?: string;
}

// Credits confidence
export function calculateCreditsConfidence(credits: Credit[]): ConfidenceResult {
  const reasons: string[] = [];
  let score = 0;

  if (credits.length === 0) {
    return { level: "low", score: 0, reasons: ["No credits found"] };
  }

  // Base score for having credits
  score += 20;

  // Role diversity
  const roles = new Set(credits.map(c => c.role));
  if (roles.has("artist")) score += 15;
  if (roles.has("writer")) score += 20;
  if (roles.has("producer")) score += 15;

  if (roles.size >= 2) {
    score += 10;
    reasons.push("Multiple roles represented");
  }

  // Data completeness
  const withPublisher = credits.filter(c => c.publisher).length;
  const withPRO = credits.filter(c => c.pro).length;
  const withIPI = credits.filter(c => c.ipi).length;
  const withShares = credits.filter(c => c.publishingShare).length;

  if (withPublisher / credits.length > 0.7) {
    score += 15;
    reasons.push("Most credits have publisher info");
  } else if (withPublisher / credits.length > 0.3) {
    score += 8;
  }

  if (withPRO / credits.length > 0.5) {
    score += 10;
    reasons.push("PRO affiliations found");
  }

  if (withIPI > 0) {
    score += 5;
    reasons.push("IPI numbers available");
  }

  if (withShares > 0) {
    score += 10;
    reasons.push("Publishing splits available");
  }

  // Data consistency
  const loadingCredits = credits.filter(c => c.isLoading).length;
  const errorCredits = credits.filter(c => c.error).length;

  if (loadingCredits > 0) score -= 10;
  if (errorCredits > 0) score -= 15;

  score = Math.max(0, Math.min(100, score));

  let level: ConfidenceLevel;
  if (score >= 75) level = "high";
  else if (score >= 45) level = "medium";
  else level = "low";

  return { level, score, reasons };
}

// Publishing splits confidence
export function calculatePublishingConfidence(credits: Credit[]): ConfidenceResult {
  const writers = credits.filter(c => c.role === "writer");
  const reasons: string[] = [];
  let score = 0;

  if (writers.length === 0) {
    return { level: "low", score: 0, reasons: ["No writers found"] };
  }

  score += 20; // Base score

  const withShares = writers.filter(w => w.publishingShare && w.publishingShare > 0);
  const sharePercentage = withShares.length / writers.length;

  if (sharePercentage >= 0.8) {
    score += 40;
    reasons.push("Most writers have split data");
  } else if (sharePercentage >= 0.5) {
    score += 25;
    reasons.push("Some writers have split data");
  } else if (sharePercentage > 0) {
    score += 10;
  }

  // Check if shares sum reasonably close to 100%
  const totalShares = withShares.reduce((sum, w) => sum + (w.publishingShare || 0), 0);
  if (withShares.length > 0) {
    if (totalShares >= 95 && totalShares <= 105) {
      score += 30;
      reasons.push("Splits sum close to 100%");
    } else if (totalShares >= 80 && totalShares <= 120) {
      score += 15;
    } else {
      score -= 10;
    }
  }

  // Publisher coverage
  const withPublisher = writers.filter(w => w.publisher).length;
  if (withPublisher / writers.length > 0.7) {
    score += 15;
    reasons.push("Publisher info available");
  }

  score = Math.max(0, Math.min(100, score));

  let level: ConfidenceLevel;
  if (score >= 70) level = "high";
  else if (score >= 40) level = "medium";
  else level = "low";

  return { level, score, reasons };
}

// Chart confidence
export function calculateChartConfidence(placements: ChartPlacement[]): ConfidenceResult {
  const reasons: string[] = [];
  let score = 0;

  if (placements.length === 0) {
    return { level: "low", score: 20, reasons: ["No chart data found"] };
  }

  // Base score for having data
  score += 40;

  // Major chart presence
  const majorCharts = placements.filter(p => 
    p.chart.toLowerCase().includes("billboard") || 
    p.chart.toLowerCase().includes("spotify") ||
    p.chart.toLowerCase().includes("apple")
  );

  if (majorCharts.length > 0) {
    score += 30;
    reasons.push("Major chart placements found");
  }

  // Peak position quality
  const highPeaks = placements.filter(p => p.peakPosition <= 10);
  const mediumPeaks = placements.filter(p => p.peakPosition <= 50);

  if (highPeaks.length > 0) {
    score += 20;
    reasons.push("Top 10 chart positions");
  } else if (mediumPeaks.length > 0) {
    score += 10;
    reasons.push("Top 50 chart positions");
  }

  // Data completeness
  const withDates = placements.filter(p => p.date).length;
  const withWeeks = placements.filter(p => p.weeksOnChart).length;

  if (withDates / placements.length > 0.5) {
    score += 5;
  }

  if (withWeeks / placements.length > 0.5) {
    score += 5;
    reasons.push("Chart duration data available");
  }

  score = Math.max(0, Math.min(100, score));

  let level: ConfidenceLevel;
  if (score >= 75) level = "high";
  else if (score >= 45) level = "medium";
  else level = "low";

  return { level, score, reasons };
}

// Radio airplay confidence
export function calculateRadioConfidence(
  stations: any[], 
  isLoading: boolean, 
  error: string | null
): ConfidenceResult {
  const reasons: string[] = [];
  let score = 0;

  if (error) {
    return { level: "low", score: 0, reasons: ["Data source error"] };
  }

  if (isLoading) {
    return { level: "medium", score: 50, reasons: ["Data loading"] };
  }

  if (stations.length === 0) {
    return { level: "low", score: 25, reasons: ["No airplay data found"] };
  }

  // Base score for having data
  score += 30;

  // Station count quality
  if (stations.length >= 50) {
    score += 30;
    reasons.push("Extensive station coverage");
  } else if (stations.length >= 20) {
    score += 20;
    reasons.push("Good station coverage");
  } else if (stations.length >= 5) {
    score += 10;
  }

  // Spin data quality
  const withSpins = stations.filter(s => s.spins && s.spins > 0);
  if (withSpins.length > 0) {
    score += 20;
    reasons.push("Spin count data available");
    
    const totalSpins = withSpins.reduce((sum, s) => sum + s.spins, 0);
    if (totalSpins >= 1000) {
      score += 15;
      reasons.push("High spin volume");
    }
  }

  // Format diversity
  const formats = new Set(stations.map(s => s.format).filter(Boolean));
  if (formats.size >= 3) {
    score += 10;
    reasons.push("Multiple radio formats");
  }

  score = Math.max(0, Math.min(100, score));

  let level: ConfidenceLevel;
  if (score >= 70) level = "high";
  else if (score >= 40) level = "medium";
  else level = "low";

  return { level, score, reasons };
}

// Record label confidence
export function calculateLabelConfidence(
  recordLabel?: string,
  releaseDate?: string,
  isrc?: string
): ConfidenceResult {
  const reasons: string[] = [];
  let score = 0;

  if (recordLabel) {
    score += 40;
    reasons.push("Label information available");
  } else {
    score += 10; // Still some confidence as "independent" is valid info
  }

  if (releaseDate) {
    score += 25;
    reasons.push("Release date available");
  }

  if (isrc) {
    score += 35;
    reasons.push("ISRC code available");
  }

  score = Math.max(0, Math.min(100, score));

  let level: ConfidenceLevel;
  if (score >= 75) level = "high";
  else if (score >= 40) level = "medium";
  else level = "low";

  return { level, score, reasons };
}

// Outreach confidence
export function calculateOutreachConfidence(
  credits: Credit[],
  emailResults: Record<string, any>
): ConfidenceResult {
  const reasons: string[] = [];
  let score = 0;

  const targets = [...new Set(credits.map(c => c.name.toLowerCase()))];
  if (targets.length === 0) {
    return { level: "low", score: 0, reasons: ["No contact targets identified"] };
  }

  // Base score for having targets
  score += 20;

  // Contact data quality
  const withPublisher = credits.filter(c => c.publisher).length;
  const withPRO = credits.filter(c => c.pro).length;
  
  if (withPublisher / credits.length > 0.6) {
    score += 25;
    reasons.push("Publisher contact paths available");
  }

  if (withPRO / credits.length > 0.5) {
    score += 15;
    reasons.push("PRO lookup possible");
  }

  // Email lookup success
  const emailLookups = Object.values(emailResults);
  const successfulEmails = emailLookups.filter(r => 
    r && typeof r === 'object' && (r.email || (r.emails && r.emails.length > 0))
  ).length;

  if (successfulEmails > 0) {
    score += 30;
    reasons.push("Direct email contacts found");
    
    if (successfulEmails / targets.length > 0.5) {
      score += 10;
      reasons.push("High email discovery rate");
    }
  }

  // Social/professional data
  const withManagement = credits.filter(c => c.management).length;
  if (withManagement > 0) {
    score += 10;
    reasons.push("Management info available");
  }

  score = Math.max(0, Math.min(100, score));

  let level: ConfidenceLevel;
  if (score >= 70) level = "high";
  else if (score >= 40) level = "medium";
  else level = "low";

  return { level, score, reasons };
}

// Gap detection functions
export function detectPublishingGaps(credits: Credit[]): GapMessage[] {
  const gaps: GapMessage[] = [];
  const writers = credits.filter(c => c.role === "writer");
  
  if (writers.length === 0) return gaps;

  // Missing PRO/IPI
  const noPRO = writers.filter(w => !w.pro);
  if (noPRO.length > 0) {
    gaps.push({
      type: "info",
      message: `${noPRO.length} writer(s) missing PRO affiliation.`,
      action: `Search directly on ASCAP, BMI, or SESAC databases using writer names.`
    });
  }

  // Incomplete splits
  const withShares = writers.filter(w => w.publishingShare && w.publishingShare > 0);
  const totalShares = withShares.reduce((sum, w) => sum + (w.publishingShare || 0), 0);
  
  if (withShares.length > 0 && (totalShares < 85 || totalShares > 115)) {
    gaps.push({
      type: "warning",
      message: `Publishing splits don't sum to 100% (currently ${totalShares.toFixed(1)}%).`,
      action: "Some shares may be unregistered or handled by territory-specific societies. Confirm splits directly with PROs and rights holders."
    });
  }

  // Missing publishers
  const noPublisher = writers.filter(w => !w.publisher);
  if (noPublisher.length > writers.length * 0.5) {
    gaps.push({
      type: "info",
      message: `${noPublisher.length} writer(s) have no publisher listed.`,
      action: "Writers may be self-published or use admin deals not reflected in public databases."
    });
  }

  return gaps;
}

export function detectOutreachGaps(
  credits: Credit[], 
  emailResults: Record<string, any>
): GapMessage[] {
  const gaps: GapMessage[] = [];
  
  // Limited contact suggestions
  const targets = [...new Set(credits.map(c => c.name.toLowerCase()))];
  const hasEmail = Object.values(emailResults).some(r => 
    r && typeof r === 'object' && (r.email || (r.emails && r.emails.length > 0))
  );

  if (targets.length > 0 && !hasEmail) {
    gaps.push({
      type: "info",
      message: "No direct email contacts found via automated lookup.",
      action: "Try manual searches on LinkedIn, Instagram, and PRO websites using names and publisher info above."
    });
  }

  // Missing social/management info
  const withSocial = credits.filter(c => c.management).length;
  if (withSocial === 0 && credits.length > 0) {
    gaps.push({
      type: "info",
      message: "No management or social media info found in public databases.",
      action: "Search social platforms directly using artist and writer names, or check music industry directories."
    });
  }

  return gaps;
}

export function detectChartGaps(placements: ChartPlacement[]): GapMessage[] {
  const gaps: GapMessage[] = [];

  if (placements.length === 0) {
    gaps.push({
      type: "info",
      message: "No chart performance found in our sources.",
      action: "Song may not have charted commercially, or data may not be available for this territory/time period."
    });
  }

  return gaps;
}

export function detectRadioGaps(stations: any[], hasUSStations: boolean): GapMessage[] {
  const gaps: GapMessage[] = [];

  if (stations.length === 0) {
    gaps.push({
      type: "info",
      message: "No radio airplay records found.",
      action: "Song may have limited commercial radio play, or airplay data may not be tracked in our sources (Mediabase, Billboard, Luminate)."
    });
  } else if (!hasUSStations && stations.length > 0) {
    gaps.push({
      type: "info",
      message: "No US radio stations found - showing international data only.",
      action: "Check regional radio databases or contact local promotion teams for US market data."
    });
  }

  return gaps;
}