import { Music, Globe, Instagram, Twitter, Youtube } from "lucide-react";

export interface ExternalLink {
  label: string;
  url: string;
  icon: typeof Music;
}

export interface ExternalLinks {
  music: ExternalLink[];
  info: ExternalLink[];
  social: ExternalLink[];
}

export const getExternalLinks = (name: string): ExternalLinks => {
  const encodedName = encodeURIComponent(name);
  const spacedName = encodedName.replace(/%20/g, '+');
  const handleName = name.replace(/\s+/g, '').toLowerCase();
  const slugName = name.replace(/\s+/g, '-').toLowerCase();

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
    social: [
      { label: "Instagram", url: `https://www.instagram.com/${handleName}`, icon: Instagram },
      { label: "X (Twitter)", url: `https://x.com/${handleName}`, icon: Twitter },
      { label: "YouTube", url: `https://www.youtube.com/results?search_query=${spacedName}&sp=EgIQAg%253D%253D`, icon: Youtube },
      { label: "TikTok", url: `https://www.tiktok.com/@${handleName}`, icon: Globe },
      { label: "Facebook", url: `https://www.facebook.com/search/top/?q=${encodedName}`, icon: Globe },
      { label: "LinkedIn", url: `https://www.linkedin.com/search/results/all/?keywords=${encodedName}`, icon: Globe },
    ],
  };
};
