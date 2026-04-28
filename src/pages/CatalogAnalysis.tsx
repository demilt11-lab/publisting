import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell, NavSection } from "@/components/layout/AppShell";
import { ArrowLeft, Loader2, Download, Info, BookOpen, Wallet, TrendingUp, FileText, Presentation, Users, Trash2 } from "lucide-react";
import { useTeamContext } from "@/contexts/TeamContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PitchDeckGenerator } from "@/components/PitchDeckGenerator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fetchCatalog } from "@/lib/api/catalogLookup";
import { fetchStreamingStats } from "@/lib/api/streamingStats";
import { PERFORMANCE_ROYALTY_SHARE } from "@/lib/publishingRevenue";
import { useCatalogImport } from "@/contexts/CatalogImportContext";
import { useStreamingRates } from "@/hooks/useStreamingRates";
import { CatalogValuationDashboard } from "@/components/CatalogValuationDashboard";
import { useDecayCurves, DecayCurve } from "@/hooks/useDecayCurves";
import { Clock, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

type RegionKey = "africa" | "us_uk" | "india" | "latam" | "global_blended";

type RegionalMetrics = {
  label: string;
  spotifyPubRatePerStream: number;
  youtubePubRatePerView: number;
  spotifyAnnualGrowthRate: number;
  youtubeAnnualGrowthRate: number;
  historicalCollectionRate: number;
  futureCollectionRate: number;
};

type RegionBlend = {
  enabled: boolean;
  primaryRegion: RegionKey;
  secondaryRegion: RegionKey;
  primaryWeight: number;
};

type CatalogSong = {
  id?: string;
  title: string;
  artist?: string;
  genre?: string;
  spotifyStreams?: number;
  youtubeViews?: number;
  participantCount?: number;
  ownershipPercent?: number;
  spotifyPubRatePerStream?: number;
  youtubePubRatePerView?: number;
  alreadyCollectedAmount?: number;
  alreadyCollectedPercent?: number;
  releaseDate?: string;
  regionOverride?: RegionKey;
};

// DSP collection delay constants (months)
const DSP_DELAYS = {
  spotify: 2,
  youtube: 3,
} as const;

type CatalogConfig = {
  selectedRegion: RegionKey;
  regionBlend?: RegionBlend;
  publishingSplitPercent?: number;
  defaultSpotifyPubRatePerStream?: number;
  defaultYoutubePubRatePerView?: number;
  historicalCollectionRate?: number;
  futureCollectionRate?: number;
  spotifyAnnualGrowthRate?: number;
  youtubeAnnualGrowthRate?: number;
  onlyIncludeSongsReleasedWithinYears?: number;
  analysisDate?: string;
};

type SongAnalysisResult = {
  id?: string;
  title: string;
  artist?: string;
  included: boolean;
  excludedReason?: string;
  spotifyStreams: number;
  youtubeViews: number;
  spotifyPublishingEstimated: number;
  youtubePublishingEstimated: number;
  totalPublishingEstimated: number;
  ownershipPercent: number;
  individualGrossShare: number;
  individualAlreadyCollected: number;
  individualAvailableToCollect: number;
  releaseDate?: string;
  ageInYears?: number;
  effectiveRegion: string;
  effectiveRegionLabel: string;
  forecast: {
    year1Gross: number;
    year2Gross: number;
    year3Gross: number;
    threeYearGrossTotal: number;
    individualYear1Gross: number;
    individualYear2Gross: number;
    individualYear3Gross: number;
    individualThreeYearGross: number;
    individualYear1Collectible: number;
    individualYear2Collectible: number;
    individualYear3Collectible: number;
    individualThreeYearCollectible: number;
  };
};

type CatalogAnalysisResult = {
  songs: SongAnalysisResult[];
  totals: {
    totalSongsInput: number;
    totalSongsIncluded: number;
    totalSongsExcluded: number;
    spotifyStreams: number;
    youtubeViews: number;
    totalPublishingEstimated: number;
    totalIndividualGrossShare: number;
    totalAlreadyCollected: number;
    totalAvailableToCollect: number;
    totalYear1Gross: number;
    totalYear2Gross: number;
    totalYear3Gross: number;
    totalThreeYearGross: number;
    totalIndividualYear1Gross: number;
    totalIndividualYear2Gross: number;
    totalIndividualYear3Gross: number;
    totalIndividualThreeYearGross: number;
    totalIndividualYear1Collectible: number;
    totalIndividualYear2Collectible: number;
    totalIndividualYear3Collectible: number;
    totalIndividualThreeYearCollectible: number;
  };
};

type SavedAnalysis = {
  id: string;
  name: string;
  notes: string | null;
  catalog_json: CatalogSong[];
  config_json: CatalogConfig;
  results_json: CatalogAnalysisResult | null;
  song_count: number;
  total_publishing_estimated: number;
  total_available_to_collect: number;
  total_three_year_collectible: number;
  created_at: string;
  updated_at: string;
};

const DEFAULT_REGIONAL_METRICS: Record<RegionKey, RegionalMetrics> = {
  africa: {
    label: "Africa",
    spotifyPubRatePerStream: 0.00115375,
    youtubePubRatePerView: 0.00046333,
    spotifyAnnualGrowthRate: 0.02,
    youtubeAnnualGrowthRate: 0.01,
    historicalCollectionRate: 0.75,
    futureCollectionRate: 0.82,
  },
  us_uk: {
    label: "US / UK",
    spotifyPubRatePerStream: 0.004245,
    youtubePubRatePerView: 0.001735,
    spotifyAnnualGrowthRate: 0.01,
    youtubeAnnualGrowthRate: 0.0,
    historicalCollectionRate: 0.9,
    futureCollectionRate: 0.93,
  },
  india: {
    label: "India",
    spotifyPubRatePerStream: 0.00089,
    youtubePubRatePerView: 0.00042,
    spotifyAnnualGrowthRate: 0.04,
    youtubeAnnualGrowthRate: 0.03,
    historicalCollectionRate: 0.8,
    futureCollectionRate: 0.86,
  },
  latam: {
    label: "Latin America",
    spotifyPubRatePerStream: 0.00172,
    youtubePubRatePerView: 0.00068,
    spotifyAnnualGrowthRate: 0.03,
    youtubeAnnualGrowthRate: 0.02,
    historicalCollectionRate: 0.8,
    futureCollectionRate: 0.85,
  },
  global_blended: {
    label: "Global Blended",
    spotifyPubRatePerStream: 0.00236132,
    youtubePubRatePerView: 0.00103028,
    spotifyAnnualGrowthRate: 0.015,
    youtubeAnnualGrowthRate: 0.01,
    historicalCollectionRate: 0.85,
    futureCollectionRate: 0.9,
  },
};

/** Merge DB-backed regional rates into the defaults */
export function buildRegionalMetrics(
  dbRates: Record<string, { spotifyRate: number; youtubeRate: number }> | null
): Record<RegionKey, RegionalMetrics> {
  if (!dbRates) return DEFAULT_REGIONAL_METRICS;
  const merged = { ...DEFAULT_REGIONAL_METRICS };
  for (const key of Object.keys(merged) as RegionKey[]) {
    const db = dbRates[key];
    if (db) {
      merged[key] = {
        ...merged[key],
        spotifyPubRatePerStream: db.spotifyRate,
        youtubePubRatePerView: db.youtubeRate,
      };
    }
  }
  return merged;
}

const sampleCatalog: CatalogSong[] = [
  {
    title: "African Hit",
    artist: "Artist A",
    spotifyStreams: 12000000,
    youtubeViews: 2500000,
    ownershipPercent: 0.5,
    alreadyCollectedAmount: 18000,
    releaseDate: "2024-05-10",
    regionOverride: "africa",
  },
  {
    title: "UK Crossover Song",
    artist: "Artist B",
    spotifyStreams: 4000000,
    youtubeViews: 500000,
    participantCount: 4,
    alreadyCollectedPercent: 0.6,
    releaseDate: "2025-01-15",
    regionOverride: "us_uk",
  },
  {
    title: "India Song",
    artist: "Artist C",
    spotifyStreams: 9000000,
    youtubeViews: 2000000,
    ownershipPercent: 0.25,
    releaseDate: "2025-02-01",
    regionOverride: "india",
  },
  {
    title: "LATAM Crossover",
    artist: "Artist D",
    spotifyStreams: 7000000,
    youtubeViews: 3100000,
    participantCount: 2,
    releaseDate: "2024-11-20",
  },
];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value || 0));
const safeNum = (value: any) => (Number.isFinite(Number(value)) ? Number(value) : 0);

