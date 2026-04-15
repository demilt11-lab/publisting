const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ========== KNOWN PUBLISHERS (used for regex matching across all search results) ==========
const KNOWN_PUBLISHERS: string[] = [
  // === US MAJORS & LARGE ===
  'Sony/ATV', 'Sony Music Publishing', 'Universal Music Publishing', 'Warner Chappell',
  'Kobalt Music', 'Kobalt', 'BMG Rights', 'BMG', 'Downtown Music', 'Concord Music',
  'Primary Wave', 'Hipgnosis', 'Spirit Music', 'Pulse Music Publishing', 'Pulse Music Group',
  'Pulse Music', 'Pulse Records', 'Reservoir Media', 'Big Deal Music', 'Anthem Entertainment',
  'peermusic', 'UMPG', 'WCM', 'Prescription Songs', 'Roc Nation Publishing',
  'TuneCore Publishing', 'Warner Music Publishing', 'Stellar Songs', 'Round Hill Music',
  'Atlas Music Publishing', 'Artist Publishing Group', 'Reach Music', 'Tempo Music',
  'EMI Music Publishing', 'Cherry Lane Music', 'Famous Music', 'Windswept', 'Imagem',
  'Chrysalis', 'Notting Hill Music', 'Wixen Music', 'DistroKid Publishing',
  'CD Baby Publishing', 'Songtrust', 'Sentric Music', 'Secretly Publishing',
  'Sub Pop Publishing', 'Domino Publishing', 'Beggars Music', '4AD Music',
  'XL Recordings Publishing', 'Lyric Financial', 'Position Music',
  'Patriot Games Publishing', 'Words & Music', 'These Are Songs', 'Almo Music',
  'Irving Music', 'Rondor Music', 'Windswept Pacific', 'Bug Music', 'Stage Three Music',
  'Songs of Peer', 'Royalty Exchange', 'Audiam',
  // === US MID-TIER & INDEPENDENT ===
  'Paq Publishing', 'Paq Pub', 'Milk & Honey Music', 'Hallwood Publishing',
  'One RPM Publishing', 'OneRPM', 'Create Music Publishing', 'Create Music Group',
  'Cinq Music', 'Vydia Publishing', 'Stem Publishing', 'Stem Disintermedia',
  'United Masters Publishing', 'UnitedMasters', 'AWAL Publishing', 'AWAL',
  'Empire Publishing', 'EMPIRE Distribution', 'EMPIRE Music', 'Quality Control Music',
  'QC Music', 'South Coast Music', 'Motown Gospel', 'Bethel Music Publishing',
  'Capitol CMG', 'Hillsong Publishing', 'Integrity Music', 'Essential Music Publishing',
  'Curb Word Music', 'Big Machine Music', 'River House Publishing', 'Smack Songs',
  'Great Elm Music', 'Razor & Tie Music', 'Tommy Boy Music', 'Rawkus Publishing',
  'Mass Appeal Records', 'Stones Throw Publishing', 'Rhymesayers Publishing',
  'Strange Music Publishing', 'Mello Music Publishing', 'Fat Beats Publishing',
  'Dim Mak Publishing', 'Ultra Music Publishing', 'Ultra Records',
  'Armada Music Publishing', 'Armada Music', 'Monstercat Publishing',
  'Astralwerks Publishing', 'Anjunabeats Publishing', 'Anjunadeep Publishing',
  'Loma Vista Publishing', 'Partisan Publishing', 'Merge Publishing',
  'Matador Publishing', 'Jagjaguwar Publishing', 'Dead Oceans Publishing',
  'Captured Tracks Publishing', 'Sacred Bones Publishing', 'Mexican Summer Publishing',
  'Saddle Creek Publishing', 'Polyvinyl Publishing', 'Epitaph Publishing',
  'Fearless Publishing', 'Rise Publishing', 'Fueled By Ramen Publishing',
  'Hopeless Publishing', 'Pure Noise Publishing', 'Run For Cover Publishing',
  'Glassnote Publishing', 'Thirty Tigers Publishing', 'Dualtone Publishing',
  'Rounder Publishing', 'New West Publishing', 'Yep Roc Publishing',
  'Thrill Jockey Publishing', 'Drag City Publishing', 'Touch and Go Publishing',
  // === INDIA (expanded) ===
  'T-Series Publishing', 'T-Series', 'Saregama', 'Tips Music', 'Tips Industries',
  'Zee Music', 'Speed Records', 'Rehaan Records', 'Brown Boys Music',
  'Desi Melodies', 'Jass Records', 'White Hill Music', 'Anand Audio',
  'Lahari Music', 'Aditya Music', 'Mango Music', 'Sun Music', 'Think Music',
  'Believe Music', 'Gima Music', 'Mass Entertainment', 'Muzik247', 'Jungle Entertainment',
  'Eros Music', 'Yash Raj Music', 'YRF Music', 'Sony Music India',
  'Universal Music India', 'Warner Music India', 'Virgin Music India',
  'Hungama Music', 'Pen Studios Music', 'Pen Music', 'Venus Music',
  'Goldmines Telefilms', 'Shemaroo Music', 'Ultra Music India', 'Bhansali Music',
  'Dharma Music', 'Ishtar Music', 'Divo Music', 'Think Indie', 'Amara Muzik',
  'Panorama Music', 'Crescendo Music', 'Hitz Music', 'Saga Music',
  'Moviebox Records', 'Humble Music', 'Brown Studios', 'Gold Media',
  'VIP Records India', 'Lokdhun', 'Unisys Music', 'AB Music',
  'Kalamkaar', 'Bantai Records', 'Mass Appeal India', 'Azadi Records',
  // === AFRICA (expanded) ===
  'Africori', 'Chocolate City Music', 'Mavin Publishing', 'Davido Music Worldwide',
  'Starboy Entertainment', 'Aristokrat Records', 'EbonyLife Music', 'Jonzing World',
  'Spaceship Publishing', 'Soulistic Music', 'Kalawa Jazmee', 'Ambitiouz Entertainment',
  'Universal Music Africa', 'Africanism', 'Spirit of Africa Music',
  'YBNL Nation', 'DMW Publishing', 'Penthauze Music', 'Five Star Music',
  'HKN Music', 'Empire Mates Entertainment', 'EME Music', 'Storm Records Africa',
  'P-Classic Records', 'Effyzzie Music', 'Flytime Music',
  'G-Worldwide Entertainment', 'Triple MG', 'Northside Music', 'Native Records',
  'emPawa Africa', 'Platoon Africa', 'Spaceship Collective',
  'Sony Music West Africa', 'Universal Music Nigeria', 'Warner Music Africa',
  'Ziiki Media', 'Boomplay Music', 'Gallo Music Publishing',
  'Sheer Publishing', 'Select Music Africa', 'Electromode Publishing',
  'Coleske Artists', 'David Gresham Publishing', 'Muthaland Entertainment',
  'Next Level Music Africa', 'Mdundo Music',
  // === UK (expanded) ===
  'Because Music', 'Parlophone UK', 'Island Music', 'Polydor',
  'Virgin EMI', 'Warner Music UK', 'Sony Music UK', 'Universal Music UK',
  'Atlantic UK', 'Columbia UK', 'Ministry of Sound', 'Mute Records',
  'Rough Trade Publishing', 'Hospital Records', 'Ram Records', 'Cooking Vinyl',
  'Ninja Tune', 'Transgressive Music', 'Young Turks', 'Dirty Hit Publishing',
  'Good Soldier Songs', 'Reservoir UK', 'Kobalt UK', 'BMG UK',
  'Warner Chappell UK', 'Peermusic UK', 'Bucks Music', 'Westbury Music',
  'Spirit B-Unique', 'Warp Publishing', 'Rokstone Music', 'TaP Music Publishing',
  'First Access Publishing', 'Since 93 Publishing', 'Relentless Publishing',
  'Disturbing London Publishing', 'Black Butter Publishing', 'Rinse Publishing',
  'Hyperdub Publishing', 'XL Publishing', 'Heavenly Publishing',
  'Rough Trade Songs', 'Domino Songs', 'Bella Union Publishing',
  'Memphis Industries Publishing', 'Moshi Moshi Publishing',
  'Lucky Number Publishing', 'Communion Publishing',
  'Candid Publishing', 'Concord Music UK', 'Mushroom Publishing UK',
  'Good Soldier Publishing', 'Polydor Publishing', 'Island Publishing',
  'Absolute Publishing', 'Perfect Songs', 'Complete Music Publishing',
  'Universal Publishing UK', 'Stage Three UK', 'Method Publishing',
  'Reverb Music Publishing', 'Ditto Music Publishing', 'Ditto Publishing',
  'PIAS Publishing', 'Believe Publishing UK', 'The Orchard UK',
  // === LATIN AMERICA (expanded) ===
  'Sony Music Latin', 'Universal Music Latin', 'Warner Music Latina', 'Warner Music Latin',
  'Rimas Publishing', 'Rimas Entertainment', 'Rich Music', 'Tainy Music', 'Flow Music',
  'WK Records', 'Saban Music', 'Carbon Fiber Music', 'Vibras Lab', 'White Lion Audio',
  'La Industria Inc', 'Hear This Music', 'Gold2 Publishing', 'Dimelo Vi Publishing',
  'Neon16 Publishing', 'Duars Entertainment', 'Pina Records Publishing',
  'Glad Empire Publishing', 'Noah Assad Publishing', 'Los Legendarios Publishing',
  'Ovy On The Drums Publishing', 'Sky Rompiendo Publishing',
  'Mambo Kingz Publishing', 'El Cartel Publishing', 'Mas Flow Publishing',
  'VI Music Publishing', 'Magnus Music Publishing', 'Bull Nene Publishing',
  // === MEXICO (expanded) ===
  'Sony Music Mexico', 'Universal Music Mexico', 'Warner Music Mexico',
  'DISA Publishing', 'Fonovisa Publishing', 'Machete Music',
  'DEL Records', 'Rancho Humilde', 'Lumbre Music', 'Mas Label', 'Lizos Music',
  'Street Mob Records', 'Cardenas Marketing Network',
  'Ediciones Pentagrama', 'Editora Musical Aries', 'Multimusic Publishing',
  'Corona Music Publishing', 'Peermusic Mexico', 'Warner Chappell Mexico',
  'Sony Music Publishing Mexico', 'Tamarindo Music', 'JG Music Publishing',
  'Remex Music', 'Azteca Music Publishing', 'Sniper Music Publishing',
  'JOP Music Publishing', 'Skalona Music',
  // === CANADA (expanded) ===
  'Nettwerk Music', 'Arts & Crafts', 'Last Gang', 'MapleCore',
  'True North Records', 'Stingray Music', 'Entertainment One', 'eOne Music',
  'Coalition Music', 'Six Shooter Records', 'Indica Records', 'Dine Alone Music',
  'Paper Bag Records', 'Royal Mountain Records', 'Monstercat',
  'Third Side Music', 'Secret City Records Publishing', 'Bonsound Publishing',
  'Outside Music', 'CYMBA Music Publishing', 'Aporia Publishing',
  'Next Door Music', 'We Are Busy Bodies Publishing', 'Telephone Explosion Publishing',
  'Flemish Eye Publishing', 'Slaight Music Publishing', 'Big Machine Canada',
  'Universal Music Canada', 'Sony Music Canada', 'Warner Music Canada',
  // === KOREA (expanded) ===
  'SM Entertainment Publishing', 'SM Publishing', 'JYP Publishing', 'YG Publishing',
  'HYBE Publishing', 'Big Hit Music Publishing', 'Kakao Entertainment', 'CJ ENM Music',
  'Genie Music Publishing', 'Dreamus', 'Stone Music Publishing', 'Cube Entertainment',
  'Starship Entertainment', 'FNC Entertainment', 'Pledis Entertainment',
  'AOMG', 'H1GHR Music', 'KOZ Entertainment',
  'YG Plus Publishing', 'Belift Lab Publishing', 'Source Music Publishing',
  'ADOR Publishing', 'KQ Entertainment Publishing', 'RBW Publishing',
  'WM Entertainment Publishing', 'IST Entertainment Publishing',
  'Jellyfish Entertainment Publishing', 'Woollim Entertainment Publishing',
  'Brand New Music Publishing', 'P Nation Publishing', 'ABYSS Publishing',
  'Mystic Story Publishing', 'Antenna Music Publishing', 'HIGHGRND Publishing',
  'Fantagio Music Publishing', 'PlayM Publishing', 'Music Works Publishing',
  'Show Note Publishing', 'Million Market Publishing', 'Grandline Publishing',
  'Pocketdol Studio Publishing',
  // === CHINA (expanded) ===
  'Tencent Music Publishing', 'Tencent Music', 'NetEase Music Publishing',
  'NetEase Cloud Music', 'Ali Music', 'Alibaba Music', 'China Record Group',
  'China Music Corp', 'Modern Sky', 'Taihe Music Group', 'Rock Records',
  'EE-Media', 'Decca China', 'Huayi Music', 'Shanghai Synergy Culture',
  'Maybe Mars Publishing', 'Midi Music Publishing', 'Tree Music Publishing',
  'HIM International Music', 'Gold Typhoon Publishing', 'Universal Music China',
  'Sony Music China', 'Warner Music China', 'EMI China', 'BMG China',
  'Feng Hua Publishing', 'Linfair Publishing', 'Emperor Entertainment Publishing',
  'Media Asia Music Publishing', 'Ocean Butterflies Publishing',
  'Kanjian Music Publishing', 'QQ Music Publishing', 'DNV Music Publishing',
  'Simple Joy Publishing',
  // === JAPAN ===
  'Avex Publishing', 'Avex Entertainment', 'Avex Trax', 'Sony Music Japan',
  'Universal Music Japan', 'Warner Music Japan', 'EMI Music Japan',
  'Victor Entertainment Publishing', 'JVC Kenwood Publishing', 'King Records Publishing',
  'Pony Canyon Publishing', 'Nippon Columbia Publishing', 'Being Inc Publishing',
  'Giza Studio Publishing', 'B-Gram Publishing', 'Stardust Publishing',
  'Johnny & Associates Publishing', 'J Storm Publishing', 'Amuse Publishing',
  'LDH Music Publishing', 'Exile Music Publishing', 'Up-Front Publishing',
  'Hello! Project Publishing', 'Lantis Publishing', 'Aniplex Publishing',
  'Bandai Namco Music Publishing', 'Square Enix Music Publishing',
  'Konami Music Publishing', 'Capcom Music Publishing',
  'Toy\'s Factory Publishing', 'Ki/oon Publishing', 'DefSTAR Publishing',
  'Sacra Music Publishing', 'Sony Music Labels Publishing',
  'Tower Records Publishing', 'Space Shower Music Publishing',
  'Yamaha Music Publishing', 'Nichion Publishing', 'Shinko Music Publishing',
  'Fuji Pacific Music Publishing', 'TV Asahi Music Publishing',
  'NHK Publishing', 'TBS Music Publishing', 'Nippon TV Music Publishing',
  'Teichiku Publishing', 'Crown Records Publishing', 'Tokuma Japan Publishing',
  'Geneon Publishing', 'Movic Publishing', 'Sunrise Music Publishing',
  'Kadokawa Music Publishing', 'Dwango Music Publishing',
  // === SOUTHEAST ASIA ===
  // Philippines
  'Star Music Publishing', 'Star Records Publishing', 'Viva Music Publishing',
  'PolyEast Publishing', 'Universal Records Philippines', 'MCA Music Philippines',
  'Ivory Music Philippines', 'Off The Record Philippines',
  // Indonesia
  'Musica Studios Publishing', 'Aquarius Musikindo Publishing', 'Trinity Optima Publishing',
  'Sony Music Indonesia', 'Universal Music Indonesia', 'Warner Music Indonesia',
  'Nagaswara Publishing', 'HITS Records Publishing', 'My Music Publishing Indonesia',
  'Falcon Music Publishing', 'GP Records Publishing',
  // Thailand
  'GMM Grammy Publishing', 'GMM Publishing', 'RS Group Music Publishing',
  'Kamikaze Publishing', 'Muzik Move Publishing', 'What The Duck Publishing',
  'Smallroom Publishing', 'Spicy Disc Publishing', 'Gene Lab Publishing',
  'Tero Music Publishing', 'BEC-TERO Music Publishing',
  // Vietnam
  'Zing Music Publishing', 'NhacCuaTui Publishing', 'VCPMC Publishing',
  'Universal Music Vietnam', 'Sony Music Vietnam', 'Warner Music Vietnam',
  'SpaceSpeakers Publishing', 'Monstar Hub Publishing',
  // Malaysia
  'Astro Music Publishing', 'Universal Music Malaysia', 'Sony Music Malaysia',
  'Warner Music Malaysia', 'KRU Music Publishing', 'Def Jam Southeast Asia',
  'Kartel Records Publishing', 'Rocketfuel Entertainment Publishing',
  // Singapore
  'Universal Music Singapore', 'Sony Music Singapore', 'Warner Music Singapore',
  'Funkie Monkies Publishing', 'Zendyll Publishing', 'Where Are The Fruits Publishing',
  'Umami Records Publishing', 'Yung Raja Publishing',
  // Myanmar, Cambodia, Laos
  'Pyi Taw Music Publishing', 'Phnompenh Music Publishing',
  // === MIDDLE EAST ===
  // UAE & Gulf States
  'Rotana Publishing', 'Rotana Music', 'Platinum Records Publishing',
  'Universal Music MENA', 'Sony Music Middle East', 'Warner Music Middle East',
  'Anghami Publishing', 'Deezer MENA Publishing', 'Spotify MENA Publishing',
  'Empire MENA Publishing', 'Believe MENA Publishing',
  'Al Khaleejiya Publishing', 'MBC Music Publishing', 'OSN Music Publishing',
  'Coke Studio Arabia Publishing', 'MDLBEAST Publishing', 'MDLBEAST Records',
  'Wall of Sound Publishing', 'Tunes Arabia Publishing',
  // Egypt
  'Mazzika Publishing', 'Nogoum Publishing', 'Alam El Phan Publishing',
  'Gold Records Egypt', 'Cairo Records Publishing', 'Sawt El Hob Publishing',
  'Maqam Publishing', 'El Sobky Productions Music',
  // Lebanon
  'Music Box International Publishing', 'Voice of Beirut Publishing',
  'Watary Music Publishing', 'Tarab Publishing',
  // Turkey
  'Doğan Music Publishing', 'DMC Music Publishing', 'Pasion Müzik Publishing',
  'Poll Production Publishing', 'İrem Records Publishing',
  'Sony Music Turkey', 'Universal Music Turkey', 'Warner Music Turkey',
  'Netd Müzik Publishing', 'Karnaval Music Publishing', 'Esen Müzik Publishing',
  'Avrupa Müzik Publishing', 'Kalan Müzik Publishing',
  // Israel
  'Hed Arzi Publishing', 'NMC Publishing', 'Helicon Publishing',
  'Nana Publishing', 'TYP Music Publishing',
  // Iran
  'Avang Music Publishing', 'Navahang Publishing', 'Radio Javan Publishing',
  'Taraneh Publishing', 'Barbod Music Publishing',
  // North Africa (Morocco, Algeria, Tunisia)
  'Hiba Music Publishing', 'Hamzaoui Publishing',
  'Soolking Publishing', 'YAM Publishing', 'Winas Publishing',
];

