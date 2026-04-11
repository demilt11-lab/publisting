import { Music, Globe, Instagram, Twitter, Youtube } from "lucide-react";
import { validateSocialUrl } from "@/lib/types/sourceProvenance";

export interface ExternalLink {
  label: string;
  url: string;
  icon: typeof Music;
  verified?: boolean;
}

export interface ExternalLinks {
  music: ExternalLink[];
  info: ExternalLink[];
  social: ExternalLink[];
}

export interface CompanySocialProfile {
  name: string;
  linkedinUrl: string | null;
  instagramUrl: string | null;
}

/**
 * Known LinkedIn company slugs for major music industry companies.
 * These are verified to go directly to the correct company page.
 */
const LINKEDIN_COMPANY_SLUGS: Record<string, string> = {
  // Major labels
  "universal music": "universal-music-group",
  "universal music group": "universal-music-group",
  "umg": "universal-music-group",
  "sony music": "sony-music-entertainment",
  "sony music entertainment": "sony-music-entertainment",
  "warner music": "warner-music-group",
  "warner music group": "warner-music-group",
  "warner records": "warner-records",
  "atlantic records": "atlantic-records",
  "atlantic recording": "atlantic-records",
  "capitol records": "capitol-records",
  "capitol music group": "capitol-music-group",
  "interscope records": "interscope-records",
  "interscope geffen a&m": "interscope-records",
  "republic records": "republic-records",
  "def jam": "def-jam-recordings",
  "def jam recordings": "def-jam-recordings",
  "columbia records": "columbia-records",
  "rca records": "rca-records",
  "epic records": "epic-records",
  "island records": "island-records",
  "emi": "emi-music",
  "parlophone": "parlophone-records",
  "virgin records": "virgin-records",
  "geffen records": "geffen-records",
  "elektra records": "elektra-records",
  "300 entertainment": "300-entertainment",
  "xo records": "xo-records",
  "top dawg entertainment": "txdxe",
  "top dawg": "txdxe",
  "tde": "txdxe",
  "ovo sound": "ovo-sound",
  "good music": "getting-out-our-dreams",
  "young money": "young-money-entertainment",
  "cash money": "cash-money-records",
  "quality control": "quality-control-music",
  "lyor cohen": "300-entertainment",
  // Major publishers
  "sony/atv": "sonyatv",
  "sony atv": "sonyatv",
  "sony music publishing": "sony-music-publishing",
  "universal music publishing": "universal-music-publishing-group",
  "universal music publishing group": "universal-music-publishing-group",
  "umpg": "universal-music-publishing-group",
  "warner chappell": "warner-chappell-music",
  "warner chappell music": "warner-chappell-music",
  "bmg": "bmg-the-new-music-company",
  "bmg rights": "bmg-the-new-music-company",
  "bmg rights management": "bmg-the-new-music-company",
  "kobalt": "kobalt-music",
  "kobalt music": "kobalt-music",
  "concord": "concord-music",
  "concord music": "concord-music",
  "downtown music": "downtown-music",
  "pulse music group": "pulse-music-group",
  "reservoir media": "reservoir-media",
  "hipgnosis": "hipgnosis-songs",
  "hipgnosis songs": "hipgnosis-songs",
  "peermusic": "peermusic",
  "spirit music group": "spirit-music-group",
  "big deal music": "big-deal-music",
  // Indie labels
  "4ad": "4ad-record-label",
  "domino": "domino-recording",
  "domino recording": "domino-recording",
  "xl recordings": "xl-recordings",
  "xl": "xl-recordings",
  "rough trade": "rough-trade-records",
  "rough trade records": "rough-trade-records",
  "secretly group": "secretly-group",
  "secretly canadian": "secretly-canadian",
  "jagjaguwar": "jagjaguwar",
  "dead oceans": "dead-oceans",
  "sub pop": "sub-pop-records",
  "sub pop records": "sub-pop-records",
  "merge records": "merge-records",
  "matador records": "matador-records",
  "matador": "matador-records",
  "warp records": "warp-records",
  "warp": "warp-records",
  "ninja tune": "ninja-tune",
  "stones throw": "stones-throw-records",
  "stones throw records": "stones-throw-records",
  "because music": "because-music",
  "epitaph records": "epitaph-records",
  "epitaph": "epitaph-records",
  "anti-": "anti--records",
  "anti- records": "anti--records",
  "beggars group": "beggars-group",
  "beggars banquet": "beggars-group",
  "young turks": "young",
  "glassnote": "glassnote-entertainment",
  "glassnote records": "glassnote-entertainment",
  "partisan records": "partisan-records",
  "partisan": "partisan-records",
  "dine alone records": "dine-alone-records",
  "arts & crafts": "arts-crafts",
  "arts and crafts": "arts-crafts",
  "kranky": "kranky",
  "ghostly international": "ghostly-international",
  "ghostly": "ghostly-international",
  "captured tracks": "captured-tracks",
  "saddle creek": "saddle-creek",
  "polyvinyl": "polyvinyl-record-co-",
  "polyvinyl records": "polyvinyl-record-co-",
  "loma vista": "loma-vista-recordings",
  "loma vista recordings": "loma-vista-recordings",
  "big machine": "big-machine-label-group",
  "big machine records": "big-machine-label-group",
  "broken bow records": "broken-bow-records",
  "curb records": "curb-records",
  "curb": "curb-records",
  "10k projects": "10k-projects",
  "dreamville": "dreamville-records",
  "dreamville records": "dreamville-records",
  "since the 80s": "since-the-80s",
  "cinematic music group": "cinematic-music-group",
  "mass appeal": "mass-appeal-records",
  "mass appeal records": "mass-appeal-records",
  "rhymesayers": "rhymesayers-entertainment",
  "rhymesayers entertainment": "rhymesayers-entertainment",
  "mello music group": "mello-music-group",
  "mmg": "mello-music-group",
  "dirty hit": "dirty-hit",
  "cooking vinyl": "cooking-vinyl",
  "pias": "pias-group",
  "[pias]": "pias-group",
  "believe": "believe-music",
  "believe music": "believe-music",
  "ditto music": "ditto-music",
  "stem": "stem-disintermedia",
  "stem disintermedia": "stem-disintermedia",
  "symphonic distribution": "symphonic-distribution",
  "symphonic": "symphonic-distribution",
  "amuse": "amuse-io",
  "unitedmasters": "unitedmasters",
  "united masters": "unitedmasters",
  "vydia": "vydia",
  // Hip-hop / R&B labels & management
  "pglang": "pglang",
  "pg lang": "pglang",
  "eardrummers": "eardrummers-entertainment",
  "eardrummers entertainment": "eardrummers-entertainment",
  "eardruma": "eardrummers-entertainment",
  "shady records": "shady-records",
  "shady": "shady-records",
  "g.o.o.d. music": "g-o-o-d-music",
  "getting out our dreams": "g-o-o-d-music",
  "rimas": "rimaspublishing",
  "rimas entertainment": "rimaspublishing",
  "rimas publishing": "rimaspublishing",
  "kemosabe": "kemosabe-records",
  "kemosabe records": "kemosabe-records",
  "maybach music": "maybach-music-group",
  "maybach music group": "maybach-music-group",
  "rostrum records": "rostrum-records",
  "rostrum": "rostrum-records",
  "darkroom records": "darkroom-records",
  "darkroom": "darkroom-records",
  "cactus jack": "cactus-jack",
  "cactus jack records": "cactus-jack",
  "motown": "motown-records",
  "motown records": "motown-records",
  "loverenaissance": "loverenaissance",
  "lvrn": "loverenaissance",
  "south coast music group": "south-coast-music-group",
  "alamo records": "alamo-records",
  "alamo": "alamo-records",
  "visionary music group": "visionary-music-group",
  "vmg": "visionary-music-group",
  "polydor": "polydor-records",
  "polydor records": "polydor-records",
  "virgin music": "virgin-music-group",
  "virgin music group": "virgin-music-group",
  "arista": "arista-records",
  "arista records": "arista-records",
  "jive records": "jive-records",
  "jive": "jive-records",
  "cash money records": "cash-money-records",
  "rca": "rca-records",
  // Management companies
  "roc nation": "roc-nation",
  "salxco": "salxco",
  "first access entertainment": "first-access-entertainment",
  "full stop management": "full-stop-management",
  "maverick management": "maverick",
  "maverick": "maverick",
  "crush music": "crush-music",
  // More publishers
  "reach music": "reach-music-publishing",
  "reach music publishing": "reach-music-publishing",
  "kobalt music publishing": "kobalt-music",
  // Indie publishers
  "anthem entertainment": "anthem-entertainment",
  "anthem": "anthem-entertainment",
  "royalty exchange": "royalty-exchange",
  "primary wave": "primary-wave",
  "primary wave music": "primary-wave",
  "round hill music": "round-hill-music",
  "words & music": "words-music",
  "atlas music publishing": "atlas-music-publishing",
  "position music": "position-music",
  "better noise music": "better-noise-music",
  "tommy boy": "tommy-boy-entertainment",
  "tommy boy music": "tommy-boy-entertainment",
  "prescription songs": "prescription-songs",
  "these are merlin revenues": "merlin-network",
  "merlin": "merlin-network",
  "sentric music": "sentric-music",
  "songtrust": "songtrust",
  "cd baby": "cd-baby",
  "cdbaby": "cd-baby",
  // Distributors / Other
  "the orchard": "the-orchard-music",
  "tunecore": "tunecore",
  "distrokid": "distrokid",
  "awal": "awal",
  "empire": "empire-distribution",
  "empire distribution": "empire-distribution",
  "ingrooves": "ingrooves-music-group",
};

