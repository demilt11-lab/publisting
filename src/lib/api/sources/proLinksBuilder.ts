/** Builds direct search URLs for PRO repertory databases */

export function buildAscapUrl(songTitle: string, artistName: string): string {
  const q = encodeURIComponent(`${songTitle} ${artistName}`);
  return `https://www.ascap.com/repertory#/ace/search/title/${encodeURIComponent(songTitle)}`;
}

export function buildBmiUrl(songTitle: string): string {
  return `https://repertoire.bmi.com/Search/Search?Main_Search_Text=${encodeURIComponent(songTitle)}&Main_Search_Type=Title&Search_Type=all`;
}

export function buildMlcUrl(songTitle: string, artistName?: string): string {
  const query = artistName ? `${songTitle} ${artistName}` : songTitle;
  return `https://portal.themlc.com/search?query=${encodeURIComponent(query)}`;
}

export function buildSoundExchangeUrl(): string {
  return `https://www.soundexchange.com/artist-copyright-owner/`;
}

export function buildSesacUrl(songTitle: string): string {
  return `https://www.sesac.com/repertory/search?query=${encodeURIComponent(songTitle)}`;
}

export function buildGmrUrl(): string {
  return `https://globalmusicrights.com`;
}

/** SongView – unified ASCAP/BMI/SESAC search */
export function buildSongViewUrl(songTitle: string, artistName?: string): string {
  const query = artistName ? `${songTitle} ${artistName}` : songTitle;
  return `https://www.songview.org/search?query=${encodeURIComponent(query)}`;
}

/** SoundExchange ISRC lookup */
export function buildSoundExchangeIsrcUrl(isrc?: string, songTitle?: string, artistName?: string): string {
  if (isrc) {
    return `https://isrc.soundexchange.com/#!/search/isrc/${encodeURIComponent(isrc)}`;
  }
  const q = artistName ? `${songTitle} ${artistName}` : (songTitle || '');
  return `https://isrc.soundexchange.com/#!/search/sound-recording/${encodeURIComponent(q)}`;
}

/** MLC public search (works portal) */
export function buildMlcWorksUrl(songTitle: string, artistName?: string): string {
  const query = artistName ? `${songTitle} ${artistName}` : songTitle;
  return `https://portal.themlc.com/search?query=${encodeURIComponent(query)}&type=works`;
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
