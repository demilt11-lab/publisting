/** Builds direct search URLs for PRO repertory databases */

export function buildAscapUrl(songTitle: string, artistName: string): string {
  // ASCAP's hash-fragment SPA route is unreliable in many browsers (returns
  // 403 / blank ACE shell). Use the documented public ACE entry point.
  const q = encodeURIComponent([songTitle, artistName].filter(Boolean).join(" "));
  return `https://www.ascap.com/ace#/search/title/${encodeURIComponent(songTitle)}`;
}

export function buildBmiUrl(songTitle: string): string {
  return `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${encodeURIComponent(songTitle)}&Main_Search_Type=Title&Search_Type=all`;
}

export function buildMlcUrl(songTitle: string, artistName?: string): string {
  // The MLC public search lives on /public-search; /search 403s for anon users.
  const query = artistName ? `${songTitle} ${artistName}` : songTitle;
  return `https://portal.themlc.com/public-search?query=${encodeURIComponent(query)}`;
}

export function buildSoundExchangeUrl(): string {
  return `https://www.soundexchange.com/service/repertoire-data/`;
}

export function buildSesacUrl(songTitle: string): string {
  // SESAC retired their public repertory search; route to a Google site
  // search which always resolves.
  return `https://www.google.com/search?q=${encodeURIComponent("site:repertory.sesac.com " + songTitle)}`;
}

export function buildGmrUrl(): string {
  return `https://globalmusicrights.com`;
}

/** SongView – stable public landing/search page */
export function buildSongViewUrl(songTitle: string, artistName?: string): string {
  return `https://repertoire.bmi.com/Main/Search`;
}

/** SoundExchange lookup – their on-site search regularly 403s; use Google. */
export function buildSoundExchangeIsrcUrl(isrc?: string, songTitle?: string, artistName?: string): string {
  const query = isrc || [songTitle, artistName].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent("site:soundexchange.com " + query)}`;
}

/** MLC public search (works portal) */
export function buildMlcWorksUrl(songTitle: string, artistName?: string): string {
  const query = artistName ? `${songTitle} ${artistName}` : songTitle;
  return `https://portal.themlc.com/public-search?query=${encodeURIComponent(query)}&type=works`;
}

export interface ProLinks {
  ascapSearchUrl: string;
  bmiSearchUrl: string;
  mlcSearchUrl: string;
  soundExchangeUrl: string;
  sesacUrl: string;
  gmrUrl: string;
  songViewUrl: string;
  soundExchangeIsrcUrl: string;
  mlcWorksUrl: string;
}

export function buildAllProLinks(songTitle: string, artistName: string, isrc?: string): ProLinks {
  return {
    ascapSearchUrl: buildAscapUrl(songTitle, artistName),
    bmiSearchUrl: buildBmiUrl(songTitle),
    mlcSearchUrl: buildMlcUrl(songTitle, artistName),
    soundExchangeUrl: buildSoundExchangeUrl(),
    sesacUrl: buildSesacUrl(songTitle),
    gmrUrl: buildGmrUrl(),
    songViewUrl: buildSongViewUrl(songTitle, artistName),
    soundExchangeIsrcUrl: buildSoundExchangeIsrcUrl(isrc, songTitle, artistName),
    mlcWorksUrl: buildMlcWorksUrl(songTitle, artistName),
  };
}