const INSTAGRAM_COMPANY_HANDLES: Record<string, string> = {
  "universal music": "universalmusicgroup",
  "universal music group": "universalmusicgroup",
  "sony music": "sonymusic",
  "sony music entertainment": "sonymusic",
  "warner music": "warnermusic",
  "warner music group": "warnermusic",
  "warner records": "warnerrecords",
  "atlantic records": "atlanticrecords",
  "capitol records": "capitolrecords",
  "capitol music group": "capitolcmg",
  "interscope records": "interscope",
  "republic records": "republicrecords",
  "def jam": "defjam",
  "def jam recordings": "defjam",
  "columbia records": "columbiarecords",
  "rca records": "rcarecords",
  "epic records": "epicrecords",
  "island records": "islandrecords",
  "parlophone": "parlophone",
  "virgin records": "virginrecords",
  "geffen records": "geffenrecords",
  "elektra records": "elektrarecords",
  "xo records": "xorecords",
  "top dawg entertainment": "topdawgent",
  "top dawg": "topdawgent",
  "tde": "topdawgent",
  "ovo sound": "ovosound",
  "young money": "youngmoney",
  "quality control": "qualitycontrolmusic",
  "sony music publishing": "sonymusicpub",
  "universal music publishing": "universalmusicpub",
  "universal music publishing group": "universalmusicpub",
  "warner chappell": "warnerchappellmusic",
  "warner chappell music": "warnerchappellmusic",
  "kobalt": "kobaltmusic",
  "concord": "concord",
  "downtown music": "downtownmusic",
  "pulse music group": "pulsemusicgroup",
  "reservoir media": "reservoirmedia",
  "peermusic": "peermusic",
  "the orchard": "theorchardofficial",
  "tunecore": "tunecore",
  "awal": "awal",
  "empire": "empire",
  "empire distribution": "empire",
  // Indie labels
  "4ad": "4aborhood",
  "xl recordings": "xlrecordings",
  "xl": "xlrecordings",
  "domino": "dominorecordco",
  "domino recording": "dominorecordco",
  "rough trade": "roughtraderecords",
  "rough trade records": "roughtraderecords",
  "sub pop": "subpop",
  "sub pop records": "subpop",
  "merge records": "mergerecords",
  "matador records": "matadorrecords",
  "matador": "matadorrecords",
  "warp records": "warprecords",
  "warp": "warprecords",
  "ninja tune": "ninjatune",
  "stones throw": "stonesthrow",
  "stones throw records": "stonesthrow",
  "because music": "music_because",
  "epitaph records": "epitaphrecords",
  "epitaph": "epitaphrecords",
  "beggars group": "beggarsgroup",
  "glassnote": "glassnoterecords",
  "glassnote records": "glassnoterecords",
  "partisan records": "partisanrecords",
  "partisan": "partisanrecords",
  "ghostly international": "ghostlyintl",
  "ghostly": "ghostlyintl",
  "captured tracks": "capturedtracks",
  "saddle creek": "saddle_creek",
  "polyvinyl": "polyvinylrecords",
  "polyvinyl records": "polyvinylrecords",
  "loma vista": "lomavistarecordings",
  "loma vista recordings": "lomavistarecordings",
  "big machine": "bigmachinelabelgroup",
  "big machine records": "bigmachinelabelgroup",
  "10k projects": "10kprojects",
  "dreamville": "dreamville",
  "dreamville records": "dreamville",
  "mass appeal": "massappeal",
  "mass appeal records": "massappeal",
  "rhymesayers": "rhymesayers",
  "rhymesayers entertainment": "rhymesayers",
  "dirty hit": "dirtyhit",
  "cooking vinyl": "cookingvinyl",
  "pias": "piasgroup",
  "[pias]": "piasgroup",
  "believe": "believemusic",
  "believe music": "believemusic",
  "ditto music": "dittomusic",
  "unitedmasters": "unitedmasters",
  "united masters": "unitedmasters",
  // Hip-hop / R&B labels & management
  "pglang": "pglang",
  "pg lang": "pglang",
  "eardrummers": "mikewillmadeit",
  "eardrummers entertainment": "mikewillmadeit",
  "eardruma": "mikewillmadeit",
  "shady records": "shadyrecords",
  "shady": "shadyrecords",
  "rimas": "rimasentertainment",
  "rimas entertainment": "rimasentertainment",
  "rimas publishing": "rimasentertainment",
  "kemosabe": "kemosaberecords",
  "kemosabe records": "kemosaberecords",
  "maybach music": "maybachmusicgroup",
  "maybach music group": "maybachmusicgroup",
  "rostrum records": "rostrumrecords",
  "rostrum": "rostrumrecords",
  "cactus jack": "cactusjack",
  "cactus jack records": "cactusjack",
  "motown": "motown",
  "motown records": "motown",
  "loverenaissance": "lvrn",
  "lvrn": "lvrn",
  "south coast music group": "southcoastmusicgroup",
  "alamo records": "alamorecords",
  "alamo": "alamorecords",
  "polydor": "polydorrecords",
  "polydor records": "polydorrecords",
  "virgin music": "virginmusic",
  "virgin music group": "virginmusic",
  "arista": "aristarecords",
  "arista records": "aristarecords",
  "cash money": "cashmoney",
  "cash money records": "cashmoney",
  "rca": "rcarecords",
  // Management companies
  "roc nation": "rocnation",
  "full stop management": "fullstopmanagement",
  // Indie publishers
  "primary wave": "primarywave",
  "primary wave music": "primarywave",
  "round hill music": "roundhillmusic",
  "position music": "positionmusic",
  "songtrust": "songtrust",
  "cd baby": "cdbaby",
  "cdbaby": "cdbaby",
  "sentric music": "sentricmusic",
};

