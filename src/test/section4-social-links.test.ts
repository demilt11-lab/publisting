/**
 * Section 4: Social & Contact Links Tests
 *
 * Covers: LinkedIn company URL generation, YouTube/TikTok link validation,
 * verified vs search fallback behavior, validateSocialUrl utility.
 */
import { describe, it, expect } from "vitest";
import {
  getInstagramCompanyUrl,
  getLinkedInCompanyUrl,
  getExternalLinks,
  getCompanySocialProfiles,
  getSanitizedArtistSocialLinks,
} from "@/lib/externalLinks";
import { validateSocialUrl } from "@/lib/types/sourceProvenance";

// ========== 4.1 LinkedIn company links ==========
describe("4.1 – LinkedIn company links", () => {
  it("4.1.a – Universal Music Group resolves to verified company page", () => {
    const url = getLinkedInCompanyUrl("Universal Music Group");
    expect(url).toBe("https://www.linkedin.com/company/universal-music-group");
    expect(url).not.toContain("search");
  });

  it("4.1.b – Sony Music Entertainment resolves correctly", () => {
    const url = getLinkedInCompanyUrl("Sony Music Entertainment");
    expect(url).toBe("https://www.linkedin.com/company/sony-music-entertainment");
  });

  it("4.1.c – Warner Music Group resolves correctly", () => {
    const url = getLinkedInCompanyUrl("Warner Music Group");
    expect(url).toBe("https://www.linkedin.com/company/warner-music-group");
  });

  it("4.1.d – Republic Records resolves correctly", () => {
    const url = getLinkedInCompanyUrl("Republic Records");
    expect(url).toBe("https://www.linkedin.com/company/republic-records");
  });

  it("4.1.e – Partial match works (e.g., 'Atlantic')", () => {
    const url = getLinkedInCompanyUrl("Atlantic Records Group");
    expect(url).toContain("linkedin.com/company/atlantic-records");
  });

  it("4.1.f – Unknown company returns null", () => {
    const url = getLinkedInCompanyUrl("Some Unknown Indie Label");
    expect(url).toBeNull();
  });

  it("4.1.g – Case insensitive matching", () => {
    const url = getLinkedInCompanyUrl("INTERSCOPE RECORDS");
    expect(url).toBe("https://www.linkedin.com/company/interscope-records");
  });

  it("4.1.h – Publisher slugs work (Sony Music Publishing)", () => {
    const url = getLinkedInCompanyUrl("Sony Music Publishing");
    expect(url).toBe("https://www.linkedin.com/company/sony-music-publishing");
  });

  it("4.1.i – Kobalt resolves correctly", () => {
    const url = getLinkedInCompanyUrl("Kobalt");
    expect(url).toBe("https://www.linkedin.com/company/kobalt-music");
  });

  it("4.1.j – Instagram company pages resolve when mapped", () => {
    const url = getInstagramCompanyUrl("Warner Records");
    expect(url).toBe("https://www.instagram.com/warnerrecords/");
  });

  it("4.1.k – Unknown Instagram company returns null", () => {
    const url = getInstagramCompanyUrl("Some Unknown Indie Label");
    expect(url).toBeNull();
  });

  it("4.1.l – BMG resolves to the verified company page", () => {
    const url = getLinkedInCompanyUrl("BMG Rights Management");
    expect(url).toBe("https://www.linkedin.com/company/bmg-the-new-music-company");
  });

  it("4.1.m – Compound label strings are split into verified company profiles", () => {
    const profiles = getCompanySocialProfiles("Top Dawg Entertainment, Aftermath Entertainment, Interscope Records");
    expect(profiles.some((profile) => profile.name === "Top Dawg Entertainment" && profile.linkedinUrl === "https://www.linkedin.com/company/txdxe")).toBe(true);
    expect(profiles.some((profile) => profile.name === "Top Dawg Entertainment" && profile.instagramUrl === "https://www.instagram.com/topdawgent/")).toBe(true);
    expect(profiles.some((profile) => profile.name === "Interscope Records" && profile.linkedinUrl === "https://www.linkedin.com/company/interscope-records")).toBe(true);
    expect(profiles.some((profile) => profile.name === "Aftermath Entertainment")).toBe(false);
  });
});

