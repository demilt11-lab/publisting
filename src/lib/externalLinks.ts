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

const buildPlatformSearchUrl = (platform: string, name: string) => {
  const encodedName = encodeURIComponent(name);
  const spacedName = encodedName.replace(/%20/g, "+");

  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/explore/search/keyword/?q=${encodedName}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${spacedName}&sp=EgIQAg%253D%253D`;
    case "tiktok":
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