// Build regex from the array — escape special regex chars in each entry
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function buildKnownPubRegex(flags: string = 'i'): RegExp {
  const escaped = KNOWN_PUBLISHERS.map(escapeForRegex);
  return new RegExp(`(${escaped.join('|')})`, flags);
}
const KNOWN_PUB_REGEX_I = buildKnownPubRegex('i');
const KNOWN_PUB_REGEX_GI = buildKnownPubRegex('gi');

interface ProResult {
  name: string;
  ipi?: string;
  publisher?: string;
  recordLabel?: string;
  management?: string;
  pro?: string;
  role?: string;
  locationCountry?: string;
  locationName?: string;
}

interface CuratedProOverride {
  publisher?: string;
  recordLabel?: string;
  management?: string;
  pro?: string;
  locationCountry?: string;
  locationName?: string;
  clearRecordLabel?: boolean;
}

const CURATED_PRO_OVERRIDES: Record<string, CuratedProOverride> = {
  'yeah proof': {
    publisher: 'Paq Publishing',
    locationCountry: 'IN',
    locationName: 'India',
    clearRecordLabel: true,
  },
  'jack van cleaf': {
    publisher: 'Dualtone Publishing',
    recordLabel: 'Dualtone Records',
    locationCountry: 'US',
    locationName: 'Nashville, TN',
  },
  'orion meshorer': {
    publisher: 'Sentric Music',
  },
  'nick label': {
    publisher: 'Prescription Songs',
  },
};

