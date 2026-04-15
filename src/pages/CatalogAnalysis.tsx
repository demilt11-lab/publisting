import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell, NavSection } from "@/components/layout/AppShell";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchCatalog } from "@/lib/api/catalogLookup";
import { fetchStreamingStats } from "@/lib/api/streamingStats";
import { useStreamingRates } from "@/hooks/useStreamingRates";

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

type CatalogConfig = {
  selectedRegion: RegionKey;
  regionBlend?: RegionBlend;
  defaultParticipantCount: number;
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

const REGIONAL_METRICS: Record<RegionKey, RegionalMetrics> = {
  africa: {
    label: "Africa",
    spotifyPubRatePerStream: 0.00028,
    youtubePubRatePerView: 0.00004,
    spotifyAnnualGrowthRate: 0.02,
    youtubeAnnualGrowthRate: 0.01,
    historicalCollectionRate: 0.75,
    futureCollectionRate: 0.82,
  },
  us_uk: {
    label: "US / UK",
    spotifyPubRatePerStream: 0.0009,
    youtubePubRatePerView: 0.00012,
    spotifyAnnualGrowthRate: 0.01,
    youtubeAnnualGrowthRate: 0.0,
    historicalCollectionRate: 0.9,
    futureCollectionRate: 0.93,
  },
  india: {
    label: "India",
    spotifyPubRatePerStream: 0.00045,
    youtubePubRatePerView: 0.00003,
    spotifyAnnualGrowthRate: 0.04,
    youtubeAnnualGrowthRate: 0.03,
    historicalCollectionRate: 0.8,
    futureCollectionRate: 0.86,
  },
  latam: {
    label: "Latin America",
    spotifyPubRatePerStream: 0.0005,
    youtubePubRatePerView: 0.00005,
    spotifyAnnualGrowthRate: 0.03,
    youtubeAnnualGrowthRate: 0.02,
    historicalCollectionRate: 0.8,
    futureCollectionRate: 0.85,
  },
  global_blended: {
    label: "Global Blended",
    spotifyPubRatePerStream: 0.00065,
    youtubePubRatePerView: 0.00007,
    spotifyAnnualGrowthRate: 0.015,
    youtubeAnnualGrowthRate: 0.01,
    historicalCollectionRate: 0.85,
    futureCollectionRate: 0.9,
  },
};

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

function resolveRegionalConfig(config: CatalogConfig, explicitRegion?: RegionKey) {
  if (explicitRegion) {
    const region = REGIONAL_METRICS[explicitRegion];
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
    const p = REGIONAL_METRICS[blend.primaryRegion];
    const s = REGIONAL_METRICS[blend.secondaryRegion];
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
  const region = REGIONAL_METRICS[config.selectedRegion];
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

function analyzeSong(song: CatalogSong, config: CatalogConfig): SongAnalysisResult {
  const inclusion = shouldIncludeSong(song, config);
  const regional = resolveRegionalConfig(config, song.regionOverride);
  const spotifyStreams = Math.max(0, safeNum(song.spotifyStreams));
  const youtubeViews = Math.max(0, safeNum(song.youtubeViews));
  const spotifyRate = Math.max(0, safeNum(song.spotifyPubRatePerStream ?? regional.spotifyPubRatePerStream));
  const youtubeRate = Math.max(0, safeNum(song.youtubePubRatePerView ?? regional.youtubePubRatePerView));
  const spotifyPublishingEstimated = spotifyStreams * spotifyRate;
  const youtubePublishingEstimated = youtubeViews * youtubeRate;
  const totalPublishingEstimated = spotifyPublishingEstimated + youtubePublishingEstimated;
  const participantCount = Math.max(1, Math.floor(safeNum(song.participantCount ?? config.defaultParticipantCount)));
  const ownershipPercent = typeof song.ownershipPercent === "number" ? clamp01(song.ownershipPercent) : 1 / participantCount;
  const individualGrossShare = totalPublishingEstimated * ownershipPercent;

  let individualAlreadyCollected = 0;
  if (typeof song.alreadyCollectedAmount === "number") individualAlreadyCollected = Math.max(0, safeNum(song.alreadyCollectedAmount));
  else if (typeof song.alreadyCollectedPercent === "number") individualAlreadyCollected = individualGrossShare * clamp01(song.alreadyCollectedPercent);
  else individualAlreadyCollected = individualGrossShare * clamp01(regional.historicalCollectionRate);

  const individualAvailableToCollect = Math.max(0, individualGrossShare - individualAlreadyCollected);
  const spotifyGrowth = safeNum(regional.spotifyAnnualGrowthRate);
  const youtubeGrowth = safeNum(regional.youtubeAnnualGrowthRate);
  const yearGross = (year: number) => spotifyStreams * Math.pow(1 + spotifyGrowth, year - 1) * spotifyRate + youtubeViews * Math.pow(1 + youtubeGrowth, year - 1) * youtubeRate;

  const year1Gross = yearGross(1);
  const year2Gross = yearGross(2);
  const year3Gross = yearGross(3);
  const threeYearGrossTotal = year1Gross + year2Gross + year3Gross;

  return {
    id: song.id, title: song.title, artist: song.artist,
    included: inclusion.included, excludedReason: inclusion.excludedReason,
    spotifyStreams, youtubeViews, spotifyPublishingEstimated, youtubePublishingEstimated, totalPublishingEstimated,
    ownershipPercent, individualGrossShare, individualAlreadyCollected, individualAvailableToCollect,
    releaseDate: song.releaseDate, ageInYears: inclusion.ageInYears,
    effectiveRegion: String(regional.effectiveRegionKey), effectiveRegionLabel: regional.label,
    forecast: {
      year1Gross, year2Gross, year3Gross, threeYearGrossTotal,
      individualYear1Gross: year1Gross * ownershipPercent,
      individualYear2Gross: year2Gross * ownershipPercent,
      individualYear3Gross: year3Gross * ownershipPercent,
      individualThreeYearGross: threeYearGrossTotal * ownershipPercent,
      individualYear1Collectible: year1Gross * ownershipPercent * clamp01(regional.futureCollectionRate),
      individualYear2Collectible: year2Gross * ownershipPercent * clamp01(regional.futureCollectionRate),
      individualYear3Collectible: year3Gross * ownershipPercent * clamp01(regional.futureCollectionRate),
      individualThreeYearCollectible: threeYearGrossTotal * ownershipPercent * clamp01(regional.futureCollectionRate),
    },
  };
}

function analyzeCatalog(songs: CatalogSong[], config: CatalogConfig): CatalogAnalysisResult {
  const songResults = songs.map((s) => analyzeSong(s, config));
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
  const [searchParams] = useSearchParams();

  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [analysisName, setAnalysisName] = useState("Regional Catalog Analysis");
  const [analysisNotes, setAnalysisNotes] = useState("");
  const [catalogText, setCatalogText] = useState(JSON.stringify(sampleCatalog, null, 2));
  const [parseError, setParseError] = useState("");
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [importingCatalog, setImportingCatalog] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const importedRef = useRef(false);

  const [config, setConfig] = useState<CatalogConfig>({
    selectedRegion: "africa",
    regionBlend: { enabled: false, primaryRegion: "africa", secondaryRegion: "us_uk", primaryWeight: 0.7 },
    defaultParticipantCount: 2,
    onlyIncludeSongsReleasedWithinYears: 3,
    analysisDate: "2026-04-13",
  });

  // Auto-import catalog from URL params (when navigating from artist card "Catalog" button)
  useEffect(() => {
    const artistParam = searchParams.get("artist");
    const roleParam = searchParams.get("role") || "artist";
    if (!artistParam || importedRef.current) return;
    importedRef.current = true;

    const importCatalog = async () => {
      setImportingCatalog(true);
      setImportProgress(`Fetching catalog for ${artistParam}...`);
      setAnalysisName(`${artistParam} — Catalog Analysis`);

      try {
        const data = await fetchCatalog(artistParam, roleParam);
        if (!data || data.songs.length === 0) {
          setStatus(`No catalog data found for "${artistParam}".`);
          setImportingCatalog(false);
          return;
        }

        setImportProgress(`Found ${data.songs.length} songs. Enriching with streaming data...`);

        // Enrich songs with streaming stats progressively
        const BATCH = 8;
        const enriched = [...data.songs];
        for (let i = 0; i < enriched.length; i += BATCH) {
          const batch = enriched.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map(async (song) => {
              const stats = await fetchStreamingStats(song.title, song.artist);
              const spotifyCount = stats?.spotify?.streamCount ?? stats?.spotify?.estimatedStreams ?? null;
              const ytViewStr = stats?.youtube?.viewCount || null;
              const ytViews = ytViewStr ? parseInt(ytViewStr.replace(/,/g, ""), 10) : 0;
              return {
                ...song,
                spotifyStreamCount: spotifyCount,
                youtubeViews: ytViewStr,
                _spotifyNum: spotifyCount ?? 0,
                _youtubeNum: ytViews,
              };
            })
          );
          results.forEach((r, idx) => {
            if (r.status === "fulfilled") {
              const songIdx = i + idx;
              if (songIdx < enriched.length) enriched[songIdx] = r.value as any;
            }
          });
          setImportProgress(`Enriched ${Math.min(i + BATCH, enriched.length)} of ${enriched.length} songs...`);
        }

        // Convert to CatalogAnalysis format
        const catalogSongs: CatalogSong[] = enriched.map((song: any, idx) => ({
          id: String(idx),
          title: song.title,
          artist: song.artist || artistParam,
          spotifyStreams: song._spotifyNum || song.spotifyStreamCount || 0,
          youtubeViews: song._youtubeNum || 0,
          ownershipPercent: song.publishingShare ? song.publishingShare / 100 : undefined,
          releaseDate: song.releaseDate || undefined,
        }));

        setCatalogText(JSON.stringify(catalogSongs, null, 2));
        setStatus(`Imported ${catalogSongs.length} songs for "${artistParam}". Adjust region and parameters, then review results.`);
      } catch (err) {
        console.error("Catalog import failed:", err);
        setStatus(`Failed to import catalog for "${artistParam}".`);
      } finally {
        setImportingCatalog(false);
        setImportProgress("");
      }
    };

    importCatalog();
  }, [searchParams]);

  const parsedCatalog = useMemo(() => {
    try {
      setParseError("");
      const parsed = JSON.parse(catalogText);
      if (!Array.isArray(parsed)) throw new Error("Catalog must be a JSON array");
      return parsed as CatalogSong[];
    } catch (err: any) {
      setParseError(err.message || "Invalid JSON");
      return [];
    }
  }, [catalogText]);

  const analysis = useMemo(() => {
    if (parseError) return null;
    return analyzeCatalog(parsedCatalog, config);
  }, [parsedCatalog, config, parseError]);

  const includedSongs = analysis?.songs.filter((s) => s.included) || [];
  const excludedSongs = analysis?.songs.filter((s) => !s.included) || [];
  const activeResolvedRegion = resolveRegionalConfig(config);

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

  const navigate = useNavigate();
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
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            {userId ? "Signed in" : "Not signed in"}
          </div>
        </div>

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
                  <div className="text-sm text-muted-foreground">{userId ? "No saved analyses yet." : "Sign in to load saved analyses."}</div>
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
                    <select className={inputClass} value={config.selectedRegion} onChange={(e) => setConfig((p) => ({ ...p, selectedRegion: e.target.value as RegionKey }))}>
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Default split count</label>
                    <input className={inputClass} type="number" value={config.defaultParticipantCount} onChange={(e) => setConfig((p) => ({ ...p, defaultParticipantCount: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Max age (years)</label>
                    <input className={inputClass} type="number" value={config.onlyIncludeSongsReleasedWithinYears ?? ""} onChange={(e) => setConfig((p) => ({ ...p, onlyIncludeSongsReleasedWithinYears: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Analysis date</label>
                    <input className={inputClass} type="date" value={config.analysisDate ?? ""} onChange={(e) => setConfig((p) => ({ ...p, analysisDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Spotify pub override</label>
                    <input className={inputClass} type="number" step="0.000001" value={config.defaultSpotifyPubRatePerStream ?? ""} onChange={(e) => setConfig((p) => ({ ...p, defaultSpotifyPubRatePerStream: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">YouTube pub override</label>
                    <input className={inputClass} type="number" step="0.000001" value={config.defaultYoutubePubRatePerView ?? ""} onChange={(e) => setConfig((p) => ({ ...p, defaultYoutubePubRatePerView: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Historical collection</label>
                    <input className={inputClass} type="number" step="0.01" value={config.historicalCollectionRate ?? ""} onChange={(e) => setConfig((p) => ({ ...p, historicalCollectionRate: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Future collection</label>
                    <input className={inputClass} type="number" step="0.01" value={config.futureCollectionRate ?? ""} onChange={(e) => setConfig((p) => ({ ...p, futureCollectionRate: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Spotify growth</label>
                    <input className={inputClass} type="number" step="0.01" value={config.spotifyAnnualGrowthRate ?? ""} onChange={(e) => setConfig((p) => ({ ...p, spotifyAnnualGrowthRate: e.target.value === "" ? undefined : Number(e.target.value) }))} />
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
              <h2 className="mb-3 text-sm font-medium">Active market assumptions</h2>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground/70">Model</div><div className="text-foreground">{activeResolvedRegion.label}</div></div>
                <div><div className="text-xs text-muted-foreground/70">Spotify rate</div><div className="text-foreground">{activeResolvedRegion.spotifyPubRatePerStream}</div></div>
                <div><div className="text-xs text-muted-foreground/70">YouTube rate</div><div className="text-foreground">{activeResolvedRegion.youtubePubRatePerView}</div></div>
                <div><div className="text-xs text-muted-foreground/70">Hist. collection</div><div className="text-foreground">{(activeResolvedRegion.historicalCollectionRate * 100).toFixed(0)}%</div></div>
                <div><div className="text-xs text-muted-foreground/70">Spotify growth</div><div className="text-foreground">{(activeResolvedRegion.spotifyAnnualGrowthRate * 100).toFixed(1)}%</div></div>
                <div><div className="text-xs text-muted-foreground/70">YouTube growth</div><div className="text-foreground">{(activeResolvedRegion.youtubeAnnualGrowthRate * 100).toFixed(1)}%</div></div>
              </div>
            </div>

            {/* Catalog JSON - collapsible */}
            <details className={cardClass}>
              <summary className="cursor-pointer text-lg font-medium flex items-center justify-between">
                <span>Catalog JSON ({parsedCatalog.length} songs)</span>
                <button className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/50" onClick={(e) => { e.preventDefault(); setCatalogText(JSON.stringify(sampleCatalog, null, 2)); }}>Load sample</button>
              </summary>
              <div className="mt-3">
                <textarea className="min-h-[300px] w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground outline-none focus:border-primary font-mono" value={catalogText} onChange={(e) => setCatalogText(e.target.value)} />
                {parseError ? (
                  <div className="mt-3 rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive">Invalid JSON: {parseError}</div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Optional per-song fields: <code className="text-primary">regionOverride</code>, <code className="text-primary">ownershipPercent</code>, <code className="text-primary">participantCount</code>, <code className="text-primary">alreadyCollectedAmount</code>, <code className="text-primary">alreadyCollectedPercent</code>.
                  </div>
                )}
              </div>
            </details>

            {/* Results */}
            {analysis && !parseError && (
              <>
                {/* Summary stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>Total Pub Est.</div>
                    <div className="mt-1 text-lg md:text-xl font-semibold truncate">{formatMoney(analysis.totals.totalPublishingEstimated)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>Available</div>
                    <div className="mt-1 text-lg md:text-xl font-semibold text-primary truncate">{formatMoney(analysis.totals.totalAvailableToCollect)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>3-Year Collect.</div>
                    <div className="mt-1 text-lg md:text-xl font-semibold truncate">{formatMoney(analysis.totals.totalIndividualThreeYearCollectible)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>Songs</div>
                    <div className="mt-1 text-lg md:text-xl font-semibold">{formatNumber(analysis.totals.totalSongsIncluded)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>Spotify Streams</div>
                    <div className="mt-1 text-base md:text-lg font-semibold truncate">{formatNumber(analysis.totals.spotifyStreams)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>YouTube Views</div>
                    <div className="mt-1 text-base md:text-lg font-semibold truncate">{formatNumber(analysis.totals.youtubeViews)}</div>
                  </div>
                  <div className={cardClass + " text-center"}>
                    <div className={statLabelClass}>Gross Share</div>
                    <div className="mt-1 text-base md:text-lg font-semibold truncate">{formatMoney(analysis.totals.totalIndividualGrossShare)}</div>
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
                  <h2 className="mb-3 text-lg font-medium">Song-level results</h2>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="min-w-[900px] w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border bg-secondary/30 text-xs text-muted-foreground">
                          <th className="px-3 py-2.5 font-medium">Title</th>
                          <th className="px-3 py-2.5 font-medium">Artist</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Spotify</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">YouTube</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Pub Est.</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Own %</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Gross Share</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Available</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">3yr Collect.</th>
                          <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Region</th>
                        </tr>
                      </thead>
                      <tbody>
                        {includedSongs.map((song, idx) => (
                          <tr key={`${song.id || song.title}-${idx}`} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="px-3 py-2.5 font-medium max-w-[160px] truncate">{song.title}</td>
                            <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{song.artist || "—"}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(song.spotifyStreams)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(song.youtubeViews)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(song.totalPublishingEstimated)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatPercent(song.ownershipPercent)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(song.individualGrossShare)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap text-primary">{formatMoney(song.individualAvailableToCollect)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(song.forecast.individualThreeYearCollectible)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap text-muted-foreground">{song.effectiveRegionLabel}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold bg-secondary/20">
                          <td className="px-3 py-2.5" colSpan={2}>Totals</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(analysis.totals.spotifyStreams)}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(analysis.totals.youtubeViews)}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(analysis.totals.totalPublishingEstimated)}</td>
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
                  <h2 className="mb-3 text-lg font-medium">3-Year Forecast Summary</h2>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <div className={statLabelClass}>Year 1 (Individual)</div>
                      <div className="mt-1 text-lg font-semibold">{formatMoney(analysis.totals.totalIndividualYear1Gross)}</div>
                      <div className="text-xs text-muted-foreground">Collectible: {formatMoney(analysis.totals.totalIndividualYear1Collectible)}</div>
                    </div>
                    <div>
                      <div className={statLabelClass}>Year 2 (Individual)</div>
                      <div className="mt-1 text-lg font-semibold">{formatMoney(analysis.totals.totalIndividualYear2Gross)}</div>
                      <div className="text-xs text-muted-foreground">Collectible: {formatMoney(analysis.totals.totalIndividualYear2Collectible)}</div>
                    </div>
                    <div>
                      <div className={statLabelClass}>Year 3 (Individual)</div>
                      <div className="mt-1 text-lg font-semibold">{formatMoney(analysis.totals.totalIndividualYear3Gross)}</div>
                      <div className="text-xs text-muted-foreground">Collectible: {formatMoney(analysis.totals.totalIndividualYear3Collectible)}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </AppShell>
  );
}