const ARTIST_SOCIAL_OVERRIDES: Record<string, Partial<Record<string, string>>> = {
  "kendrick lamar": {
    instagram: "https://www.instagram.com/kendricklamar/",
    youtube: "https://www.youtube.com/channel/UC3lBXcrKFnFAFkfVk5WuKcQ",
  },
  "kendrick duckworth": {
    instagram: "https://www.instagram.com/kendricklamar/",
    youtube: "https://www.youtube.com/channel/UC3lBXcrKFnFAFkfVk5WuKcQ",
  },
};

function normalizeLookupValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function splitCompanyNames(value: string): string[] {
  return value
    .split(/[;,|]+/)
    .flatMap((part) => part.split(/\s+\/\s+/))
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveMappedValue(input: string, directory: Record<string, string>): string | null {
  const normalizedInput = normalizeLookupValue(input);
  if (!normalizedInput) return null;

  let bestPartialMatch: { mappedValue: string; score: number } | null = null;

  for (const [key, mappedValue] of Object.entries(directory)) {
    const normalizedKey = normalizeLookupValue(key);
    if (!normalizedKey) continue;

    if (normalizedInput === normalizedKey) {
      return mappedValue;
    }

    if (normalizedKey.length >= 4 && (normalizedInput.includes(normalizedKey) || normalizedKey.includes(normalizedInput))) {
      if (!bestPartialMatch || normalizedKey.length > bestPartialMatch.score) {
        bestPartialMatch = { mappedValue, score: normalizedKey.length };
      }
    }
  }

  return bestPartialMatch?.mappedValue ?? null;
}

function buildLinkedInCompanyUrl(slug: string | null): string | null {
  return slug ? `https://www.linkedin.com/company/${slug}` : null;
}

function buildInstagramCompanyUrl(handle: string | null): string | null {
  return handle ? `https://www.instagram.com/${handle}/` : null;
}

export function getCompanySocialProfiles(company: string): CompanySocialProfile[] {
  const candidates = splitCompanyNames(company);
  const seen = new Set<string>();

  return (candidates.length > 0 ? candidates : [company]).flatMap((candidate) => {
    const linkedinUrl = buildLinkedInCompanyUrl(resolveMappedValue(candidate, LINKEDIN_COMPANY_SLUGS));
    const instagramUrl = buildInstagramCompanyUrl(resolveMappedValue(candidate, INSTAGRAM_COMPANY_HANDLES));

    if (!linkedinUrl && !instagramUrl) return [];

    const profile: CompanySocialProfile = {
      name: candidate.trim(),
      linkedinUrl,
      instagramUrl,
    };

    const dedupeKey = `${normalizeLookupValue(profile.name)}|${profile.linkedinUrl ?? ""}|${profile.instagramUrl ?? ""}`;
    if (seen.has(dedupeKey)) return [];

    seen.add(dedupeKey);
    return [profile];
  });
}

/**
 * Get a verified LinkedIn company page URL for a given company name.
 * Returns null when no verified company page is known.
 */
export function getLinkedInCompanyUrl(company: string): string | null {
  return getCompanySocialProfiles(company).find((profile) => profile.linkedinUrl)?.linkedinUrl ?? null;
}

/**
 * Get a verified Instagram company profile URL for a given company name.
 * Returns null when no verified company page is known.
 */
export function getInstagramCompanyUrl(company: string): string | null {
  return getCompanySocialProfiles(company).find((profile) => profile.instagramUrl)?.instagramUrl ?? null;
}

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidVerifiedSocialUrl(platform: string, url: string): boolean {
  if (!isValidHttpUrl(url)) return false;

  switch (platform) {
    case "twitter":
    case "x":
      return /^https?:\/\/(www\.)?(x\.com|twitter\.com)\/(?!search\b)(?!home\b)[^/?#]+/i.test(url);
    case "facebook":
      return /^https?:\/\/(www\.)?facebook\.com\/(?!search\b)(?!watch\b)(?!share\b)[^/?#]+/i.test(url);
    case "soundcloud":
      return /^https?:\/\/(www\.)?soundcloud\.com\/(?!search\b)[^?#]+/i.test(url);
    case "website":
      return true;
    default: {
      const result = validateSocialUrl(url);
      return result.valid && result.platform === platform;
    }
  }
}

export function getSanitizedArtistSocialLinks(name: string, verifiedSocial?: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const merged = {
    ...(verifiedSocial ?? {}),
    ...(ARTIST_SOCIAL_OVERRIDES[normalizeLookupValue(name)] ?? {}),
  };

  for (const [key, value] of Object.entries(merged)) {
    if (!value) continue;
    const normalizedKey = key.toLowerCase();
    const platform = normalizedKey === "x" ? "twitter" : normalizedKey;

    if (isValidVerifiedSocialUrl(platform, value)) {
      sanitized[normalizedKey] = value;
    }
  }

  if (sanitized.x && !sanitized.twitter) sanitized.twitter = sanitized.x;
  if (sanitized.twitter && !sanitized.x) sanitized.x = sanitized.twitter;

  return sanitized;
}

const buildPlatformSearchUrl = (platform: string, name: string) => {
  const encodedName = encodeURIComponent(name);

  switch (platform) {
    case "instagram":
      // Use Instagram search instead of guessing profile URLs (which often land on wrong accounts)
      return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(name)}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${encodedName}&sp=EgIQAg%253D%253D`;
    case "tiktok":
      return `https://www.tiktok.com/search/user?q=${encodedName}`;
    case "facebook":
      return `https://www.facebook.com/search/people/?q=${encodedName}`;
    default:
      return `https://www.bing.com/search?q=${encodedName}`;
  }
};

export const getExternalLinks = (name: string, verifiedSocial?: Record<string, string>, spotifyArtistId?: string, appleArtistId?: string): ExternalLinks => {
  const encodedName = encodeURIComponent(name);
  const sanitizedSocial = getSanitizedArtistSocialLinks(name, verifiedSocial);

  // Spotify: prefer direct artist page via ID, then verified social, then search
  const spotifyUrl = spotifyArtistId
    ? `https://open.spotify.com/artist/${spotifyArtistId}`
    : sanitizedSocial.spotify
      ? sanitizedSocial.spotify
      : `https://open.spotify.com/search/${encodedName}/artists`;

  // Genius: prefer verified link, then try artist page slug, then search fallback
  const geniusSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const geniusUrl = sanitizedSocial.genius
    ? sanitizedSocial.genius
    : `https://genius.com/artists/${geniusSlug}`;

  const social: ExternalLink[] = [
    {
      label: "Instagram",
      url: sanitizedSocial.instagram || buildPlatformSearchUrl("instagram", name),
      icon: Instagram,
      verified: !!sanitizedSocial.instagram,
    },
    {
      label: "X (Twitter)",
      url: sanitizedSocial.twitter || sanitizedSocial.x || `https://x.com/search?q=${encodedName}&src=typed_query&f=user`,
      icon: Twitter,
      verified: !!sanitizedSocial.twitter || !!sanitizedSocial.x,
    },
    {
      label: "YouTube",
      url: sanitizedSocial.youtube || buildPlatformSearchUrl("youtube", name),
      icon: Youtube,
      verified: !!sanitizedSocial.youtube,
    },
    {
      label: "TikTok",
      url: sanitizedSocial.tiktok || buildPlatformSearchUrl("tiktok", name),
      icon: Globe,
      verified: !!sanitizedSocial.tiktok,
    },
    {
      label: "Facebook",
      url: sanitizedSocial.facebook || buildPlatformSearchUrl("facebook", name),
      icon: Globe,
      verified: !!sanitizedSocial.facebook,
    },
  ];

  return {
    music: [
      { label: "Spotify", url: spotifyUrl, icon: Music, verified: !!spotifyArtistId || !!sanitizedSocial.spotify },
      { label: "Apple Music", url: appleArtistId ? `https://music.apple.com/us/artist/${appleArtistId}` : `https://music.apple.com/us/search?term=${encodedName}`, icon: Music, verified: !!appleArtistId },
      { label: "Tidal", url: `https://listen.tidal.com/search?q=${encodedName}`, icon: Music },
      { label: "Amazon Music", url: `https://music.amazon.com/search/${encodedName}`, icon: Music },
      { label: "YouTube Music", url: `https://music.youtube.com/search?q=${encodedName}`, icon: Youtube },
      { label: "Deezer", url: `https://www.deezer.com/search/${encodedName}/artist`, icon: Music },
      { label: "SoundCloud", url: `https://soundcloud.com/search/people?q=${encodedName}`, icon: Music },
      { label: "Pandora", url: `https://www.pandora.com/search/${encodedName}/artists`, icon: Music },
      { label: "Audiomack", url: `https://audiomack.com/search?q=${encodedName}`, icon: Music },
      { label: "Bandcamp", url: `https://bandcamp.com/search?q=${encodedName}&item_type=b`, icon: Music },
    ],
    info: [
      { label: "Genius", url: geniusUrl, icon: Globe, verified: !!sanitizedSocial.genius },
      { label: "AllMusic", url: `https://www.allmusic.com/search/artists/${encodedName}`, icon: Globe },
      { label: "Discogs", url: `https://www.discogs.com/search/?q=${encodedName}&type=artist`, icon: Globe },
      { label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${encodedName.replace(/%20/g, '_')}`, icon: Globe },
    ],
    social,
  };
};