function applyCuratedOverride(result: ProResult): ProResult {
  const override = CURATED_PRO_OVERRIDES[result.name.trim().toLowerCase()];
  if (!override) return result;

  const merged: ProResult = {
    ...result,
    publisher: override.publisher ?? result.publisher,
    recordLabel: override.recordLabel ?? result.recordLabel,
    management: override.management ?? result.management,
    pro: override.pro ?? result.pro,
    locationCountry: override.locationCountry ?? result.locationCountry,
    locationName: override.locationName ?? result.locationName,
  };

  if (override.clearRecordLabel) {
    delete merged.recordLabel;
  }

  return merged;
}

// Map of country names/keywords to ISO codes
const COUNTRY_MAP: Record<string, { code: string; name: string }> = {
  // Common variations
  'united states': { code: 'US', name: 'United States' },
  'usa': { code: 'US', name: 'United States' },
  'u.s.': { code: 'US', name: 'United States' },
  'america': { code: 'US', name: 'United States' },
  'american': { code: 'US', name: 'United States' },
  'united kingdom': { code: 'GB', name: 'United Kingdom' },
  'uk': { code: 'GB', name: 'United Kingdom' },
  'britain': { code: 'GB', name: 'United Kingdom' },
  'british': { code: 'GB', name: 'United Kingdom' },
  'england': { code: 'GB', name: 'England' },
  'english': { code: 'GB', name: 'England' },
  'india': { code: 'IN', name: 'India' },
  'indian': { code: 'IN', name: 'India' },
  'canada': { code: 'CA', name: 'Canada' },
  'canadian': { code: 'CA', name: 'Canada' },
  'australia': { code: 'AU', name: 'Australia' },
  'australian': { code: 'AU', name: 'Australia' },
  'germany': { code: 'DE', name: 'Germany' },
  'german': { code: 'DE', name: 'Germany' },
  'france': { code: 'FR', name: 'France' },
  'french': { code: 'FR', name: 'France' },
  'japan': { code: 'JP', name: 'Japan' },
  'japanese': { code: 'JP', name: 'Japan' },
  'south korea': { code: 'KR', name: 'South Korea' },
  'korea': { code: 'KR', name: 'South Korea' },
  'korean': { code: 'KR', name: 'South Korea' },
  'nigeria': { code: 'NG', name: 'Nigeria' },
  'nigerian': { code: 'NG', name: 'Nigeria' },
  'south africa': { code: 'ZA', name: 'South Africa' },
  'brazil': { code: 'BR', name: 'Brazil' },
  'brazilian': { code: 'BR', name: 'Brazil' },
  'mexico': { code: 'MX', name: 'Mexico' },
  'mexican': { code: 'MX', name: 'Mexico' },
  'spain': { code: 'ES', name: 'Spain' },
  'spanish': { code: 'ES', name: 'Spain' },
  'italy': { code: 'IT', name: 'Italy' },
  'italian': { code: 'IT', name: 'Italy' },
  'china': { code: 'CN', name: 'China' },
  'chinese': { code: 'CN', name: 'China' },
  'sweden': { code: 'SE', name: 'Sweden' },
  'swedish': { code: 'SE', name: 'Sweden' },
  'norway': { code: 'NO', name: 'Norway' },
  'norwegian': { code: 'NO', name: 'Norway' },
  'netherlands': { code: 'NL', name: 'Netherlands' },
  'dutch': { code: 'NL', name: 'Netherlands' },
  'ireland': { code: 'IE', name: 'Ireland' },
  'irish': { code: 'IE', name: 'Ireland' },
  'jamaica': { code: 'JM', name: 'Jamaica' },
  'jamaican': { code: 'JM', name: 'Jamaica' },
  'puerto rico': { code: 'PR', name: 'Puerto Rico' },
  'puerto rican': { code: 'PR', name: 'Puerto Rico' },
  'argentina': { code: 'AR', name: 'Argentina' },
  'colombian': { code: 'CO', name: 'Colombia' },
  'colombia': { code: 'CO', name: 'Colombia' },
};