function weightedValue(a: number, b: number, aWeight: number) {
  const safeWeight = Math.max(0, Math.min(1, aWeight));
  return a * safeWeight + b * (1 - safeWeight);
}

function getAgeInYears(releaseDate?: string, analysisDate?: string) {
  if (!releaseDate) return undefined;
  const release = new Date(releaseDate);
  const analysis = analysisDate ? new Date(analysisDate) : new Date();
  if (isNaN(release.getTime()) || isNaN(analysis.getTime())) return undefined;
  return (analysis.getTime() - release.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function shouldIncludeSong(song: CatalogSong, config: CatalogConfig) {
  const ageInYears = getAgeInYears(song.releaseDate, config.analysisDate);
  if (typeof config.onlyIncludeSongsReleasedWithinYears === "number" && typeof ageInYears === "number" && ageInYears > config.onlyIncludeSongsReleasedWithinYears) {
    return { included: false, excludedReason: `Older than ${config.onlyIncludeSongsReleasedWithinYears} years`, ageInYears };
  }
  return { included: true, ageInYears };
}

function resolveOwnershipPercent(song: CatalogSong, config: CatalogConfig) {
  if (typeof song.ownershipPercent === "number") return clamp01(song.ownershipPercent);
  if (typeof song.participantCount === "number" && song.participantCount > 0) return clamp01(1 / song.participantCount);
  return clamp01((config.publishingSplitPercent ?? 100) / 100);
}

function resolveRegionalConfig(config: CatalogConfig, explicitRegion?: RegionKey, metricsMap?: Record<RegionKey, RegionalMetrics>) {
  const METRICS = metricsMap ?? DEFAULT_REGIONAL_METRICS;
  if (explicitRegion) {
    const region = METRICS[explicitRegion];
    return {
      spotifyPubRatePerStream: config.defaultSpotifyPubRatePerStream ?? region.spotifyPubRatePerStream,
      youtubePubRatePerView: config.defaultYoutubePubRatePerView ?? region.youtubePubRatePerView,
      historicalCollectionRate: config.historicalCollectionRate ?? region.historicalCollectionRate,
      futureCollectionRate: config.futureCollectionRate ?? region.futureCollectionRate,
      spotifyAnnualGrowthRate: config.spotifyAnnualGrowthRate ?? region.spotifyAnnualGrowthRate,
      youtubeAnnualGrowthRate: config.youtubeAnnualGrowthRate ?? region.youtubeAnnualGrowthRate,
      label: region.label, isBlend: false, effectiveRegionKey: explicitRegion,
    };
  }
  const blend = config.regionBlend;
  if (blend?.enabled) {
    const p = METRICS[blend.primaryRegion];
    const s = METRICS[blend.secondaryRegion];
    const w = Math.max(0, Math.min(1, blend.primaryWeight));
    return {
      spotifyPubRatePerStream: config.defaultSpotifyPubRatePerStream ?? weightedValue(p.spotifyPubRatePerStream, s.spotifyPubRatePerStream, w),
      youtubePubRatePerView: config.defaultYoutubePubRatePerView ?? weightedValue(p.youtubePubRatePerView, s.youtubePubRatePerView, w),
      historicalCollectionRate: config.historicalCollectionRate ?? weightedValue(p.historicalCollectionRate, s.historicalCollectionRate, w),
      futureCollectionRate: config.futureCollectionRate ?? weightedValue(p.futureCollectionRate, s.futureCollectionRate, w),
      spotifyAnnualGrowthRate: config.spotifyAnnualGrowthRate ?? weightedValue(p.spotifyAnnualGrowthRate, s.spotifyAnnualGrowthRate, w),
      youtubeAnnualGrowthRate: config.youtubeAnnualGrowthRate ?? weightedValue(p.youtubeAnnualGrowthRate, s.youtubeAnnualGrowthRate, w),
      label: `${p.label} ${(w * 100).toFixed(0)}% / ${s.label} ${((1 - w) * 100).toFixed(0)}%`,
      isBlend: true, effectiveRegionKey: `${blend.primaryRegion}_${blend.secondaryRegion}_blend`,
    };
  }
  const region = METRICS[config.selectedRegion];
  return {
    spotifyPubRatePerStream: config.defaultSpotifyPubRatePerStream ?? region.spotifyPubRatePerStream,
    youtubePubRatePerView: config.defaultYoutubePubRatePerView ?? region.youtubePubRatePerView,
    historicalCollectionRate: config.historicalCollectionRate ?? region.historicalCollectionRate,
    futureCollectionRate: config.futureCollectionRate ?? region.futureCollectionRate,
    spotifyAnnualGrowthRate: config.spotifyAnnualGrowthRate ?? region.spotifyAnnualGrowthRate,
    youtubeAnnualGrowthRate: config.youtubeAnnualGrowthRate ?? region.youtubeAnnualGrowthRate,
    label: region.label, isBlend: false, effectiveRegionKey: config.selectedRegion,
  };
}

function analyzeSong(song: CatalogSong, config: CatalogConfig, metricsMap?: Record<RegionKey, RegionalMetrics>, getDecay?: (genre?: string) => DecayCurve): SongAnalysisResult {
  const inclusion = shouldIncludeSong(song, config);
  const regional = resolveRegionalConfig(config, song.regionOverride, metricsMap);
  const spotifyStreams = Math.max(0, safeNum(song.spotifyStreams));
  const youtubeViews = Math.max(0, safeNum(song.youtubeViews));
  const spotifyRate = Math.max(0, safeNum(song.spotifyPubRatePerStream ?? regional.spotifyPubRatePerStream));
  const youtubeRate = Math.max(0, safeNum(song.youtubePubRatePerView ?? regional.youtubePubRatePerView));
  const spotifyPublishingEstimated = spotifyStreams * spotifyRate * (1 + PERFORMANCE_ROYALTY_SHARE);
  const youtubePublishingEstimated = youtubeViews * youtubeRate * (1 + PERFORMANCE_ROYALTY_SHARE);
  const totalPublishingEstimated = spotifyPublishingEstimated + youtubePublishingEstimated;
  const ownershipPercent = resolveOwnershipPercent(song, config);
  // Writer's share carve-out (e.g. 50% writer + 50% publisher). Applied multiplicatively
  // on top of ownership %, so a writer with 100% ownership of their writer's share
  // collects writerShare × gross. Defaults to 100% when not configured, so legacy
  // catalogs where the user encoded the writer's share inside ownershipPercent
  // continue to compute the same number unless they set this field.
  const writerShare = clamp01((config.publishingSplitPercent ?? 100) / 100);
  // Historical collection rate: realized publishing collections vs theoretical gross.
  // Applied to "Est. Earnings" so the headline number reflects what is actually
  // collected in the user's region.
  const histCollectionRate = clamp01(regional.historicalCollectionRate);
  const individualGrossShareTheoretical = totalPublishingEstimated * ownershipPercent * writerShare;
  const individualGrossShare = individualGrossShareTheoretical * histCollectionRate;

  let individualAlreadyCollected = 0;
  let individualAvailableToCollect = 0;
  if (typeof song.alreadyCollectedAmount === "number") {
    individualAlreadyCollected = Math.max(0, safeNum(song.alreadyCollectedAmount));
    individualAvailableToCollect = Math.max(0, individualGrossShare - individualAlreadyCollected);
  } else if (typeof song.alreadyCollectedPercent === "number") {
    individualAlreadyCollected = individualGrossShare * clamp01(song.alreadyCollectedPercent);
    individualAvailableToCollect = Math.max(0, individualGrossShare - individualAlreadyCollected);
  } else {
    // "Already Collected" represents the share of the (theoretical) gross that has
    // historically been collected. "Available to Collect" is the unrealised
    // remainder of the THEORETICAL gross share, discounted by Spotify payment
    // delay. This way Est. Earnings (already net of histCollection) +
    // Available-to-Collect approximates the full theoretical gross.
    individualAlreadyCollected = individualGrossShare;
    individualAvailableToCollect = individualGrossShareTheoretical * Math.max(0, 1 - histCollectionRate) * (1 - DSP_DELAYS.spotify / 12);
  }

  // Genre-based decay curves for 3-year forecast
  const decay = getDecay?.(song.genre) ?? { year1_weight: 0.50, year2_weight: 0.30, year3_weight: 0.20, genre: 'default' };
  const spotifyGrowth = safeNum(regional.spotifyAnnualGrowthRate);
  const youtubeGrowth = safeNum(regional.youtubeAnnualGrowthRate);
  
  // Apply growth + decay weighting per year
  const year1Gross = (spotifyStreams * Math.pow(1 + spotifyGrowth, 0) * spotifyRate + youtubeViews * Math.pow(1 + youtubeGrowth, 0) * youtubeRate) * (1 + PERFORMANCE_ROYALTY_SHARE);
  const year2Gross = (spotifyStreams * Math.pow(1 + spotifyGrowth, 1) * spotifyRate + youtubeViews * Math.pow(1 + youtubeGrowth, 1) * youtubeRate) * (1 + PERFORMANCE_ROYALTY_SHARE) * (decay.year2_weight / decay.year1_weight);
  const year3Gross = (spotifyStreams * Math.pow(1 + spotifyGrowth, 2) * spotifyRate + youtubeViews * Math.pow(1 + youtubeGrowth, 2) * youtubeRate) * (1 + PERFORMANCE_ROYALTY_SHARE) * (decay.year3_weight / decay.year1_weight);

  const threeYearGrossTotal = year1Gross + year2Gross + year3Gross;

  // DSP collection timeline: Spotify pays ~2mo late, YouTube ~3mo late
  // For collectible amounts, apply future collection rate with slight DSP delay discount
  const dspDelayFactor = 0.98; // ~2% discount for payment delay

  return {
    id: song.id, title: song.title, artist: song.artist,
    included: inclusion.included, excludedReason: inclusion.excludedReason,
    spotifyStreams, youtubeViews, spotifyPublishingEstimated, youtubePublishingEstimated, totalPublishingEstimated,
    ownershipPercent, individualGrossShare, individualAlreadyCollected, individualAvailableToCollect,
    releaseDate: song.releaseDate, ageInYears: inclusion.ageInYears,
    effectiveRegion: String(regional.effectiveRegionKey), effectiveRegionLabel: regional.label,
    forecast: {
      year1Gross, year2Gross, year3Gross, threeYearGrossTotal,
      individualYear1Gross: year1Gross * ownershipPercent * writerShare,
      individualYear2Gross: year2Gross * ownershipPercent * writerShare,
      individualYear3Gross: year3Gross * ownershipPercent * writerShare,
      individualThreeYearGross: threeYearGrossTotal * ownershipPercent * writerShare,
      individualYear1Collectible: year1Gross * ownershipPercent * writerShare * clamp01(regional.futureCollectionRate) * dspDelayFactor,
      individualYear2Collectible: year2Gross * ownershipPercent * writerShare * clamp01(regional.futureCollectionRate) * dspDelayFactor,
      individualYear3Collectible: year3Gross * ownershipPercent * writerShare * clamp01(regional.futureCollectionRate) * dspDelayFactor,
      individualThreeYearCollectible: threeYearGrossTotal * ownershipPercent * writerShare * clamp01(regional.futureCollectionRate) * dspDelayFactor,
    },
  };
}

export function analyzeCatalog(songs: CatalogSong[], config: CatalogConfig, metricsMap?: Record<RegionKey, RegionalMetrics>, getDecay?: (genre?: string) => DecayCurve): CatalogAnalysisResult {
  const songResults = songs.map((s) => analyzeSong(s, config, metricsMap, getDecay));
  const included = songResults.filter((s) => s.included);
  const totals = included.reduce((acc, s) => {
    acc.spotifyStreams += s.spotifyStreams; acc.youtubeViews += s.youtubeViews;
    acc.totalPublishingEstimated += s.totalPublishingEstimated; acc.totalIndividualGrossShare += s.individualGrossShare;
    acc.totalAlreadyCollected += s.individualAlreadyCollected; acc.totalAvailableToCollect += s.individualAvailableToCollect;
    acc.totalYear1Gross += s.forecast.year1Gross; acc.totalYear2Gross += s.forecast.year2Gross; acc.totalYear3Gross += s.forecast.year3Gross;
    acc.totalThreeYearGross += s.forecast.threeYearGrossTotal;
    acc.totalIndividualYear1Gross += s.forecast.individualYear1Gross; acc.totalIndividualYear2Gross += s.forecast.individualYear2Gross;
    acc.totalIndividualYear3Gross += s.forecast.individualYear3Gross; acc.totalIndividualThreeYearGross += s.forecast.individualThreeYearGross;
    acc.totalIndividualYear1Collectible += s.forecast.individualYear1Collectible; acc.totalIndividualYear2Collectible += s.forecast.individualYear2Collectible;
    acc.totalIndividualYear3Collectible += s.forecast.individualYear3Collectible; acc.totalIndividualThreeYearCollectible += s.forecast.individualThreeYearCollectible;
    return acc;
  }, {
    totalSongsInput: songs.length, totalSongsIncluded: included.length, totalSongsExcluded: songResults.length - included.length,
    spotifyStreams: 0, youtubeViews: 0, totalPublishingEstimated: 0, totalIndividualGrossShare: 0,
    totalAlreadyCollected: 0, totalAvailableToCollect: 0, totalYear1Gross: 0, totalYear2Gross: 0, totalYear3Gross: 0, totalThreeYearGross: 0,
    totalIndividualYear1Gross: 0, totalIndividualYear2Gross: 0, totalIndividualYear3Gross: 0, totalIndividualThreeYearGross: 0,
    totalIndividualYear1Collectible: 0, totalIndividualYear2Collectible: 0, totalIndividualYear3Collectible: 0, totalIndividualThreeYearCollectible: 0,
  });
  return { songs: songResults, totals };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}
function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value || 0));
}
function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default function CatalogAnalysis() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { regionalRates, loading: ratesLoading } = useStreamingRates();
  const { getDecay, loading: decayLoading } = useDecayCurves();
  const { activeTeam } = useTeamContext();

  // Build metrics map: DB-backed rates merged with defaults
  const REGIONAL_METRICS = useMemo(() => buildRegionalMetrics(regionalRates), [regionalRates]);
  const dataLoadedAt = useMemo(() => new Date(), []);

  // Watchlist entries for quick-launch dropdown
  const [watchlistEntries, setWatchlistEntries] = useState<{ id: string; name: string; type: string }[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  useEffect(() => {
    if (!activeTeam?.id) return;
    setWatchlistLoading(true);
    supabase
      .from("watchlist_entries")
      .select("id, person_name, person_type")
      .eq("team_id", activeTeam.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setWatchlistEntries((data || []).map((e) => ({ id: e.id, name: e.person_name, type: e.person_type })));
        setWatchlistLoading(false);
      });
  }, [activeTeam?.id]);

  const handleWatchlistSelect = (entryId: string) => {
    const entry = watchlistEntries.find((e) => e.id === entryId);
    if (!entry) return;
    importedRef.current = false;
    setSearchParams({ artist: entry.name, role: entry.type });
  };

  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [analysisName, setAnalysisName] = useState("Regional Catalog Analysis");
  const [analysisNotes, setAnalysisNotes] = useState("");
  const [catalogText, setCatalogText] = useState(JSON.stringify(sampleCatalog, null, 2));
  const [parseError, setParseError] = useState("");
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const catalogImport = useCatalogImport();
  const importingCatalog = catalogImport.importing;
  const importProgress = catalogImport.progress;
  const importedRef = useRef(false);
  const [songOwnershipOverrides, setSongOwnershipOverrides] = useState<Record<number, number>>({});
  const [breakdownSong, setBreakdownSong] = useState<SongAnalysisResult | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const updateSongOwnership = useCallback((idx: number, value: number) => {
    setSongOwnershipOverrides(prev => ({ ...prev, [idx]: value }));
  }, []);

  // ─── CSV import ─────────────────────────────────────────────────────────────
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const parseCsvToCatalog = useCallback((text: string): { songs: CatalogSong[]; warnings: string[] } => {
    const warnings: string[] = [];
    const cleaned = text.replace(/^\uFEFF/, "");
    const rawLines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (rawLines.length === 0) return { songs: [], warnings: ["File is empty."] };

    const parseRow = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
          } else { cur += ch; }
        } else {
          if (ch === ',') { out.push(cur); cur = ""; }
          else if (ch === '"') { inQuotes = true; }
          else { cur += ch; }
        }
      }
      out.push(cur);
      return out.map((c) => c.trim());
    };

    const headerCells = parseRow(rawLines[0]).map((h) => h.toLowerCase().replace(/[_\s-]+/g, ""));
    const findCol = (...candidates: string[]) =>
      headerCells.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

    const titleIdx = findCol("title", "songtitle", "song", "track", "trackname");
    const artistIdx = findCol("artist", "performer");
    const spotifyIdx = findCol("spotifystreams", "spotify", "streams");
    const youtubeIdx = findCol("youtubeviews", "youtube", "ytviews", "views");
    const ownershipIdx = findCol("ownershippercent", "ownership", "share", "percent", "split", "publishingshare");
    const releaseIdx = findCol("releasedate", "release", "date");
    const genreIdx = findCol("genre");
    const regionIdx = findCol("regionoverride", "region");
    const alreadyAmtIdx = findCol("alreadycollectedamount", "alreadycollected", "collected");
    const alreadyPctIdx = findCol("alreadycollectedpercent", "collectedpercent");

    if (titleIdx === -1) {
      return { songs: [], warnings: ['Could not find a "Title" column. CSV needs a header row with at least Title.'] };
    }

    const parseNum = (raw: string | undefined): number | undefined => {
      if (raw === undefined || raw === null) return undefined;
      const s = String(raw).trim();
      if (s === "") return undefined;
      const stripped = s.replace(/[$£€,\s]/g, "");
      const n = Number(stripped);
      return Number.isFinite(n) ? n : undefined;
    };

    const parsePct = (raw: string | undefined): number | undefined => {
      if (raw === undefined) return undefined;
      const s = String(raw).trim();
      if (s === "") return undefined;
      const hasPercent = s.includes("%");
      const n = parseNum(s.replace(/%/g, ""));
      if (n === undefined) return undefined;
      if (hasPercent || n > 1) return Math.max(0, Math.min(1, n / 100));
      return Math.max(0, Math.min(1, n));
    };

    const validRegions: RegionKey[] = ["africa", "us_uk", "india", "latam", "global_blended"];
    const songs: CatalogSong[] = [];
    for (let i = 1; i < rawLines.length; i++) {
      const cells = parseRow(rawLines[i]);
      const title = cells[titleIdx]?.trim();
      if (!title) { warnings.push(`Row ${i + 1}: missing title, skipped.`); continue; }
      const regionRaw = regionIdx >= 0 ? cells[regionIdx]?.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
      const regionOverride = regionRaw && validRegions.includes(regionRaw as RegionKey) ? (regionRaw as RegionKey) : undefined;
      songs.push({
        title,
        artist: artistIdx >= 0 ? cells[artistIdx]?.trim() || undefined : undefined,
        spotifyStreams: spotifyIdx >= 0 ? parseNum(cells[spotifyIdx]) : undefined,
        youtubeViews: youtubeIdx >= 0 ? parseNum(cells[youtubeIdx]) : undefined,
        ownershipPercent: ownershipIdx >= 0 ? parsePct(cells[ownershipIdx]) : undefined,
        releaseDate: releaseIdx >= 0 ? cells[releaseIdx]?.trim() || undefined : undefined,
        genre: genreIdx >= 0 ? cells[genreIdx]?.trim() || undefined : undefined,
        regionOverride,
        alreadyCollectedAmount: alreadyAmtIdx >= 0 ? parseNum(cells[alreadyAmtIdx]) : undefined,
        alreadyCollectedPercent: alreadyPctIdx >= 0 ? parsePct(cells[alreadyPctIdx]) : undefined,
      });
    }
    return { songs, warnings };
  }, []);

  const handleCsvUpload = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const { songs, warnings } = parseCsvToCatalog(text);
      if (songs.length === 0) {
        setStatus(`CSV import failed: ${warnings[0] || "No rows could be parsed."}`);
        return;
      }
      setCatalogText(JSON.stringify(songs, null, 2));
      setSongOwnershipOverrides({});
      setSelectedAnalysisId(null);
      const baseName = file.name.replace(/\.csv$/i, "");
      setAnalysisName(`${baseName} — Catalog Analysis`);
      const warnNote = warnings.length > 0 ? ` (${warnings.length} row warning${warnings.length === 1 ? "" : "s"})` : "";
      setStatus(`Imported ${songs.length} songs from ${file.name}${warnNote}. Adjust region and parameters, then review results.`);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    } catch (err) {
      console.error("CSV import error:", err);
      setStatus("Failed to read CSV file.");
    }
  }, [parseCsvToCatalog]);

  const defaultConfig: CatalogConfig = {
    selectedRegion: "us_uk",
    regionBlend: { enabled: false, primaryRegion: "us_uk", secondaryRegion: "global_blended", primaryWeight: 0.7 },
    publishingSplitPercent: 50,
    onlyIncludeSongsReleasedWithinYears: 3,
    analysisDate: new Date().toISOString().slice(0, 10),
  };

  const clearAnalysis = useCallback(() => {
    if (!window.confirm("Reset all catalog data, settings, and results? This cannot be undone.")) return;
    setCatalogText("[]");
    setSongOwnershipOverrides({});
    setSelectedAnalysisId(null);
    setAnalysisName("Regional Catalog Analysis");
    setAnalysisNotes("");
    setStatus("");
    setParseError("");
    setConfig({ ...defaultConfig, analysisDate: new Date().toISOString().slice(0, 10) });
    catalogImport.clearResult();
    importedRef.current = false;
    if (searchParams.get("artist")) {
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const [config, setConfig] = useState<CatalogConfig>({
    selectedRegion: "us_uk",
    regionBlend: { enabled: false, primaryRegion: "us_uk", secondaryRegion: "global_blended", primaryWeight: 0.7 },
    publishingSplitPercent: 50,
    onlyIncludeSongsReleasedWithinYears: 3,
    analysisDate: new Date().toISOString().slice(0, 10),
  });

  // Kick off background import (runs in app-level context so it survives navigation)
  useEffect(() => {
    const artistParam = searchParams.get("artist");
    const roleParam = searchParams.get("role") || "artist";
    if (!artistParam || importedRef.current) return;
    importedRef.current = true;
    setAnalysisName(`${artistParam} — Catalog Analysis`);
    catalogImport.startImport(artistParam, roleParam, {
      onNavigate: () => navigate(`/catalog-analysis?artist=${encodeURIComponent(artistParam)}&role=${encodeURIComponent(roleParam)}`),
    });
  }, [searchParams, catalogImport, navigate]);

  // Hydrate catalog text once the background import completes for the current artist
  useEffect(() => {
    const artistParam = searchParams.get("artist");
    if (!artistParam) return;
    if (!catalogImport.result) return;
    if (catalogImport.result.artist.toLowerCase() !== artistParam.toLowerCase()) return;
    const importedSongs = catalogImport.result.songs;
    // Clear the result immediately so we don't re-process on the next render
    catalogImport.clearResult();
    if (importedSongs.length === 0) {
      setStatus(`No catalog data found for "${artistParam}".`);
      return;
    }
    const catalogSongs = importedSongs.map((song, idx) => ({
      id: song.id || String(idx),
      title: song.title,
      artist: song.artist,
      spotifyStreams: song.spotifyStreams || 0,
      youtubeViews: song.youtubeViews || 0,
      ownershipPercent: song.ownershipPercent,
      releaseDate: song.releaseDate,
    }));
    setCatalogText(JSON.stringify(catalogSongs, null, 2));
    setSongOwnershipOverrides({});
    setStatus(`Imported ${catalogSongs.length} songs for "${artistParam}". Adjust region and parameters, then review results.`);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogImport.result]);

  // Surface background errors as page status
  useEffect(() => {
    if (catalogImport.error) setStatus(catalogImport.error);
  }, [catalogImport.error]);

  const { parsedCatalog, currentParseError } = useMemo(() => {
    try {
      const parsed = JSON.parse(catalogText);
      if (!Array.isArray(parsed)) throw new Error("Catalog must be a JSON array");
      return { parsedCatalog: parsed as CatalogSong[], currentParseError: "" };
    } catch (err: any) {
      return { parsedCatalog: [] as CatalogSong[], currentParseError: err.message || "Invalid JSON" };
    }
  }, [catalogText]);

  // Sync parseError state for UI display (but don't use it for analysis gating)
  useEffect(() => {
    setParseError(currentParseError);
  }, [currentParseError]);

  const catalogWithOverrides = useMemo(() => {
    return parsedCatalog.map((song, idx) => {
      if (songOwnershipOverrides[idx] !== undefined) {
        return { ...song, ownershipPercent: songOwnershipOverrides[idx] / 100 };
      }
      return song;
    });
  }, [parsedCatalog, songOwnershipOverrides]);

  const analysis = useMemo(() => {
    if (currentParseError) return null;
    return analyzeCatalog(catalogWithOverrides, config, REGIONAL_METRICS, getDecay);
  }, [catalogWithOverrides, config, currentParseError, REGIONAL_METRICS, getDecay]);

  const includedSongs = analysis?.songs.filter((s) => s.included) || [];
  const excludedSongs = analysis?.songs.filter((s) => !s.included) || [];
  const activeResolvedRegion = resolveRegionalConfig(config);

  // Export functions
  const exportCSV = useCallback(() => {
    if (!analysis) return;
    const headers = ["Title", "Artist", "Spotify Streams", "YouTube Views", "Publishing Split %", "Est. Earnings", "Available to Collect", "3-Year Forecast", "Region"];
    const rows = includedSongs.map(s => [
      `"${(s.title || "").replace(/"/g, '""')}"`,
      `"${(s.artist || "").replace(/"/g, '""')}"`,
      s.spotifyStreams,
      s.youtubeViews,
      `${(s.ownershipPercent * 100).toFixed(1)}%`,
      s.individualGrossShare.toFixed(2),
      s.individualAvailableToCollect.toFixed(2),
      s.forecast.individualThreeYearCollectible.toFixed(2),
      s.effectiveRegionLabel,
    ].join(","));
    const totalsRow = [
      `"TOTALS"`, `""`,
      analysis.totals.spotifyStreams,
      analysis.totals.youtubeViews,
      `""`,
      analysis.totals.totalIndividualGrossShare.toFixed(2),
      analysis.totals.totalAvailableToCollect.toFixed(2),
      analysis.totals.totalIndividualThreeYearCollectible.toFixed(2),
      `""`,
    ].join(",");
    const csv = "\uFEFF" + [headers.join(","), ...rows, totalsRow].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${analysisName.replace(/[^a-zA-Z0-9]/g, "_")}_catalog.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [analysis, includedSongs, analysisName]);

  const exportPDF = useCallback(() => {
    if (!analysis) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const tableRows = includedSongs.map(s => `<tr>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd">${s.title}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd">${s.artist || "—"}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">${formatNumber(s.spotifyStreams)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">${formatNumber(s.youtubeViews)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">${formatPercent(s.ownershipPercent)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">${formatMoney(s.individualGrossShare)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">${formatMoney(s.individualAvailableToCollect)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">${formatMoney(s.forecast.individualThreeYearCollectible)}</td>
    </tr>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>${analysisName}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;color:#222}table{border-collapse:collapse;width:100%;font-size:11px}th{background:#f0f0f0;padding:6px 8px;text-align:left;border-bottom:2px solid #999}h1{font-size:18px}h2{font-size:14px;margin-top:24px}.stats{display:flex;gap:24px;margin:16px 0}.stat{text-align:center}.stat-label{font-size:10px;color:#888;text-transform:uppercase}.stat-value{font-size:18px;font-weight:bold}</style></head><body>
    <h1>${analysisName}</h1>
    <div class="stats">
      <div class="stat"><div class="stat-label">Songs</div><div class="stat-value">${analysis.totals.totalSongsIncluded}</div></div>
      <div class="stat"><div class="stat-label">Spotify Streams</div><div class="stat-value">${formatNumber(analysis.totals.spotifyStreams)}</div></div>
      <div class="stat"><div class="stat-label">YouTube Views</div><div class="stat-value">${formatNumber(analysis.totals.youtubeViews)}</div></div>
      <div class="stat"><div class="stat-label">Est. Earnings</div><div class="stat-value">${formatMoney(analysis.totals.totalIndividualGrossShare)}</div></div>
      <div class="stat"><div class="stat-label">Available</div><div class="stat-value">${formatMoney(analysis.totals.totalAvailableToCollect)}</div></div>
      <div class="stat"><div class="stat-label">3-Year Forecast</div><div class="stat-value">${formatMoney(analysis.totals.totalIndividualThreeYearCollectible)}</div></div>
    </div>
    <h2>Song-Level Results</h2>
    <table><thead><tr>
      <th>Title</th><th>Artist</th><th style="text-align:right">Spotify</th><th style="text-align:right">YouTube</th><th style="text-align:right">Split %</th><th style="text-align:right">Est. Earnings</th><th style="text-align:right">Available</th><th style="text-align:right">3yr Forecast</th>
    </tr></thead><tbody>${tableRows}
    <tr style="font-weight:bold;border-top:2px solid #333">
      <td style="padding:4px 8px" colspan="2">TOTALS</td>
      <td style="padding:4px 8px;text-align:right">${formatNumber(analysis.totals.spotifyStreams)}</td>
      <td style="padding:4px 8px;text-align:right">${formatNumber(analysis.totals.youtubeViews)}</td>
      <td style="padding:4px 8px;text-align:right">—</td>
      <td style="padding:4px 8px;text-align:right">${formatMoney(analysis.totals.totalIndividualGrossShare)}</td>
      <td style="padding:4px 8px;text-align:right">${formatMoney(analysis.totals.totalAvailableToCollect)}</td>
      <td style="padding:4px 8px;text-align:right">${formatMoney(analysis.totals.totalIndividualThreeYearCollectible)}</td>
    </tr></tbody></table>
    <p style="margin-top:16px;font-size:10px;color:#999">Generated by Publisting · ${new Date().toLocaleDateString()}</p>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
  }, [analysis, includedSongs, analysisName]);

  async function fetchSavedAnalyses() {
    if (!userId) return;
    setLoadingSaved(true);
    setStatus("");
    const { data, error } = await supabase.from("catalog_analyses").select("*").order("updated_at", { ascending: false });
    if (error) { setStatus(error.message); setLoadingSaved(false); return; }
    setSavedAnalyses((data || []) as unknown as SavedAnalysis[]);
    setLoadingSaved(false);
  }

  useEffect(() => { if (userId) fetchSavedAnalyses(); }, [userId]);

  async function saveNewAnalysis() {
    if (!userId) { setStatus("You must be signed in to save analyses."); return; }
    if (!analysis || parseError) { setStatus("Fix your catalog JSON before saving."); return; }
    setSaving(true); setStatus("");
    const payload: any = {
      user_id: userId, name: analysisName, notes: analysisNotes || null,
      catalog_json: parsedCatalog, config_json: config, results_json: analysis,
      song_count: analysis.totals.totalSongsIncluded,
      total_publishing_estimated: analysis.totals.totalPublishingEstimated,
      total_available_to_collect: analysis.totals.totalAvailableToCollect,
      total_three_year_collectible: analysis.totals.totalIndividualThreeYearCollectible,
    };
    const { data, error } = await supabase.from("catalog_analyses").insert(payload).select().single();
    setSaving(false);
    if (error) { setStatus(error.message); return; }
    setStatus("Analysis saved.");
    setSelectedAnalysisId(data.id);
    await fetchSavedAnalyses();
  }

  async function updateExistingAnalysis() {
    if (!selectedAnalysisId) { setStatus("Select a saved analysis first."); return; }
    if (!analysis || parseError) { setStatus("Fix your catalog JSON before updating."); return; }
    setSaving(true); setStatus("");
    const payload: any = {
      name: analysisName, notes: analysisNotes || null,
      catalog_json: parsedCatalog, config_json: config, results_json: analysis,
      song_count: analysis.totals.totalSongsIncluded,
      total_publishing_estimated: analysis.totals.totalPublishingEstimated,
      total_available_to_collect: analysis.totals.totalAvailableToCollect,
      total_three_year_collectible: analysis.totals.totalIndividualThreeYearCollectible,
    };
    const { error } = await supabase.from("catalog_analyses").update(payload).eq("id", selectedAnalysisId).select().single();
    setSaving(false);
    if (error) { setStatus(error.message); return; }
    setStatus("Analysis updated.");
    await fetchSavedAnalyses();
  }

  async function deleteAnalysis(id: string) {
    if (!window.confirm("Delete this saved analysis?")) return;
    const { error } = await supabase.from("catalog_analyses").delete().eq("id", id);
    if (error) { setStatus(error.message); return; }
    if (selectedAnalysisId === id) setSelectedAnalysisId(null);
    setStatus("Analysis deleted.");
    await fetchSavedAnalyses();
  }

  function loadAnalysis(row: SavedAnalysis) {
    setSelectedAnalysisId(row.id);
    setAnalysisName(row.name);
    setAnalysisNotes(row.notes || "");
    setCatalogText(JSON.stringify(row.catalog_json, null, 2));
    setConfig(row.config_json);
    setStatus(`Loaded "${row.name}"`);
  }

  const inputClass = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
  const cardClass = "rounded-2xl border border-border bg-card p-4";
  const statLabelClass = "text-xs uppercase tracking-wider text-muted-foreground";

  // navigate already declared above
  const [shellSection, setShellSection] = useState<NavSection>("catalog-analysis");

  const handleSectionChange = (section: NavSection) => {
    if (section === "catalog-analysis") return;
    navigate("/");
    // The Index page will handle the section
  };

  return (
    <AppShell activeSection={shellSection} onSectionChange={handleSectionChange}>
    <div className="h-full overflow-auto bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Regional Catalog Analysis</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Analyze Spotify and YouTube publishing estimates by region, with multi-market blending and song-level overrides.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Data as of: {dataLoadedAt.toLocaleString()}
            </div>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`rounded-xl border px-3 py-2 text-xs flex items-center gap-1.5 cursor-help ${
                    !ratesLoading && !decayLoading
                      ? "border-green-500/30 bg-green-500/10 text-green-400"
                      : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                  }`}>
                    {!ratesLoading && !decayLoading ? (
                      <><ShieldCheck className="w-3.5 h-3.5" /> Verified</>
                    ) : (
                      <><ShieldQuestion className="w-3.5 h-3.5" /> Loading…</>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                  Streaming rates and decay models are loaded from the database. Rates are updated quarterly and verified against DSP reports.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAnalysis}
              disabled={parsedCatalog.length === 0 && !searchParams.get("artist")}
              className="h-8 gap-1.5 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" /> Reset
            </Button>
            <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              {userId ? "Signed in" : "Not signed in"}
            </div>
          </div>
        </div>

        {/* How This Works */}
        <Collapsible>
          <CollapsibleTrigger className="mb-6 w-full">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary/40 transition-colors cursor-pointer">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <span>How This Works</span>
              <span className="ml-auto text-xs text-muted-foreground">Click to expand</span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mb-6">
            <div className="grid gap-4 sm:grid-cols-3 mt-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium text-foreground">What You're Seeing</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This table shows each song's performance and earnings. Think of it like a report card for your music catalog.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium text-foreground">Available to Collect</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Streaming services collect money and pay it out later — Spotify takes ~{DSP_DELAYS.spotify} months, YouTube ~{DSP_DELAYS.youtube} months. This column shows money that's been earned but not yet paid to you.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-medium text-foreground">Future Projections</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We analyze current performance to estimate future earnings. This helps you make informed decisions about catalog value and deals.
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {importingCatalog && (
          <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 px-4 py-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Importing Catalog</p>
              <p className="text-xs text-muted-foreground">{importProgress}</p>
            </div>
          </div>
        )}

        {status && (
          <div className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{status}</div>
        )}

        {/* Two-column config layout */}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Left: Saved analyses */}
          <div className="space-y-6">
            <div className={cardClass}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium">Saved analyses</h2>
                <button className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50" onClick={fetchSavedAnalyses} disabled={!userId || loadingSaved}>
                  {loadingSaved ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              <div className="space-y-3">
                {savedAnalyses.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {userId ? "No saved analyses yet." : "Sign in to load saved analyses."}
                    </p>
                    {userId && (
                      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">Getting Started</p>
                        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                          <li>Choose a region model (right panel)</li>
                          <li>Paste your catalog JSON below or click "Load sample"</li>
                          <li>Review the per-song breakdown & totals</li>
                          <li>Click "Save new" to store your analysis</li>
                        </ol>
                      </div>
                    )}
                  </div>
                ) : (
                  savedAnalyses.map((row) => (
                    <div key={row.id} className={`rounded-xl border p-3 ${selectedAnalysisId === row.id ? "border-primary bg-primary/10" : "border-border bg-secondary/30"}`}>
                      <div className="font-medium text-foreground">{row.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Songs: {row.song_count} • Updated: {new Date(row.updated_at).toLocaleDateString()}</div>
                      <div className="mt-2 text-xs text-muted-foreground">Pub est: {formatMoney(row.total_publishing_estimated)}</div>
                      <div className="text-xs text-muted-foreground">Available: {formatMoney(row.total_available_to_collect)}</div>
                      <div className="text-xs text-muted-foreground">3yr collectible: {formatMoney(row.total_three_year_collectible)}</div>
                      <div className="mt-3 flex gap-2">
                        <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground" onClick={() => loadAnalysis(row)}>Load</button>
                        <button className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground" onClick={() => deleteAnalysis(row.id)}>Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Watchlist quick-launch */}
            {watchlistEntries.length > 0 && (
              <div className={cardClass}>
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-medium">Run from Watchlist</h2>
                </div>
                <Select onValueChange={handleWatchlistSelect} disabled={importingCatalog}>
                  <SelectTrigger className="h-9 w-full text-xs">
                    <SelectValue placeholder="Select a person..." />
                  </SelectTrigger>
                  <SelectContent>
                    {watchlistEntries.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id} className="text-xs">
                        <span className="font-medium">{entry.name}</span>
                        <span className="ml-1.5 text-muted-foreground capitalize">({entry.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Right: Config + Results */}
          <div className="space-y-6">
            {/* Model settings */}
            <div className={cardClass}>
              <h2 className="mb-4 text-lg font-medium">Model settings</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Analysis name</label>
                    <input className={inputClass} value={analysisName} onChange={(e) => setAnalysisName(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Base region profile</label>
                    <select className={inputClass} value={config.selectedRegion} onChange={(e) => setConfig((p) => ({
                      ...p,
                      selectedRegion: e.target.value as RegionKey,
                      // Clear rate/collection overrides so region defaults apply
                      defaultSpotifyPubRatePerStream: undefined,
                      defaultYoutubePubRatePerView: undefined,
                      historicalCollectionRate: undefined,
                      futureCollectionRate: undefined,
                      spotifyAnnualGrowthRate: undefined,
                      youtubeAnnualGrowthRate: undefined,
                    }))}>
                      {Object.entries(REGIONAL_METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
                  <textarea className="min-h-[60px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" value={analysisNotes} onChange={(e) => setAnalysisNotes(e.target.value)} />
                </div>

                {/* Region blend */}
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <h3 className="mb-3 text-sm font-medium">Region performance blend</h3>
                  <label className="flex items-center gap-3 text-sm text-muted-foreground">
                    <input type="checkbox" checked={!!config.regionBlend?.enabled} onChange={(e) => setConfig((p) => ({ ...p, regionBlend: { enabled: e.target.checked, primaryRegion: p.regionBlend?.primaryRegion ?? p.selectedRegion, secondaryRegion: p.regionBlend?.secondaryRegion ?? "us_uk", primaryWeight: p.regionBlend?.primaryWeight ?? 0.7 } }))} />
                    Enable blended region assumptions
                  </label>
                  {config.regionBlend?.enabled && (
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Primary region</label>
                          <select className={inputClass} value={config.regionBlend.primaryRegion} onChange={(e) => setConfig((p) => ({ ...p, regionBlend: { ...p.regionBlend!, primaryRegion: e.target.value as RegionKey } }))}>
                            {Object.entries(REGIONAL_METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Secondary region</label>
                          <select className={inputClass} value={config.regionBlend.secondaryRegion} onChange={(e) => setConfig((p) => ({ ...p, regionBlend: { ...p.regionBlend!, secondaryRegion: e.target.value as RegionKey } }))}>
                            {Object.entries(REGIONAL_METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs text-muted-foreground">
                          Primary weight: {(config.regionBlend.primaryWeight * 100).toFixed(0)}% / Secondary: {((1 - config.regionBlend.primaryWeight) * 100).toFixed(0)}%
                        </label>
                        <input className="w-full accent-primary" type="range" min={0} max={100} step={5} value={Math.round(config.regionBlend.primaryWeight * 100)} onChange={(e) => setConfig((p) => ({ ...p, regionBlend: { ...p.regionBlend!, primaryWeight: Number(e.target.value) / 100 } }))} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                      Writer's Share %
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 text-muted-foreground/60 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px] text-xs">
                            Enter the percentage of publishing this writer/artist controls. Standard writer's share is 50%. If they own both writer and publisher share, enter 100%. If they have a co-publisher taking 50%, enter 25%.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </label>
                    <input className={inputClass} type="text" inputMode="decimal" value={config.publishingSplitPercent ?? ""} onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, publishingSplitPercent: v === "" ? undefined : Number(v) })); }} placeholder="50" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Max age (years)</label>
                    <input className={inputClass} type="text" inputMode="numeric" value={config.onlyIncludeSongsReleasedWithinYears ?? ""} onChange={(e) => setConfig((p) => ({ ...p, onlyIncludeSongsReleasedWithinYears: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Analysis date</label>
                    <input className={inputClass} type="date" value={config.analysisDate ?? ""} onChange={(e) => setConfig((p) => ({ ...p, analysisDate: e.target.value }))} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={saveNewAnalysis} disabled={!userId || saving}>
                    {saving ? "Saving..." : "Save new"}
                  </button>
                  <button className="rounded-xl border border-border px-4 py-2 text-sm text-foreground disabled:opacity-50" onClick={updateExistingAnalysis} disabled={!userId || saving || !selectedAnalysisId}>
                    Update selected
                  </button>
                  <button className="rounded-xl border border-border px-4 py-2 text-sm text-foreground" onClick={() => { setSelectedAnalysisId(null); setAnalysisName("Regional Catalog Analysis"); setAnalysisNotes(""); }}>
                    New draft
                  </button>
                </div>
              </div>
            </div>

            {/* Active assumptions - inline */}
            <div className={cardClass}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">Active market assumptions <span className="text-xs font-normal text-muted-foreground">(publishing-side rates)</span></h2>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground/60 cursor-help flex items-center gap-1">
                        <Info className="w-3 h-3" /> Rate source
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px] text-xs">
                      Per-stream rates shown here are PUBLISHING-SIDE (mechanical) payouts only — the songwriter/publisher portion. They do NOT include the master/recording share. Performance royalties (PRO collections) are added on top as a {(0.15 * 100).toFixed(0)}% uplift. Sourced from the streaming_rates database (updated quarterly).
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground/70">Model</div><div className="text-foreground">{activeResolvedRegion.label}</div></div>
                <div><div className="text-xs text-muted-foreground/70">Spotify rate <span className="text-muted-foreground/50">(pub.)</span></div><div className="text-foreground">${activeResolvedRegion.spotifyPubRatePerStream.toFixed(5)}</div></div>
                <div><div className="text-xs text-muted-foreground/70">YouTube rate <span className="text-muted-foreground/50">(pub.)</span></div><div className="text-foreground">${activeResolvedRegion.youtubePubRatePerView.toFixed(5)}</div></div>
                <div><div className="text-xs text-muted-foreground/70">Hist. collection</div><div className="text-foreground">{(activeResolvedRegion.historicalCollectionRate * 100).toFixed(0)}%</div></div>
                <div><div className="text-xs text-muted-foreground/70">Spotify delay</div><div className="text-foreground">{DSP_DELAYS.spotify} months</div></div>
                <div><div className="text-xs text-muted-foreground/70">YouTube delay</div><div className="text-foreground">{DSP_DELAYS.youtube} months</div></div>
              </div>
            </div>

            {/* Catalog JSON - collapsible */}
            <details className={cardClass}>
              <summary className="cursor-pointer text-lg font-medium flex items-center justify-between gap-2 flex-wrap">
                <span>Catalog JSON ({parsedCatalog.length} songs)</span>
                <div className="flex items-center gap-2">
                  <input
                    ref={csvFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCsvUpload(f);
                      if (csvFileInputRef.current) csvFileInputRef.current.value = "";
                    }}
                  />
                  <button
                    className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20"
                    onClick={(e) => { e.preventDefault(); csvFileInputRef.current?.click(); }}
                    title="Upload a CSV with columns: Title, Artist, Spotify Streams, YouTube Views, Ownership %, Release Date"
                  >
                    Upload CSV
                  </button>
                  <button className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50" onClick={(e) => { e.preventDefault(); setCatalogText(JSON.stringify(sampleCatalog, null, 2)); }}>Load sample</button>
                </div>
              </summary>
              <div className="mt-3">
                <textarea className="min-h-[300px] w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground outline-none focus:border-primary font-mono" value={catalogText} onChange={(e) => setCatalogText(e.target.value)} />
                {parseError ? (
                  <div className="mt-3 rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive">Invalid JSON: {parseError}</div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground space-y-1">
                    <div>
                      Optional per-song fields: <code className="text-primary">regionOverride</code>, <code className="text-primary">ownershipPercent</code>, <code className="text-primary">participantCount</code>, <code className="text-primary">alreadyCollectedAmount</code>, <code className="text-primary">alreadyCollectedPercent</code>.
                    </div>
                    <div>
                      CSV format: header row with <code className="text-primary">Title</code>, <code className="text-primary">Artist</code>, <code className="text-primary">Spotify Streams</code>, <code className="text-primary">YouTube Views</code>, <code className="text-primary">Ownership %</code>, <code className="text-primary">Release Date</code> (optional: Genre, Region, Already Collected). Percentages may be written as <code>50%</code> or <code>0.5</code>.
                    </div>
                  </div>
                )}
              </div>
            </details>


            {/* Empty state when catalog is cleared */}
            {analysis && !parseError && analysis.songs.length === 0 && (
              <div className={cardClass + " text-center py-12"}>
                <p className="text-sm text-muted-foreground">
                  No catalog loaded. Import an artist from the Watchlist, run a search, or paste catalog JSON above to see analysis results.
                </p>
              </div>
            )}

            {/* Results */}
            {analysis && !parseError && analysis.songs.length > 0 && (
              <div ref={resultsRef}>
              <>
                {/* Summary stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>Songs</div>
                    <div className="mt-1 text-lg md:text-xl font-semibold">{formatNumber(analysis.totals.totalSongsIncluded)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>Spotify Streams</div>
                    <div className="mt-1 text-base md:text-lg font-semibold whitespace-nowrap">{formatNumber(analysis.totals.spotifyStreams)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>YouTube Views</div>
                    <div className="mt-1 text-base md:text-lg font-semibold whitespace-nowrap">{formatNumber(analysis.totals.youtubeViews)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>Est. Earnings</div>
                    <div className="mt-1 text-base md:text-lg font-semibold whitespace-nowrap">{formatMoney(analysis.totals.totalIndividualGrossShare)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>Available</div>
                    <div className="mt-1 text-base md:text-lg font-semibold text-primary whitespace-nowrap">{formatMoney(analysis.totals.totalAvailableToCollect)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>3-Year Forecast</div>
                    <div className="mt-1 text-base md:text-lg font-semibold whitespace-nowrap">{formatMoney(analysis.totals.totalIndividualThreeYearCollectible)}</div>
                  </div>
                </div>

                {excludedSongs.length > 0 && (
                  <div className={cardClass}>
                    <h2 className="mb-3 text-lg font-medium">Excluded songs</h2>
                    <div className="space-y-2">
                      {excludedSongs.map((song, idx) => (
                        <div key={`${song.id || song.title}-${idx}`} className="rounded-xl border border-border bg-secondary/30 px-3 py-2">
                          <div className="text-sm font-medium text-foreground">{song.title}</div>
                          <div className="text-xs text-muted-foreground">{song.artist || "Unknown artist"} • {song.excludedReason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Results table */}
                <div className={cardClass}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-medium">Song-level results</h2>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={exportCSV}>
                        <Download className="w-3.5 h-3.5" /> CSV
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={exportPDF}>
                        <Download className="w-3.5 h-3.5" /> PDF
                      </Button>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-[900px] w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border bg-secondary/30 text-xs text-muted-foreground">
                          <th className="px-3 py-2.5 font-medium">Title</th>
                          <th className="px-3 py-2.5 font-medium">Artist</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Spotify</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">YouTube</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Split %</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">Est. Earnings <Info className="w-3 h-3 text-muted-foreground/60" /></span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[340px] text-xs leading-relaxed">
                                  <div className="font-medium mb-1">Est. Earnings formula</div>
                                  <div className="font-mono text-[11px]">
                                    (Spotify × rate + YouTube × rate)<br />
                                    × {(1 + PERFORMANCE_ROYALTY_SHARE).toFixed(2)} (PRO uplift {(PERFORMANCE_ROYALTY_SHARE * 100).toFixed(0)}%)<br />
                                    × Ownership %<br />
                                    × Writer's Share %<br />
                                    × Historical Collection %
                                  </div>
                                  <div className="mt-1.5 text-muted-foreground">Click any row's Est. Earnings cell for the full per-song breakdown.</div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">Available <Info className="w-3 h-3 text-muted-foreground/60" /></span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[260px] text-xs">
                                  Money you've earned from recent streams but haven't received yet. Spotify pays ~{DSP_DELAYS.spotify} months after streams, YouTube ~{DSP_DELAYS.youtube} months after views.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 cursor-help">3yr Forecast <Info className="w-3 h-3 text-muted-foreground/60" /></span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px] text-xs">
                                  Estimated earnings over the next 3 years using genre-specific decay curves. Hip-hop front-loads more revenue in year 1, while catalog/classic tracks maintain steadier streams. DSP payment delays are factored in.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Region</th>
                        </tr>
                      </thead>
                      <tbody>
                        {includedSongs.map((song, idx) => {
                          const globalIdx = analysis.songs.indexOf(song);
                          return (
                          <tr key={`${song.id || song.title}-${idx}`} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="px-3 py-2.5 font-medium max-w-[160px] truncate">{song.title}</td>
                            <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{song.artist || "—"}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(song.spotifyStreams)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(song.youtubeViews)}</td>
                            <td className="px-3 py-1 text-right whitespace-nowrap">
                              <input
                                type="text"
                                inputMode="decimal"
                                className="w-16 rounded border border-border bg-background px-1.5 py-1 text-xs text-right text-foreground outline-none focus:border-primary"
                                value={songOwnershipOverrides[globalIdx] !== undefined ? songOwnershipOverrides[globalIdx] : (song.ownershipPercent * 100).toFixed(1)}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  if (!isNaN(v) && v >= 0 && v <= 100) updateSongOwnership(globalIdx, v);
                                  else if (e.target.value === "") updateSongOwnership(globalIdx, 0);
                                }}
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setBreakdownSong(song)}
                                className="underline decoration-dotted decoration-muted-foreground/40 underline-offset-2 hover:text-primary hover:decoration-primary/60"
                                title="Show earnings breakdown"
                              >
                                {formatMoney(song.individualGrossShare)}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap text-primary">{formatMoney(song.individualAvailableToCollect)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(song.forecast.individualThreeYearCollectible)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap text-muted-foreground">{song.effectiveRegionLabel}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold bg-secondary/20">
                          <td className="px-3 py-2.5" colSpan={2}>Totals</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(analysis.totals.spotifyStreams)}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(analysis.totals.youtubeViews)}</td>
                          <td className="px-3 py-2.5 text-right">—</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(analysis.totals.totalIndividualGrossShare)}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap text-primary">{formatMoney(analysis.totals.totalAvailableToCollect)}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(analysis.totals.totalIndividualThreeYearCollectible)}</td>
                          <td className="px-3 py-2.5 text-right">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* 3-Year Forecast */}
                <div className={cardClass}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-medium">3-Year Forecast Summary</h2>
                    <div className="flex items-center gap-2">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground/60 cursor-help flex items-center gap-1">
                              <Info className="w-3 h-3" /> Genre decay applied
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px] text-xs">
                            Forecasts use genre-specific decay curves that model how streaming revenue changes over time. Different genres have different longevity patterns.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <div className={statLabelClass}>Year 1</div>
                      <div className="mt-1 text-lg font-semibold">{formatMoney(analysis.totals.totalIndividualYear1Gross)}</div>
                      <div className="text-xs text-muted-foreground">Collectible: {formatMoney(analysis.totals.totalIndividualYear1Collectible)}</div>
                      <div className="text-xs text-muted-foreground/60 mt-0.5">Payable ~{DSP_DELAYS.spotify}-{DSP_DELAYS.youtube}mo after earning</div>
                    </div>
                    <div>
                      <div className={statLabelClass}>Year 2</div>
                      <div className="mt-1 text-lg font-semibold">{formatMoney(analysis.totals.totalIndividualYear2Gross)}</div>
                      <div className="text-xs text-muted-foreground">Collectible: {formatMoney(analysis.totals.totalIndividualYear2Collectible)}</div>
                    </div>
                    <div>
                      <div className={statLabelClass}>Year 3</div>
                      <div className="mt-1 text-lg font-semibold">{formatMoney(analysis.totals.totalIndividualYear3Gross)}</div>
                      <div className="text-xs text-muted-foreground">Collectible: {formatMoney(analysis.totals.totalIndividualYear3Collectible)}</div>
                    </div>
                  </div>
                </div>

                {/* Dynamic Catalog Valuation */}
                {analysis && analysis.songs.length > 0 && (
                  <div className={cardClass}>
                    <h2 className="mb-3 text-lg font-medium">Dynamic Catalog Valuation</h2>
                    <CatalogValuationDashboard
                      songs={(() => {
                        const seen = new Set<string>();
                        return analysis.songs
                          .filter((r: SongAnalysisResult) => r.included)
                          .filter((r: SongAnalysisResult) => {
                            const key = `${(r.title || "").trim().toLowerCase()}|${(r.artist || "").trim().toLowerCase()}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                          })
                          .map((r: SongAnalysisResult) => ({
                            id: r.id || `${r.title}-${r.artist}`,
                            title: r.title,
                            artist: r.artist,
                            spotify_streams: r.spotifyStreams,
                            youtube_views: r.youtubeViews,
                            ownership_percent: r.ownershipPercent * 100,
                            country: r.effectiveRegion,
                          }));
                      })()}
                    />
                  </div>
                )}

                {/* Pitch Deck Generator */}
                <div className={cardClass}>
                  <PitchDeckGenerator
                    catalogName={analysisName}
                    songs={includedSongs.map(s => ({
                      title: s.title,
                      artist: s.artist,
                      spotifyStreams: s.spotifyStreams,
                      youtubeViews: s.youtubeViews,
                      ownershipPercent: s.ownershipPercent,
                      genre: undefined,
                    }))}
                    totalValue={analysis.totals.totalIndividualThreeYearCollectible}
                    annualRevenue={analysis.totals.totalIndividualYear1Gross}
                    threeYearForecast={analysis.totals.totalIndividualThreeYearCollectible}
                    availableToCollect={analysis.totals.totalAvailableToCollect}
                    region={config.selectedRegion}
                  />
                </div>
              </>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </AppShell>
  );
}
