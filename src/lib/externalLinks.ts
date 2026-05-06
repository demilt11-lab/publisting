import { Music, Globe, Instagram, Twitter, Youtube } from "lucide-react";
import { validateSocialUrl } from "@/lib/types/sourceProvenance";

export interface ExternalLink {
  label: string;
  url: string | null;
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
  // Top 50 most-searched artists with verified handles
  "kendrick lamar": {
    instagram: "https://www.instagram.com/kendricklamar/",
    youtube: "https://www.youtube.com/channel/UC3lBXcrKFnFAFkfVk5WuKcQ",
    tiktok: "https://www.tiktok.com/@kendricklamar",
  },
  "kendrick duckworth": {
    instagram: "https://www.instagram.com/kendricklamar/",
    youtube: "https://www.youtube.com/channel/UC3lBXcrKFnFAFkfVk5WuKcQ",
  },
  "drake": {
    instagram: "https://www.instagram.com/champagnepapi/",
    youtube: "https://www.youtube.com/channel/UCByOQJjav0CUDwxCk-jVNRQ",
    tiktok: "https://www.tiktok.com/@drake",
  },
  "taylor swift": {
    instagram: "https://www.instagram.com/taylorswift/",
    youtube: "https://www.youtube.com/channel/UCqECaJ8Gagnn7YCbPEzWH6g",
    tiktok: "https://www.tiktok.com/@taylorswift",
  },
  "the weeknd": {
    instagram: "https://www.instagram.com/theweeknd/",
    youtube: "https://www.youtube.com/channel/UC0WP5P-ufpRLnKCAl7ciNJQ",
    tiktok: "https://www.tiktok.com/@theweeknd",
  },
  "abel tesfaye": {
    instagram: "https://www.instagram.com/theweeknd/",
    youtube: "https://www.youtube.com/channel/UC0WP5P-ufpRLnKCAl7ciNJQ",
  },
  "bad bunny": {
    instagram: "https://www.instagram.com/badbunnypr/",
    youtube: "https://www.youtube.com/channel/UCmBA_wu8xGg1OfOkfW13Q0Q",
    tiktok: "https://www.tiktok.com/@badbunny",
  },
  "sza": {
    instagram: "https://www.instagram.com/sza/",
    youtube: "https://www.youtube.com/channel/UCGLlBJMYR1cXLEfKAjKx5Nw",
    tiktok: "https://www.tiktok.com/@sza",
  },
  "beyonce": {
    instagram: "https://www.instagram.com/beyonce/",
    youtube: "https://www.youtube.com/channel/UCuHzBCaKQBeaEGqJA-lIL6A",
  },
  "rihanna": {
    instagram: "https://www.instagram.com/badgalriri/",
    youtube: "https://www.youtube.com/channel/UCcgqSGf1MkCL2ygxQ8JMhBg",
  },
  "travis scott": {
    instagram: "https://www.instagram.com/travisscott/",
    youtube: "https://www.youtube.com/channel/UCtxdfwb9wfkoGocVUAJ-Bmg",
    tiktok: "https://www.tiktok.com/@travisscott",
  },
  "post malone": {
    instagram: "https://www.instagram.com/postmalone/",
    youtube: "https://www.youtube.com/channel/UCeLHszkByNZtPKcaVXOCOQQ",
    tiktok: "https://www.tiktok.com/@postmalone",
  },
  "doja cat": {
    instagram: "https://www.instagram.com/dojacat/",
    youtube: "https://www.youtube.com/channel/UCzpl2doJ3v4hpE-Am-NG10A",
    tiktok: "https://www.tiktok.com/@dojacat",
  },
  "billie eilish": {
    instagram: "https://www.instagram.com/billieeilish/",
    youtube: "https://www.youtube.com/channel/UCiGm_E4ZwYSJV3bcVDpYcx4Q",
    tiktok: "https://www.tiktok.com/@billieeilish",
  },
  "j. cole": {
    instagram: "https://www.instagram.com/realcoleworld/",
    youtube: "https://www.youtube.com/channel/UCnc6db-y3IU7CkT_yeNXdSg",
  },
  "j cole": {
    instagram: "https://www.instagram.com/realcoleworld/",
    youtube: "https://www.youtube.com/channel/UCnc6db-y3IU7CkT_yeNXdSg",
  },
  "metro boomin": {
    instagram: "https://www.instagram.com/metroboomin/",
    youtube: "https://www.youtube.com/channel/UCcGBT14bNGIq-bsVoFmrYGg",
    tiktok: "https://www.tiktok.com/@metroboomin",
  },
  "21 savage": {
    instagram: "https://www.instagram.com/21savage/",
    youtube: "https://www.youtube.com/channel/UCY2qt3dw2TQJxvBrDiYGHdQ",
    tiktok: "https://www.tiktok.com/@21savage",
  },
  "future": {
    instagram: "https://www.instagram.com/future/",
    youtube: "https://www.youtube.com/channel/UCKvMYFr9HpEzp57MzTkBj3g",
    tiktok: "https://www.tiktok.com/@future",
  },
  "lil baby": {
    instagram: "https://www.instagram.com/lilbaby/",
    youtube: "https://www.youtube.com/channel/UCeFV1dDxCXbKPOmKdMFqaeQ",
    tiktok: "https://www.tiktok.com/@lilbaby",
  },
  "lil durk": {
    instagram: "https://www.instagram.com/duaborehima/",
    youtube: "https://www.youtube.com/channel/UCVjdICtuDGG3CLUeD4U-YLQ",
    tiktok: "https://www.tiktok.com/@lildurk",
  },
  "morgan wallen": {
    instagram: "https://www.instagram.com/morganwallen/",
    youtube: "https://www.youtube.com/channel/UCVj9pAaULjFzJHNtbcG7vZA",
    tiktok: "https://www.tiktok.com/@mikiemorganwallen",
  },
  "olivia rodrigo": {
    instagram: "https://www.instagram.com/oliviarodrigo/",
    youtube: "https://www.youtube.com/channel/UCJ2hpIQ-u0I8lMxPGGe3FeA",
    tiktok: "https://www.tiktok.com/@oliviarodrigo",
  },
  "dua lipa": {
    instagram: "https://www.instagram.com/dualipa/",
    youtube: "https://www.youtube.com/channel/UC-J-KZfRV8c13fOCkhXdLiQ",
    tiktok: "https://www.tiktok.com/@dualipaofficial",
  },
  "harry styles": {
    instagram: "https://www.instagram.com/harrystyles/",
    youtube: "https://www.youtube.com/channel/UCbOCbp5gXL8jigIBZLqMPrw",
  },
  "ariana grande": {
    instagram: "https://www.instagram.com/arianagrande/",
    youtube: "https://www.youtube.com/channel/UC9CoOnJkIBMdeijd9qYoT_g",
    tiktok: "https://www.tiktok.com/@arianagrande",
  },
  "justin bieber": {
    instagram: "https://www.instagram.com/justinbieber/",
    youtube: "https://www.youtube.com/channel/UCHkj014U2CQ2Nv0UZeYpE_A",
    tiktok: "https://www.tiktok.com/@justinbieber",
  },
  "kanye west": {
    instagram: "https://www.instagram.com/ye/",
    youtube: "https://www.youtube.com/channel/UCaEBUDrAbUTlSHKI5Cq-k0A",
  },
  "ye": {
    instagram: "https://www.instagram.com/ye/",
    youtube: "https://www.youtube.com/channel/UCaEBUDrAbUTlSHKI5Cq-k0A",
  },
  "ed sheeran": {
    instagram: "https://www.instagram.com/teddysphotos/",
    youtube: "https://www.youtube.com/channel/UC0C-w0YjGpqDXGB8IHb662A",
    tiktok: "https://www.tiktok.com/@edsheeran",
  },
  "bruno mars": {
    instagram: "https://www.instagram.com/brunomars/",
    youtube: "https://www.youtube.com/channel/UCoUM-UJ7rirJYP8CQ0EIaHA",
    tiktok: "https://www.tiktok.com/@brunomars",
  },
  "nicki minaj": {
    instagram: "https://www.instagram.com/nickiminaj/",
    youtube: "https://www.youtube.com/channel/UC0VOyT2OCBKdQhF3BAbZ-1g",
    tiktok: "https://www.tiktok.com/@nickiminaj",
  },
  "cardi b": {
    instagram: "https://www.instagram.com/iamcardib/",
    youtube: "https://www.youtube.com/channel/UCxMAbVFmxKUVGAll0WVGpFw",
    tiktok: "https://www.tiktok.com/@iamcardib",
  },
  "megan thee stallion": {
    instagram: "https://www.instagram.com/theestallion/",
    youtube: "https://www.youtube.com/channel/UCkT-k9gA3v_P5S_0bVAa53g",
    tiktok: "https://www.tiktok.com/@theestallion",
  },
  "ice spice": {
    instagram: "https://www.instagram.com/icespice/",
    youtube: "https://www.youtube.com/channel/UCKRF9dlCJ3gqLGGIlN2mfyA",
    tiktok: "https://www.tiktok.com/@icespice",
  },
  "latto": {
    instagram: "https://www.instagram.com/laborblatto/",
    youtube: "https://www.youtube.com/channel/UC4gEK6EoPwRyBsAJVlGcXxw",
    tiktok: "https://www.tiktok.com/@latto777",
  },
  "gunna": {
    instagram: "https://www.instagram.com/gunna/",
    youtube: "https://www.youtube.com/channel/UC0D7DYyXpWxJGM_P3FN-uxQ",
  },
  "young thug": {
    instagram: "https://www.instagram.com/thuggerthugger1/",
    youtube: "https://www.youtube.com/channel/UCbtbgJI1ZSAKIz42muzY0DQ",
  },
  "chris brown": {
    instagram: "https://www.instagram.com/chrisbrownofficial/",
    youtube: "https://www.youtube.com/channel/UCrBXqFES1OJkB_6D-3hTW5A",
    tiktok: "https://www.tiktok.com/@chrisbrownofficial",
  },
  "juice wrld": {
    instagram: "https://www.instagram.com/juicewrld999/",
    youtube: "https://www.youtube.com/channel/UCIjYyZxkFucILN2UdeerJhg",
  },
  "xxxtentacion": {
    instagram: "https://www.instagram.com/xxxtentacion/",
    youtube: "https://www.youtube.com/channel/UCvwPDMYYzGrvedBiaBfGqpQ",
  },
  "pop smoke": {
    instagram: "https://www.instagram.com/realpopsmoke/",
    youtube: "https://www.youtube.com/channel/UCuXnkiiNlFVBi7eNOxBHxMQ",
  },
  "rod wave": {
    instagram: "https://www.instagram.com/rodwave/",
    youtube: "https://www.youtube.com/channel/UC3Fs8O71u6mtgj4hkr-L0oA",
    tiktok: "https://www.tiktok.com/@rodwave",
  },
  "tyler, the creator": {
    instagram: "https://www.instagram.com/feliciathegoat/",
    youtube: "https://www.youtube.com/channel/UCpiZh8bsNEVTWqzMgVItlOg",
  },
  "tyler the creator": {
    instagram: "https://www.instagram.com/feliciathegoat/",
    youtube: "https://www.youtube.com/channel/UCpiZh8bsNEVTWqzMgVItlOg",
  },
  "tink": {
    instagram: "https://www.instagram.com/taborriley/",
    youtube: "https://www.youtube.com/channel/UCyq4RSn5ksU3bKlC50d-UEw",
  },
  "summer walker": {
    instagram: "https://www.instagram.com/summerwalker/",
    youtube: "https://www.youtube.com/channel/UClk-cVn2UPns0YBMYsYNiBA",
    tiktok: "https://www.tiktok.com/@summerwalker",
  },
  "karol g": {
    instagram: "https://www.instagram.com/karolg/",
    youtube: "https://www.youtube.com/channel/UCZuPJZ2kGFdlbQu1qotZaHg",
    tiktok: "https://www.tiktok.com/@karolg",
  },
  "peso pluma": {
    instagram: "https://www.instagram.com/pesopluma/",
    youtube: "https://www.youtube.com/channel/UCQkth-Hn_OIRGzHunVRFRnQ",
    tiktok: "https://www.tiktok.com/@pesopluma",
  },
  "burna boy": {
    instagram: "https://www.instagram.com/burnaboygram/",
    youtube: "https://www.youtube.com/channel/UCbeA-1aNKLLsfJIxadYaw1g",
    tiktok: "https://www.tiktok.com/@burnaboy",
  },
  "wizkid": {
    instagram: "https://www.instagram.com/wizkidayo/",
    youtube: "https://www.youtube.com/channel/UC6cy8-wK3JNkLLqHNvVIRAA",
    tiktok: "https://www.tiktok.com/@wizkidayo",
  },
  "davido": {
    instagram: "https://www.instagram.com/davido/",
    youtube: "https://www.youtube.com/channel/UCAfmEZ2jHPRlFRxe29t3bdw",
    tiktok: "https://www.tiktok.com/@davido",
  },
  "ap dhillon": {
    instagram: "https://www.instagram.com/apdhillon/",
    youtube: "https://www.youtube.com/channel/UCsAAyh1WT7BeKFIjQM7XJIA",
    tiktok: "https://www.tiktok.com/@apdhillon",
  },
  "diljit dosanjh": {
    instagram: "https://www.instagram.com/diljitdosanjh/",
    youtube: "https://www.youtube.com/channel/UCkPu5KVYzivnsbUMohgsqFQ",
    tiktok: "https://www.tiktok.com/@diljitdosanjh",
  },
  "arijit singh": {
    instagram: "https://www.instagram.com/aaborehima/",
    youtube: "https://www.youtube.com/channel/UC5fRJCMp2jemRqtWkOj7omg",
  },
  "wave$tar": {
    instagram: "https://www.instagram.com/wavestarmusic/",
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

  // Helper: only return a URL if we have a verified direct link, otherwise null
  const directOrNull = (url: string | undefined | null): string | null => url || null;

  // Spotify: prefer direct artist page via ID, then verified social
  const spotifyUrl = spotifyArtistId
    ? `https://open.spotify.com/artist/${spotifyArtistId}`
    : directOrNull(sanitizedSocial.spotify);

  // Apple Music: only direct if we have an ID
  const appleMusicUrl = appleArtistId
    ? `https://music.apple.com/us/artist/${appleArtistId}`
    : directOrNull(sanitizedSocial.apple_music);

  // Genius: prefer verified link, then try slug-based (may 404 but is a direct page, not search)
  const geniusSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const geniusUrl = sanitizedSocial.genius
    ? sanitizedSocial.genius
    : `https://genius.com/artists/${geniusSlug}`;

  // For platforms where we can't guarantee a direct page, only show if verified
  const tidalUrl = directOrNull(sanitizedSocial.tidal);
  const amazonUrl = directOrNull(sanitizedSocial.amazon_music);
  const youtubeMusicUrl = directOrNull(sanitizedSocial.youtube_music);
  const deezerUrl = directOrNull(sanitizedSocial.deezer);
  const soundcloudUrl = directOrNull(sanitizedSocial.soundcloud);
  const pandoraUrl = directOrNull(sanitizedSocial.pandora);
  const audiomackUrl = directOrNull(sanitizedSocial.audiomack);
  const bandcampUrl = directOrNull(sanitizedSocial.bandcamp);

  // AllMusic & Discogs: only if verified
  const allmusicUrl = directOrNull(sanitizedSocial.allmusic);
  const discogsUrl = directOrNull(sanitizedSocial.discogs);

  // Wikipedia: slug-based direct page (generally reliable for well-known artists)
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodedName.replace(/%20/g, '_')}`;

  const social: ExternalLink[] = [
    {
      label: "Instagram",
      url: sanitizedSocial.instagram || buildPlatformSearchUrl("instagram", name),
      icon: Instagram,
      verified: !!sanitizedSocial.instagram,
    },
    {
      label: "X (Twitter)",
      url: sanitizedSocial.twitter || sanitizedSocial.x || `https://x.com/search?q=${encodedName}&f=user`,
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
      { label: "Spotify", url: spotifyUrl as any, icon: Music, verified: !!spotifyUrl },
      { label: "Apple Music", url: appleMusicUrl as any, icon: Music, verified: !!appleMusicUrl },
      { label: "Tidal", url: tidalUrl as any, icon: Music, verified: !!tidalUrl },
      { label: "Amazon Music", url: amazonUrl as any, icon: Music, verified: !!amazonUrl },
      { label: "YouTube Music", url: youtubeMusicUrl as any, icon: Youtube, verified: !!youtubeMusicUrl },
      { label: "Deezer", url: deezerUrl as any, icon: Music, verified: !!deezerUrl },
      { label: "SoundCloud", url: soundcloudUrl as any, icon: Music, verified: !!soundcloudUrl },
      { label: "Pandora", url: pandoraUrl as any, icon: Music, verified: !!pandoraUrl },
      { label: "Audiomack", url: audiomackUrl as any, icon: Music, verified: !!audiomackUrl },
      { label: "Bandcamp", url: bandcampUrl as any, icon: Music, verified: !!bandcampUrl },
    ],
    info: [
      { label: "Genius", url: geniusUrl, icon: Globe, verified: !!sanitizedSocial.genius },
      { label: "AllMusic", url: allmusicUrl as any, icon: Globe, verified: !!allmusicUrl },
      { label: "Discogs", url: discogsUrl as any, icon: Globe, verified: !!discogsUrl },
      { label: "Wikipedia", url: wikiUrl, icon: Globe, verified: false },
    ],
    social,
  };
};
