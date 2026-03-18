import { Music, Globe, Instagram, Twitter, Youtube } from "lucide-react";

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
  "top dawg entertainment": "top-dawg-entertainment",
  "tde": "top-dawg-entertainment",
  "aftermath entertainment": "aftermath-entertainment",
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
  "bmg": "bmg-rights-management",
  "bmg rights management": "bmg-rights-management",
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
  // Distributors / Other
  "the orchard": "the-orchard-music",
  "tunecore": "tunecore",
  "distrokid": "distrokid",
  "awal": "awal",
  "empire": "empire-distribution",
  "empire distribution": "empire-distribution",
  "ingrooves": "ingrooves-music-group",
};

/**
 * Get a verified LinkedIn company page URL for a given company name.
 * Returns null when no verified company page is known.
 */
export function getLinkedInCompanyUrl(company: string): string | null {
  const normalized = company.toLowerCase().trim();

  if (LINKEDIN_COMPANY_SLUGS[normalized]) {
    return `https://www.linkedin.com/company/${LINKEDIN_COMPANY_SLUGS[normalized]}`;
  }

  for (const [key, slug] of Object.entries(LINKEDIN_COMPANY_SLUGS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return `https://www.linkedin.com/company/${slug}`;
    }
  }

  return null;
}

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
  "ovo sound": "ovosound",
  "young money": "youngmoney",
  "quality control": "qualitycontrolmusic",
  "sony music publishing": "sonymusicpub",
  "universal music publishing": "universalmusicpub",
  "universal music publishing group": "universalmusicpub",
  "warner chappell": "warnerchappellmusic",
  "warner chappell music": "warnerchappellmusic",
  "bmg": "bmg",
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
};

/**
 * Get a verified Instagram company profile URL for a given company name.
 * Returns null when no verified company page is known.
 */
export function getInstagramCompanyUrl(company: string): string | null {
  const normalized = company.toLowerCase().trim();

  if (INSTAGRAM_COMPANY_HANDLES[normalized]) {
    return `https://www.instagram.com/${INSTAGRAM_COMPANY_HANDLES[normalized]}`;
  }

  for (const [key, handle] of Object.entries(INSTAGRAM_COMPANY_HANDLES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return `https://www.instagram.com/${handle}`;
    }
  }

  return null;
}


const buildPlatformSearchUrl = (platform: string, name: string) => {
  const encodedName = encodeURIComponent(name);

  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/explore/search/keyword/?q=${encodedName}`;
    case "youtube":
      // Use YouTube channel search — @handle guessing is unreliable and leads to 404s
      return `https://www.youtube.com/results?search_query=${encodedName}&sp=EgIQAg%253D%253D`;
    case "tiktok":
      // Use TikTok user search — @handle guessing is unreliable
      return `https://www.tiktok.com/search/user?q=${encodedName}`;
    case "facebook":
      return `https://www.facebook.com/search/people/?q=${encodedName}`;
    default:
      return `https://www.bing.com/search?q=${encodedName}`;
  }
};

export const getExternalLinks = (name: string, verifiedSocial?: Record<string, string>): ExternalLinks => {
  const encodedName = encodeURIComponent(name);
  const slugName = name.replace(/\s+/g, '-').toLowerCase();

  const social: ExternalLink[] = [
    {
      label: "Instagram",
      url: verifiedSocial?.instagram || buildPlatformSearchUrl("instagram", name),
      icon: Instagram,
      verified: !!verifiedSocial?.instagram,
    },
    {
      label: "X (Twitter)",
      url: verifiedSocial?.twitter || verifiedSocial?.x || `https://x.com/search?q=${encodedName}&src=typed_query&f=user`,
      icon: Twitter,
      verified: !!verifiedSocial?.twitter || !!verifiedSocial?.x,
    },
    {
      label: "YouTube",
      url: verifiedSocial?.youtube || buildPlatformSearchUrl("youtube", name),
      icon: Youtube,
      verified: !!verifiedSocial?.youtube,
    },
    {
      label: "TikTok",
      url: verifiedSocial?.tiktok || buildPlatformSearchUrl("tiktok", name),
      icon: Globe,
      verified: !!verifiedSocial?.tiktok,
    },
    {
      label: "Facebook",
      url: verifiedSocial?.facebook || buildPlatformSearchUrl("facebook", name),
      icon: Globe,
      verified: !!verifiedSocial?.facebook,
    },
  ];

  return {
    music: [
      { label: "Spotify", url: `https://open.spotify.com/search/${encodedName}/artists`, icon: Music },
      { label: "Apple Music", url: `https://music.apple.com/us/search?term=${encodedName}`, icon: Music },
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
      { label: "Genius", url: `https://genius.com/artists/${slugName}`, icon: Globe },
      { label: "AllMusic", url: `https://www.allmusic.com/search/artists/${encodedName}`, icon: Globe },
      { label: "Discogs", url: `https://www.discogs.com/search/?q=${encodedName}&type=artist`, icon: Globe },
      { label: "Wikipedia", url: `https://en.wikipedia.org/wiki/${encodedName.replace(/%20/g, '_')}`, icon: Globe },
    ],
    social,
  };
};