// Extract location from content
function extractLocation(content: string, name: string): { country?: string; location?: string } | null {
  const lowerContent = content.toLowerCase();
  const lowerName = name.toLowerCase();
  
  // Location patterns - look for "from [location]", "based in [location]", "[nationality] artist"
  const locationPatterns = [
    new RegExp(`${lowerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]*?(?:from|based in|hails from|born in|raised in|living in|residing in)\\s+([A-Za-z][A-Za-z\\s,]+?)(?:\\.|,|\\s+is|\\s+and|$)`, 'i'),
    new RegExp(`([A-Za-z]+)\\s+(?:singer|artist|musician|songwriter|producer|rapper|band)\\s+${lowerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
    new RegExp(`${lowerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+is\\s+(?:an?\\s+)?([A-Za-z]+)\\s+(?:singer|artist|musician|songwriter|producer|rapper)`, 'i'),
  ];
  
  for (const pattern of locationPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const locationStr = match[1].trim().toLowerCase();
      
      // Check if we can map this to a country
      for (const [key, value] of Object.entries(COUNTRY_MAP)) {
        if (locationStr.includes(key)) {
          return { country: value.code, location: value.name };
        }
      }
      
      // Check for city names and map to countries
      const cityToCountry: Record<string, { code: string; name: string }> = {
        'los angeles': { code: 'US', name: 'Los Angeles, USA' },
        'new york': { code: 'US', name: 'New York, USA' },
        'atlanta': { code: 'US', name: 'Atlanta, USA' },
        'miami': { code: 'US', name: 'Miami, USA' },
        'chicago': { code: 'US', name: 'Chicago, USA' },
        'houston': { code: 'US', name: 'Houston, USA' },
        'london': { code: 'GB', name: 'London, UK' },
        'manchester': { code: 'GB', name: 'Manchester, UK' },
        'mumbai': { code: 'IN', name: 'Mumbai, India' },
        'delhi': { code: 'IN', name: 'Delhi, India' },
        'toronto': { code: 'CA', name: 'Toronto, Canada' },
        'lagos': { code: 'NG', name: 'Lagos, Nigeria' },
        'seoul': { code: 'KR', name: 'Seoul, South Korea' },
        'tokyo': { code: 'JP', name: 'Tokyo, Japan' },
        'paris': { code: 'FR', name: 'Paris, France' },
        'berlin': { code: 'DE', name: 'Berlin, Germany' },
        'sydney': { code: 'AU', name: 'Sydney, Australia' },
        'melbourne': { code: 'AU', name: 'Melbourne, Australia' },
        'arunachal pradesh': { code: 'IN', name: 'Arunachal Pradesh, India' },
        'northeast india': { code: 'IN', name: 'Northeast India' },
      };
      
      for (const [city, info] of Object.entries(cityToCountry)) {
        if (locationStr.includes(city)) {
          return { country: info.code, location: info.name };
        }
      }
    }
  }
  
  return null;
}

// PRO database search URLs and parsers - Worldwide coverage
const PRO_DATABASES = [
  // North America
  { name: 'ASCAP', region: 'US', keywords: 'ASCAP American Society Composers' },
  { name: 'BMI', region: 'US', keywords: 'BMI Broadcast Music' },
  { name: 'SESAC', region: 'US', keywords: 'SESAC' },
  { name: 'GMR', region: 'US', keywords: 'GMR Global Music Rights' },
  { name: 'The MLC', region: 'US', keywords: 'MLC Mechanical Licensing Collective' },
  { name: 'SOCAN', region: 'CA', keywords: 'SOCAN Society Composers Authors Music Publishers Canada' },
  { name: 'CMRRA', region: 'CA', keywords: 'CMRRA Canadian Musical Reproduction Rights Agency' },
  
  // Europe - Western
  { name: 'PRS', region: 'GB', keywords: 'PRS Performing Right Society UK' },
  { name: 'MCPS', region: 'GB', keywords: 'MCPS Mechanical Copyright Protection Society UK' },
  { name: 'GEMA', region: 'DE', keywords: 'GEMA Germany' },
  { name: 'SACEM', region: 'FR', keywords: 'SACEM France' },
  { name: 'SIAE', region: 'IT', keywords: 'SIAE Italy' },
  { name: 'SGAE', region: 'ES', keywords: 'SGAE Spain' },
  { name: 'SABAM', region: 'BE', keywords: 'SABAM Belgium' },
  { name: 'BUMA/STEMRA', region: 'NL', keywords: 'BUMA STEMRA Netherlands' },
  { name: 'STIM', region: 'SE', keywords: 'STIM Sweden' },
  { name: 'TONO', region: 'NO', keywords: 'TONO Norway' },
  { name: 'KODA', region: 'DK', keywords: 'KODA Denmark' },
  { name: 'TEOSTO', region: 'FI', keywords: 'TEOSTO Finland' },
  { name: 'SUISA', region: 'CH', keywords: 'SUISA Switzerland' },
  { name: 'AKM', region: 'AT', keywords: 'AKM Austria' },
  { name: 'SPA', region: 'PT', keywords: 'SPA Portugal' },
  { name: 'IMRO', region: 'IE', keywords: 'IMRO Ireland' },
  
  // Europe - Eastern
  { name: 'ZAiKS', region: 'PL', keywords: 'ZAiKS Poland' },
  { name: 'ARTISJUS', region: 'HU', keywords: 'ARTISJUS Hungary' },
  { name: 'OSA', region: 'CZ', keywords: 'OSA Czech Republic' },
  { name: 'UCMR-ADA', region: 'RO', keywords: 'UCMR-ADA Romania' },
  { name: 'HDS-ZAMP', region: 'HR', keywords: 'HDS-ZAMP Croatia' },
  { name: 'SOKOJ', region: 'RS', keywords: 'SOKOJ Serbia' },
  { name: 'RAO', region: 'RU', keywords: 'RAO Russia' },
  { name: 'AEPI', region: 'GR', keywords: 'AEPI Greece' },
  { name: 'MESAM', region: 'TR', keywords: 'MESAM Turkey' },
  
  // Middle East
  { name: 'ACUM', region: 'IL', keywords: 'ACUM Israel' },
  
  // Asia Pacific
  { name: 'JASRAC', region: 'JP', keywords: 'JASRAC Japanese Society Rights Authors Composers' },
  { name: 'APRA AMCOS', region: 'AU', keywords: 'APRA AMCOS Australia' },
  { name: 'KOMCA', region: 'KR', keywords: 'KOMCA Korea Music Copyright Association' },
  { name: 'MCSC', region: 'CN', keywords: 'MCSC Music Copyright Society China' },
  { name: 'COMPASS', region: 'SG', keywords: 'COMPASS Singapore' },
  { name: 'MACP', region: 'MY', keywords: 'MACP Malaysia' },
  { name: 'FILSCAP', region: 'PH', keywords: 'FILSCAP Philippines' },
  { name: 'MCT', region: 'TH', keywords: 'MCT Thailand' },
  { name: 'VCPMC', region: 'VN', keywords: 'VCPMC Vietnam' },
  { name: 'APRA NZ', region: 'NZ', keywords: 'APRA New Zealand' },
  
  // India & South Asia
  { name: 'IPRS', region: 'IN', keywords: 'IPRS Indian Performing Right Society' },
  { name: 'PPL India', region: 'IN', keywords: 'PPL Phonographic Performance Limited India' },
  
  // Africa
  { name: 'SAMRO', region: 'ZA', keywords: 'SAMRO Southern African Music Rights Organisation' },
  { name: 'CAPASSO', region: 'ZA', keywords: 'CAPASSO Composers Authors Publishers Association South Africa' },
  { name: 'MCSK', region: 'KE', keywords: 'MCSK Music Copyright Society Kenya' },
  { name: 'COSON', region: 'NG', keywords: 'COSON Copyright Society Nigeria' },
  { name: 'GHAMRO', region: 'GH', keywords: 'GHAMRO Ghana' },
  { name: 'COSOTA', region: 'TZ', keywords: 'COSOTA Tanzania' },
  { name: 'ONDA', region: 'DZ', keywords: 'ONDA Algeria' },
  { name: 'BMDA', region: 'MA', keywords: 'BMDA Morocco' },
  
  // Latin America & Caribbean
  { name: 'SACM', region: 'MX', keywords: 'SACM Sociedad Autores Compositores Mexico' },
  { name: 'SADAIC', region: 'AR', keywords: 'SADAIC Argentina' },
  { name: 'UBC', region: 'BR', keywords: 'UBC União Brasileira Compositores Brazil' },
  { name: 'SAYCO', region: 'CO', keywords: 'SAYCO Colombia' },
  { name: 'SCD', region: 'CL', keywords: 'SCD Chile' },
  { name: 'APDAYC', region: 'PE', keywords: 'APDAYC Peru' },
  { name: 'SACVEN', region: 'VE', keywords: 'SACVEN Venezuela' },
  { name: 'JACAP', region: 'JM', keywords: 'JACAP Jamaica' },
  { name: 'ACEMLA', region: 'PR', keywords: 'ACEMLA Puerto Rico' },
];

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { names, songTitle, artist, filterPros } = await req.json();

    if (!names || !Array.isArray(names) || names.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Names array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (names.length > 50) {
      return new Response(
        JSON.stringify({ success: false, error: 'Too many names (max 50)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!names.every((n: unknown) => typeof n === 'string' && n.length > 0 && n.length <= 200)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid name entries' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client for cache operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('PRO lookup for:', { names, songTitle, artist, filterPros });

    // ========== CACHE CHECK ==========
    // Check cache for all names (case-insensitive)
    const lowerNames = names.map((n: string) => n.toLowerCase());
    const { data: cachedRows } = await supabase
      .from('pro_cache')
      .select('name, data, expires_at')
      .in('name_lower', lowerNames);

    const now = new Date();
    const cachedResults: Record<string, ProResult> = {};
    const namesToLookup: string[] = [];

    for (const name of names) {
      const cached = cachedRows?.find(
        (r: any) => r.name.toLowerCase() === name.toLowerCase() && new Date(r.expires_at) > now
      );
      if (cached) {
        console.log(`Cache HIT for: ${name}`);
        cachedResults[name] = applyCuratedOverride(cached.data as ProResult);
      } else {
        namesToLookup.push(name);
      }
    }

    // If everything was cached, return immediately
    if (namesToLookup.length === 0) {
      console.log('All names served from cache');
      const prosToSearch = filterPros && filterPros.length > 0 
        ? filterPros 
        : PRO_DATABASES.map(p => p.name);

      return new Response(
        JSON.stringify({
          success: true,
          data: cachedResults,
          searched: prosToSearch,
          fromCache: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Cache MISS for:', namesToLookup);

    // ========== LIVE LOOKUP ==========
    // Search across multiple PRO databases using Firecrawl's search
    const proResults: Record<string, ProResult> = {};

    // Filter PROs if specified, otherwise use all
    const prosToSearch = filterPros && filterPros.length > 0 
      ? filterPros 
      : PRO_DATABASES.map(p => p.name);
    
    console.log('Searching PROs:', prosToSearch);

    // Track whether Firecrawl is out of credits so we can fall back to AI
    let firecrawlUnavailable = false;
    
    // Strategy 1: Search for each person directly
    // Only search names that weren't in cache
    const directSearchPromises = namesToLookup.slice(0, 8).map(async (name: string) => {
      try {
        console.log(`Direct PRO search for: ${name}`);
        
        // Use songTitle + artist context for disambiguation
        const context = songTitle && artist ? ` ${artist}` : '';
        
        // Helper to make Firecrawl search with error logging
        const firecrawlSearch = async (query: string, limit: number = 5) => {
          if (firecrawlUnavailable) return null; // Skip if already known to be out of credits
          try {
            const response = await fetch('https://api.firecrawl.dev/v1/search', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                query,
                limit,
                scrapeOptions: { formats: ['markdown'] },
              }),
            });
            if (!response.ok) {
              const errBody = await response.text().catch(() => '');
              console.error(`Firecrawl search failed [${response.status}] for "${query.substring(0, 60)}": ${errBody.substring(0, 200)}`);
              if (response.status === 402) {
                firecrawlUnavailable = true;
                console.warn('Firecrawl credits exhausted — will fall back to AI lookup');
              }
              return null;
            }
            return await response.json();
          } catch (e) {
            console.error(`Firecrawl search error for "${query.substring(0, 60)}":`, e);
            return null;
          }
        };

        // Search sequentially to allow firecrawlUnavailable flag to propagate
        const proDbData = await firecrawlSearch(`"${name}" songwriter publisher ASCAP BMI SESAC`);
        const generalData = await firecrawlSearch(`"${name}"${context} music publisher record label management`);
        const pubData = await firecrawlSearch(`"${name}"${context} "publishing deal" OR "signed to" OR "record deal" OR "publishing agreement"`);
        
        console.log(`Firecrawl results for ${name}: proDb=${proDbData?.data?.length || 0}, general=${generalData?.data?.length || 0}, pub=${pubData?.data?.length || 0}`);
        
        // Split proDbData into ascap/bmi/mlc based on URL patterns
        const ascapData = proDbData ? { data: (proDbData.data || []).filter((r: any) => (r.url || '').includes('ascap.com')) } : null;
        const bmiData = proDbData ? { data: (proDbData.data || []).filter((r: any) => (r.url || '').includes('bmi.com')) } : null;
        const mlcData = proDbData ? { data: (proDbData.data || []).filter((r: any) => (r.url || '').includes('themlc.com')) } : null;
        const otherProResults = proDbData ? (proDbData.data || []).filter((r: any) => {
          const url = r.url || '';
          return !url.includes('ascap.com') && !url.includes('bmi.com') && !url.includes('themlc.com');
        }) : [];
        
        // Merge all non-PRO-DB results
        const mergedGeneral = { 
          data: [
            ...(generalData?.data || []), 
            ...(pubData?.data || []),
            ...otherProResults,
          ] 
        };
        
        return { name, ascapData, bmiData, mlcData, generalData: mergedGeneral, labelData: mergedGeneral };
      } catch (e) {
        console.log(`Search for ${name} error:`, e);
        return { name, ascapData: null, bmiData: null, mlcData: null, generalData: null, labelData: null };
      }
    });

    // Strategy 2: Search for song credits with PRO info (skip if Firecrawl is out of credits)
    const songSearchPromise = songTitle && artist && !firecrawlUnavailable ? fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `"${songTitle}" "${artist}" songwriter credits IPI ASCAP BMI SESAC PRS publisher`,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] },
      }),
    }).then(r => {
      if (r.status === 402) {
        firecrawlUnavailable = true;
        console.warn('Firecrawl credits exhausted on Strategy 2 — skipping');
        return null;
      }
      return r.ok ? r.json() : null;
    }).catch(() => null) : Promise.resolve(null);

    const [songSearchResult, ...directResults] = await Promise.all([
      songSearchPromise,
      ...directSearchPromises,
    ]);

    // Parse song search results
    if (songSearchResult?.data) {
      const content = songSearchResult.data.map((r: any) => r.markdown || r.description || '').join('\n');
      
      for (const name of namesToLookup) {
        if (content.toLowerCase().includes(name.toLowerCase())) {
           const ipiMatch = content.match(/IPI[:\s#]*(\d{9,11})/i);
           // Try known publishers first (most reliable)
           const knownPubMatch = content.match(KNOWN_PUB_REGEX_I);
           // Fallback: require company suffix, no newlines in match
           const genericPubMatch = !knownPubMatch ? content.match(/(?:published by|publishing deal with|publisher:\s*)([A-Z][A-Za-z0-9\s&'.()-]{2,80}?\s+(?:Music|Publishing|Entertainment|Songs|Rights|Group|LLC|Inc\.?|Ltd\.?))/i) : null;
           const proMatch = content.match(/\b(ASCAP|BMI|SESAC|GMR|Global Music Rights|PRS|MCPS|GEMA|SOCAN|CMRRA|APRA|APRA AMCOS|JASRAC|IPRS|SAMRO|SACM|SACEM|SIAE|KOMCA|MCSC|COSON|MCSK|CAPASSO|SADAIC|UBC|SGAE|SABAM|BUMA|STEMRA|STIM|TONO|KODA|TEOSTO|SUISA|AKM|SPA|IMRO|ZAiKS|ARTISJUS|OSA|COMPASS|MACP|FILSCAP|GHAMRO|SAYCO|SCD|JACAP|ACEMLA|The MLC|MLC)\b/i);
          
           if (!proResults[name]) {
             proResults[name] = { name };
           }
           if (ipiMatch) proResults[name].ipi = ipiMatch[1];
           if (knownPubMatch) {
             proResults[name].publisher = knownPubMatch[1].trim();
           } else if (genericPubMatch) {
             const pub = genericPubMatch[1].trim().replace(/[\s,.;:]+$/, '');
             if (pub.length >= 5) proResults[name].publisher = pub;
           }
           if (proMatch) proResults[name].pro = proMatch[1].toUpperCase();
        }
      }
    }

    // Parse direct PRO search results
    for (const result of directResults) {
      if (!result) continue;

      const name = result.name;
      const allContent: string[] = [];

      // Parse MLC results
      if (result.mlcData?.data) {
        allContent.push(...result.mlcData.data.map((r: any) => r.markdown || r.description || ''));
        const mlcContent = result.mlcData.data.map((r: any) => r.markdown || '').join(' ');
        if (mlcContent.toLowerCase().includes(name.toLowerCase())) {
          if (!proResults[name]) proResults[name] = { name };
          const mlcPubMatch = mlcContent.match(KNOWN_PUB_REGEX_I);
          if (mlcPubMatch && !proResults[name].publisher) {
            proResults[name].publisher = mlcPubMatch[1].trim();
          }
          const mlcProMatch = mlcContent.match(/\b(ASCAP|BMI|SESAC|PRS|GEMA|SOCAN)\b/i);
          if (mlcProMatch && !proResults[name].pro) {
            proResults[name].pro = mlcProMatch[1].toUpperCase();
          }
        }
      }
      
      // Collect content from all sources
      if (result.ascapData?.data) {
        allContent.push(...result.ascapData.data.map((r: any) => r.markdown || r.description || ''));
        // If found in ASCAP, mark as ASCAP member
        const ascapContent = result.ascapData.data.map((r: any) => r.markdown || '').join(' ');
        if (ascapContent.toLowerCase().includes(name.toLowerCase())) {
          if (!proResults[name]) proResults[name] = { name };
          if (!proResults[name].pro) proResults[name].pro = 'ASCAP';
        }
      }
      
      if (result.bmiData?.data) {
        allContent.push(...result.bmiData.data.map((r: any) => r.markdown || r.description || ''));
        // If found in BMI, mark as BMI member
        const bmiContent = result.bmiData.data.map((r: any) => r.markdown || '').join(' ');
        if (bmiContent.toLowerCase().includes(name.toLowerCase())) {
          if (!proResults[name]) proResults[name] = { name };
          if (!proResults[name].pro) proResults[name].pro = 'BMI';
        }
      }
      
      if (result.generalData?.data) {
        allContent.push(...result.generalData.data.map((r: any) => r.markdown || r.description || ''));
      }
      
      const content = allContent.join('\n');
      
      // Log content length for debugging
      console.log(`Content for ${name}: ${content.length} chars from ${allContent.length} sources`);
      if (content.length > 0) {
        // Log a snippet to see what we're working with
        console.log(`Content snippet for ${name}: ${content.substring(0, 500)}`);
      }
      
      // Enhanced regex patterns for extracting info
      const ipiPatterns = [
        /IPI[:\s#]*(\d{9,11})/i,
        /IPI\s*(?:Number|No\.?|#)?\s*[:\s]*(\d{9,11})/i,
      ];
      
      // More specific publisher patterns - ordered from most reliable to least
      const publisherPatterns = [
        // Known publishers (most reliable - match first)
        KNOWN_PUB_REGEX_GI,
        // "published by / publishing deal with" + company name (must end with a company suffix)
        /(?:published\s+by|publishing\s+(?:deal\s+)?(?:with|administered?\s+by)|pub(?:lishing)?\s*:\s*)["']?\s*([A-Z][A-Za-z0-9\s&'.()-]+?\s+(?:Music|Publishing|Entertainment|Songs|Tunes|Media|Group|LLC|Inc\.?|Ltd\.?|Limited|Holdings|Records|Rights))["']?/gi,
        // "signed to [Publisher] publishing" or "signed publishing deal with X" 
        /signed\s+(?:a\s+)?(?:publishing\s+)?(?:deal\s+)?(?:with|to)\s+["']?([A-Z][A-Za-z0-9\s&'.()-]+?\s+(?:Music|Publishing|Entertainment|Songs|Tunes|Media|Group|LLC|Inc\.?|Ltd\.?))["']?/gi,
        // "X's publishing is handled/administered by Y"
        /(?:publishing|songs?)\s+(?:is|are)\s+(?:handled|administered|managed|controlled)\s+by\s+["']?([A-Z][A-Za-z0-9\s&'.()-]+?\s+(?:Music|Publishing|Entertainment|Songs|Group))["']?/gi,
      ];

      // Record label patterns - ordered from most reliable to least
      const labelPatterns = [
        // Known major labels (most reliable - match first)
        /(Universal Music|Sony Music|Warner Music|Atlantic Records|Columbia Records|Republic Records|Interscope|Def Jam|Capitol Records|Island Records|RCA Records|Epic Records|EMI|Virgin Records|Geffen Records|300 Entertainment|Quality Control|GOOD Music|Top Dawg|OVO Sound|XO Records|Young Money|Cash Money|Roc Nation|88rising|Big Machine Records|Sub Pop Records|Domino Records|Secretly Group|Matador Records|Merge Records|4AD|XL Recordings|Partisan Records|Warp Records|Stones Throw Records|Rhymesayers|Epitaph Records|Fueled by Ramen|Fearless Records|Rise Records|Nuclear Blast|Metal Blade|Century Media)/gi,
        // Pattern requiring company suffix
        /(?:record\s+label|signed\s+to|recording\s+(?:contract|deal)\s+(?:with|at)|releases?\s+(?:on|via|through)|distributed\s+by|label)\s*[:\s]+["']?([A-Z][A-Za-z0-9\s&'.()-]+?\s+(?:Records|Music|Entertainment|Recordings|Group|Label))["']?/gi,
      ];

      // Management patterns - ordered from most reliable to least
      const managementPatterns = [
        // Known major management companies (most reliable)
        /(Maverick Management|Full Stop Management|Roc Nation|Artist Partner Group|TaP Management|Shots Studios|First Access Entertainment|Red Light Management|Crush Management|Q Prime|McGhee Entertainment|Creative Artists Agency|William Morris|CAA|WME|UTA|ICM Partners)/gi,
        // Pattern requiring company suffix
        /(?:managed?\s+by|management(?:\s+company)?)\s*[:\s]+["']?([A-Z][A-Za-z0-9\s&'.()-]+?\s+(?:Management|Entertainment|Group|Media|Agency))["']?/gi,
      ];
      
      const proPattern = /\b(ASCAP|BMI|SESAC|PRS|MCPS|GEMA|SOCAN|CMRRA|APRA|APRA AMCOS|APRA NZ|JASRAC|IPRS|SAMRO|SACM|SACEM|SIAE|KOMCA|MCSC|COSON|MCSK|CAPASSO|SADAIC|UBC|SGAE|SABAM|BUMA|STEMRA|STIM|TONO|KODA|TEOSTO|SUISA|AKM|SPA|IMRO|ZAiKS|ARTISJUS|OSA|UCMR-ADA|HDS-ZAMP|SOKOJ|RAO|AEPI|MESAM|ACUM|COMPASS|MACP|FILSCAP|MCT|VCPMC|GHAMRO|COSOTA|ONDA|BMDA|SAYCO|SCD|APDAYC|SACVEN|JACAP|ACEMLA|The MLC|MLC)\b/gi;

      if (!proResults[name]) {
        proResults[name] = { name };
      }
      
      // Try to extract IPI
      for (const pattern of ipiPatterns) {
        const match = content.match(pattern);
        if (match && !proResults[name].ipi) {
          proResults[name].ipi = match[1];
          break;
        }
      }
      
      // Helper to validate extracted company names
      const isValidCompanyName = (value: string, personNames: string[]): boolean => {
        if (value.length < 5 || value.length > 140) return false;
        if (!/^[A-Z]/.test(value)) return false;
        // Reject if it matches any person name being looked up
        const lowerVal = value.toLowerCase().trim();
        for (const pn of personNames) {
          if (lowerVal === pn.toLowerCase().trim()) return false;
          // Also reject if it's just a first or last name of a person
          const parts = pn.toLowerCase().split(/\s+/);
          if (parts.length > 1 && (lowerVal === parts[0] || lowerVal === parts[parts.length - 1])) return false;
        }
        // Reject common junk words
        const junkWords = ['the', 'and', 'with', 'from', 'that', 'this', 'also', 'been', 'have', 'were', 'their'];
        if (junkWords.includes(lowerVal)) return false;
        return true;
      };

      // Try to extract publisher
      for (const pattern of publisherPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(content);
        if (match && !proResults[name].publisher) {
           const pub = match[1].trim().replace(/[\s,.;:]+$/, '');
           if (isValidCompanyName(pub, names)) {
             proResults[name].publisher = pub;
             break;
           }
        }
      }

      // Collect label content including dedicated label search
      let labelContent = content;
      if (result.labelData?.data) {
        labelContent += '\n' + result.labelData.data.map((r: any) => r.markdown || r.description || '').join('\n');
      }

      // Try to extract record label
      for (const pattern of labelPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(labelContent);
        if (match && !proResults[name].recordLabel) {
           const label = match[1].trim().replace(/[\s,.;:]+$/, '');
           if (isValidCompanyName(label, names)) {
             proResults[name].recordLabel = label;
             break;
           }
        }
      }

      // Try to extract management
      for (const pattern of managementPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(content);
        if (match && !proResults[name].management) {
           const mgmt = match[1].trim().replace(/[\s,.;:]+$/, '');
           if (isValidCompanyName(mgmt, names)) {
             proResults[name].management = mgmt;
             break;
           }
        }
      }
      
      // Try to extract PRO (find all mentions and pick most common)
      if (!proResults[name].pro) {
        const proMatches = content.match(proPattern);
        if (proMatches && proMatches.length > 0) {
          proResults[name].pro = proMatches[0].toUpperCase();
        }
      }
      
      // Try to extract location
      if (!proResults[name].locationCountry) {
        const locationInfo = extractLocation(content, name);
        if (locationInfo) {
          proResults[name].locationCountry = locationInfo.country;
          proResults[name].locationName = locationInfo.location;
        }
      }
    }

    // ========== AI FALLBACK ==========
    // If Firecrawl was unavailable (402) or returned empty results, use AI to fill gaps
    const namesWithNoPublisher = namesToLookup.filter(n => !proResults[n]?.publisher);
    const shouldUseAiFallback = firecrawlUnavailable || namesWithNoPublisher.length > 0;

    if (shouldUseAiFallback) {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (lovableApiKey) {
        console.log(`AI fallback for ${namesWithNoPublisher.length} names without publisher data`);
        // Batch names into a single AI call for efficiency
        const nameBatch = namesWithNoPublisher.slice(0, 10);
        if (nameBatch.length > 0) {
          try {
            const songContext = songTitle && artist ? `The song is "${songTitle}" by ${artist}.` : '';
            const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lovableApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [
                  {
                    role: 'system',
                    content: `You are a music industry data assistant specializing in publishing and rights data. Given a list of music professionals (songwriters, producers, artists), return their known publishing company (the entity that administers or owns their songwriting/production catalog — e.g. Paq Publishing, Pulse Music Group, Sony Music Publishing), record label, PRO (performing rights organization like ASCAP/BMI/SESAC/PRS/GEMA/SOCAN/IPRS etc.), management company, and home country. Producers often have their own publishing entities or are signed to publishing companies — be sure to check for these. Use your knowledge from Wikipedia, AllMusic, Genius, music industry press, and social media bios. Only return data you are confident about. If unsure, omit the field.`
                  },
                  {
                    role: 'user',
                    content: `${songContext} For each of these music professionals, provide their publishing company, record label, PRO affiliation, management, and country:\n\n${nameBatch.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
                  }
                ],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'report_music_professionals',
                    description: 'Report publishing and label info for music professionals',
                    parameters: {
                      type: 'object',
                      properties: {
                        professionals: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              name: { type: 'string', description: 'Person name as provided' },
                              publisher: { type: 'string', description: 'Publishing company name (e.g. Sony Music Publishing, Pulse Music Group)' },
                              record_label: { type: 'string', description: 'Record label (e.g. Atlantic Records)' },
                              pro: { type: 'string', description: 'PRO affiliation (e.g. ASCAP, BMI, PRS)' },
                              management: { type: 'string', description: 'Management company' },
                              country: { type: 'string', description: 'Two-letter ISO country code (e.g. US, GB, CA)' },
                            },
                            required: ['name'],
                            additionalProperties: false,
                          }
                        }
                      },
                      required: ['professionals'],
                      additionalProperties: false,
                    }
                  }
                }],
                tool_choice: { type: 'function', function: { name: 'report_music_professionals' } },
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
              if (toolCall?.function?.arguments) {
                const parsed = JSON.parse(toolCall.function.arguments);
                const professionals = parsed.professionals || [];
                console.log(`AI returned data for ${professionals.length} professionals`);

                for (const prof of professionals) {
                  // Find matching name (case-insensitive)
                  const matchName = namesToLookup.find(n => n.toLowerCase() === prof.name?.toLowerCase());
                  if (!matchName) continue;

                  if (!proResults[matchName]) proResults[matchName] = { name: matchName };
                  const r = proResults[matchName];

                  // Only fill in missing fields — don't override Firecrawl data
                  if (!r.publisher && prof.publisher) {
                    r.publisher = prof.publisher;
                    console.log(`AI filled publisher for ${matchName}: ${prof.publisher}`);
                  }
                  if (!r.recordLabel && prof.record_label) {
                    r.recordLabel = prof.record_label;
                    console.log(`AI filled label for ${matchName}: ${prof.record_label}`);
                  }
                  if (!r.pro && prof.pro) {
                    r.pro = prof.pro.toUpperCase();
                  }
                  if (!r.management && prof.management) {
                    r.management = prof.management;
                  }
                  if (!r.locationCountry && prof.country) {
                    const countryCode = prof.country.toUpperCase();
                    r.locationCountry = countryCode;
                    // Map country code to name
                    const countryEntry = Object.values(COUNTRY_MAP).find(c => c.code === countryCode);
                    if (countryEntry) r.locationName = countryEntry.name;
                  }
                }
              }
            } else {
              const errText = await aiResponse.text().catch(() => '');
              console.error(`AI fallback failed [${aiResponse.status}]: ${errText.substring(0, 200)}`);
            }
          } catch (aiErr) {
            console.error('AI fallback error:', aiErr);
          }
        }
      } else {
        console.warn('LOVABLE_API_KEY not available — skipping AI fallback');
      }
    }

    Object.keys(proResults).forEach((name) => {
      proResults[name] = applyCuratedOverride(proResults[name]);
    });

    console.log('PRO lookup results (final):', proResults);

    // ========== CACHE WRITE ==========
    // Store newly-looked-up results in cache (upsert)
    const upsertRows = Object.values(proResults).map((r) => ({
      name: r.name,
      data: r,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    }));

    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('pro_cache')
        .upsert(upsertRows, { onConflict: 'name_lower', ignoreDuplicates: false });

      if (upsertError) {
        console.log('Cache upsert error (non-fatal):', upsertError.message);
      } else {
        console.log('Cached', upsertRows.length, 'PRO results');
      }
    }

    // Merge cached + fresh results
    const mergedResults = { ...cachedResults, ...proResults };

    // Return list of PROs that were searched
    return new Response(
      JSON.stringify({ 
        success: true, 
        data: mergedResults,
        searched: prosToSearch,
        cached: Object.keys(cachedResults).length,
        fresh: Object.keys(proResults).length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in PRO lookup:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to lookup';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