// ========== 4.2 Social Link Generation ==========
describe("4.2 – Social link generation", () => {
  it("4.2.a – Verified YouTube handle is used directly", () => {
    const links = getExternalLinks("The Weeknd", { youtube: "https://www.youtube.com/@theweeknd" });
    const ytLink = links.social.find(l => l.label === "YouTube");
    expect(ytLink?.url).toBe("https://www.youtube.com/@theweeknd");
    expect(ytLink?.verified).toBe(true);
  });

  it("4.2.b – No verified YouTube falls back to search, not @handle guess", () => {
    const links = getExternalLinks("The Weeknd");
    const ytLink = links.social.find(l => l.label === "YouTube");
    expect(ytLink?.url).toContain("youtube.com/results?search_query=");
    expect(ytLink?.verified).toBe(false);
  });

  it("4.2.c – Verified TikTok handle is used directly", () => {
    const links = getExternalLinks("Doja Cat", { tiktok: "https://www.tiktok.com/@dojacat" });
    const ttLink = links.social.find(l => l.label === "TikTok");
    expect(ttLink?.url).toBe("https://www.tiktok.com/@dojacat");
    expect(ttLink?.verified).toBe(true);
  });

  it("4.2.d – No verified TikTok falls back to user search", () => {
    const links = getExternalLinks("Doja Cat");
    const ttLink = links.social.find(l => l.label === "TikTok");
    expect(ttLink?.url).toContain("tiktok.com/search/user");
    expect(ttLink?.verified).toBe(false);
  });

  it("4.2.e – Verified Instagram is used directly", () => {
    const links = getExternalLinks("Drake", { instagram: "https://www.instagram.com/champagnepapi" });
    const igLink = links.social.find(l => l.label === "Instagram");
    expect(igLink?.url).toBe("https://www.instagram.com/champagnepapi");
    expect(igLink?.verified).toBe(true);
  });

  it("4.2.f – Kendrick Lamar uses curated verified Instagram and YouTube links", () => {
    const links = getExternalLinks("Kendrick Lamar", { instagram: "https://www.instagram.com/reel/bad-link/" });
    const igLink = links.social.find(l => l.label === "Instagram");
    const ytLink = links.social.find(l => l.label === "YouTube");
    expect(igLink?.url).toBe("https://www.instagram.com/kendricklamar/");
    expect(igLink?.verified).toBe(true);
    expect(ytLink?.url).toBe("https://www.youtube.com/channel/UC3lBXcrKFnFAFkfVk5WuKcQ");
    expect(ytLink?.verified).toBe(true);
  });

  it("4.2.g – Invalid verified artist URL is filtered out and falls back to search", () => {
    const sanitized = getSanitizedArtistSocialLinks("Test Artist", { instagram: "https://www.instagram.com/reel/not-a-profile/" });
    expect(sanitized.instagram).toBeUndefined();

    const links = getExternalLinks("Test Artist", { instagram: "https://www.instagram.com/reel/not-a-profile/" });
    const igLink = links.social.find(l => l.label === "Instagram");
    expect(igLink?.verified).toBe(false);
    expect(igLink?.url).toContain("instagram.com/explore/search/keyword/");
  });
});

// ========== 4.3 No Email Icons ==========
describe("4.3 – Email icons removed", () => {
  it("4.3.a – External links do not include email entries", () => {
    const links = getExternalLinks("Test Artist");
    const allLabels = [...links.social, ...links.music, ...links.info].map(l => l.label.toLowerCase());
    expect(allLabels).not.toContain("email");
    expect(allLabels).not.toContain("mail");
  });
});

// ========== 4.4 validateSocialUrl utility ==========
describe("4.4 – validateSocialUrl utility", () => {
  it("4.4.a – LinkedIn company page is valid", () => {
    const r = validateSocialUrl("https://www.linkedin.com/company/universal-music-group");
    expect(r.valid).toBe(true);
    expect(r.platform).toBe("linkedin");
    expect(r.type).toBe("company");
  });

  it("4.4.b – LinkedIn search URL is invalid", () => {
    const r = validateSocialUrl("https://www.linkedin.com/search/results/companies/?keywords=test");
    expect(r.valid).toBe(false);
    expect(r.type).toBe("search");
  });

  it("4.4.c – YouTube @handle is valid", () => {
    const r = validateSocialUrl("https://www.youtube.com/@theweeknd");
    expect(r.valid).toBe(true);
    expect(r.type).toBe("profile");
  });

  it("4.4.d – YouTube search URL is invalid", () => {
    const r = validateSocialUrl("https://www.youtube.com/results?search_query=test");
    expect(r.valid).toBe(false);
    expect(r.type).toBe("search");
  });

  it("4.4.e – TikTok @handle is valid", () => {
    const r = validateSocialUrl("https://www.tiktok.com/@dojacat");
    expect(r.valid).toBe(true);
    expect(r.type).toBe("profile");
  });

  it("4.4.f – TikTok /search/user is invalid", () => {
    const r = validateSocialUrl("https://www.tiktok.com/search/user?q=test");
    expect(r.valid).toBe(false);
    expect(r.type).toBe("search");
  });

  it("4.4.g – Instagram profile path is valid", () => {
    const r = validateSocialUrl("https://www.instagram.com/champagnepapi");
    expect(r.valid).toBe(true);
    expect(r.type).toBe("profile");
  });

  it("4.4.h – Instagram explore/search is invalid", () => {
    const r = validateSocialUrl("https://www.instagram.com/explore/search/keyword/?q=test");
    expect(r.valid).toBe(false);
    expect(r.type).toBe("search");
  });

  it("4.4.i – YouTube channel URL is valid", () => {
    const r = validateSocialUrl("https://www.youtube.com/channel/UC1234567890");
    expect(r.valid).toBe(true);
    expect(r.type).toBe("profile");
  });

  it("4.4.j – Invalid URL returns unknown", () => {
    const r = validateSocialUrl("not-a-url");
    expect(r.valid).toBe(false);
    expect(r.platform).toBe("unknown");
  });

  it("4.4.k – LinkedIn /in/ profile is valid", () => {
    const r = validateSocialUrl("https://www.linkedin.com/in/john-doe");
    expect(r.valid).toBe(true);
    expect(r.type).toBe("profile");
  });

  it("4.4.l – Instagram reel URL is invalid", () => {
    const r = validateSocialUrl("https://www.instagram.com/reel/ABC123/");
    expect(r.valid).toBe(false);
    expect(r.type).toBe("search");
  });
});

