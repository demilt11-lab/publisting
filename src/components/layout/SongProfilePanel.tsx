import { memo, useState, useMemo, useCallback, useImperativeHandle, forwardRef, useEffect } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { X, Shield, Music, FileText, Users, BarChart3, Mail, Copy, Check } from "lucide-react";
import { MultiSourceResult } from "@/lib/types/multiSource";
import { CollectingPublisher } from "@/lib/api/songLookup";
import { classifyLabel, classifyPublisher } from "@/lib/labelClassifier";
import { useFilterPreferences } from "@/hooks/useFilterPreferences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Credit } from "@/components/CreditsSection";
import { ChartPlacement } from "@/lib/api/chartLookup";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { fetchStreamingStats, StreamingStats } from "@/lib/api/streamingStats";

import { SummaryTab } from "@/components/tabs/SummaryTab";
import { FullCreditsTab } from "@/components/tabs/FullCreditsTab";
import { ExposureTab } from "@/components/tabs/ExposureTab";
import { ContactsTab } from "@/components/tabs/ContactsTab";


interface SongProfilePanelProps {
  songData: {
    title: string;
    artist: string;
    album?: string;
    coverUrl?: string;
    recordLabel?: string;
    isrc?: string;
    releaseDate?: string;
  };
  credits: Credit[];
  chartPlacements: ChartPlacement[];
  isLoadingPro: boolean;
  isLoadingShares: boolean;
  proError: string | null;
  onRetryPro: () => void;
  onViewCatalog: (name: string, role: string) => void;
  onClose?: () => void;
  songProjectData?: {
    title: string;
    artist: string;
    coverUrl?: string;
    writersCount: number;
    publishersCount: number;
    publishingMix: "indie" | "mixed" | "major";
    labelType: "indie" | "major";
    signingStatus: "high" | "medium" | "low";
    recordLabel?: string;
  } | null;
  multiSourceData?: MultiSourceResult | null;
  isLoadingMultiSource?: boolean;
  collectingPublishers?: CollectingPublisher[];
  detectedOrgs?: string[];
}

export interface SongProfilePanelHandle {
  setActiveTab: (tab: string) => void;
}


const SIGNING_STATUS_CONFIG = {
  high: { label: "Mostly Signed", cls: "bg-success/15 text-success border-success/25" },
  medium: { label: "Partially Signed", cls: "bg-warning/15 text-warning border-warning/25" },
  low: { label: "Mostly Unsigned", cls: "bg-destructive/15 text-destructive border-destructive/25" },
};

const TAB_CONFIG = [
  { value: "summary", label: "Summary", icon: FileText },
  { value: "credits", label: "Full Credits", icon: Users },
  { value: "exposure", label: "Exposure", icon: BarChart3 },
  { value: "contacts", label: "Contacts", icon: Mail },
];

export const SongProfilePanel = memo(forwardRef<SongProfilePanelHandle, SongProfilePanelProps>(({
  songData, credits, chartPlacements, isLoadingPro, isLoadingShares,
  proError, onRetryPro, onViewCatalog, onClose, songProjectData, multiSourceData, isLoadingMultiSource,
  collectingPublishers, detectedOrgs,
}, ref) => {
  const [activeTab, setActiveTab] = useState("summary");
  const [copied, setCopied] = useState(false);
  const [streamingStats, setStreamingStats] = useState<StreamingStats | null>(null);
  const { filters: creditFilters, setFilters: setCreditFilters, resetFilters: resetCreditFilters } = useFilterPreferences();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setStreamingStats(null);
    if (songData.title && songData.artist) {
      fetchStreamingStats(songData.title, songData.artist).then(stats => {
        if (!cancelled) setStreamingStats(stats);
      });
    }
    return () => { cancelled = true; };
  }, [songData.title, songData.artist]);

  useImperativeHandle(ref, () => ({ setActiveTab }), []);

  const signingStatus = useMemo(() => {
    if (credits.length === 0) return "low" as const;
    const signedRatio = credits.filter(c => c.publisher).length / credits.length;
    return signedRatio >= 0.8 ? "high" as const : signedRatio >= 0.5 ? "medium" as const : "low" as const;
  }, [credits]);

  const statusConfig = SIGNING_STATUS_CONFIG[signingStatus];

  const publishingMix = useMemo(() => {
    const pubs = Array.from(new Set(credits.filter(c => c.publisher).map(c => c.publisher)));
    const majorCount = pubs.filter(p => classifyPublisher(p!) === 'major').length;
    return majorCount === 0 ? "Indie" : majorCount === pubs.length ? "Major" : "Mixed";
  }, [credits]);

  const labelType = useMemo(() => {
    if (!songData.recordLabel) return "Unknown";
    return classifyLabel(songData.recordLabel) === 'major' ? "Major" : "Indie";
  }, [songData.recordLabel]);

  const handleCopySummary = useCallback(() => {
    const writers = credits.filter(c => c.role === "writer");
    const producers = credits.filter(c => c.role === "producer");
    const signed = credits.filter(c => c.publisher).length;
    const unsigned = credits.length - signed;

    const lines = [
      `🎵 ${songData.title} — ${songData.artist}`,
      songData.releaseDate ? `📅 ${songData.releaseDate}` : null,
      songData.recordLabel ? `🏷️ Label: ${songData.recordLabel} (${labelType})` : null,
      "",
      `✍️ Writers (${writers.length}): ${writers.slice(0, 5).map(w => `${w.name}${w.publisher ? ` [${w.publisher}]` : ""}`).join(", ")}${writers.length > 5 ? ` +${writers.length - 5} more` : ""}`,
      `🎛️ Producers (${producers.length}): ${producers.slice(0, 3).map(p => p.name).join(", ")}${producers.length > 3 ? ` +${producers.length - 3} more` : ""}`,
      "",
      `📊 Signing: ${signed} signed, ${unsigned} unsigned/unknown`,
      `📈 Publishing: ${publishingMix} | Charts: ${chartPlacements.length} placement${chartPlacements.length !== 1 ? "s" : ""}`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      toast({ title: "Summary copied!", description: "Song overview copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [songData, credits, chartPlacements, publishingMix, labelType, toast]);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* ─── Song Header ─── */}
        <div className="px-6 py-5 border-b border-border/50 bg-card">
          <div className="flex items-start gap-5">
            {songData.coverUrl ? (
              <img
                src={songData.coverUrl}
                alt={songData.title}
                className="w-20 h-20 rounded-xl object-cover shrink-0 border border-border/50 shadow-lg shadow-black/20"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-secondary border border-border/50 flex items-center justify-center shrink-0">
                <Music className="w-8 h-8 text-muted-foreground" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold text-foreground truncate leading-tight">
                    {songData.title}
                  </h2>
                  <p className="text-sm font-medium text-primary mt-0.5 truncate">
                    {songData.artist}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground w-8 h-8" onClick={handleCopySummary}>
                        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Copy song summary to clipboard</TooltipContent>
                  </Tooltip>
                  {onClose && (
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground w-8 h-8" onClick={onClose}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Signing status summary line */}
              {credits.length > 0 && (() => {
                const writers = credits.filter(c => c.role === "writer");
                const producers = credits.filter(c => c.role === "producer");
                const writersSigned = writers.filter(c => c.publisher).length;
                const writersUnsigned = writers.length - writersSigned;
                const prodSigned = producers.filter(c => c.publisher).length;
                const prodUnknown = producers.length - prodSigned;
                return (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Writers: {writers.length} ({writersSigned} pub-signed, {writersUnsigned} unsigned) · Producers: {producers.length} ({prodSigned} signed, {prodUnknown} unknown)
                  </p>
                );
              })()}

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 font-medium", statusConfig.cls)}>
                  <Shield className="w-3 h-3 mr-1" />
                  {statusConfig.label}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-secondary/80 text-secondary-foreground border-border/60">
                  {publishingMix} pub
                </Badge>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-secondary/80 text-secondary-foreground border-border/60">
                  {labelType} label
                </Badge>
                {songData.releaseDate && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-secondary/80 text-secondary-foreground border-border/60">
                    {songData.releaseDate}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Tab Bar ─── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full px-4 py-0 border-b border-border/50 justify-start bg-transparent shrink-0 h-auto">
            {TAB_CONFIG.map((tab, i) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    "text-xs gap-1.5 py-3 px-3 rounded-none border-b-2 border-transparent transition-all",
                    "data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:bg-transparent",
                    "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="flex-1 overflow-auto">
            <TabsContent value="summary" className="p-6 m-0 animate-fade-in">
              <ErrorBoundary fallbackTitle="Summary failed to load" compact>
                <SummaryTab
                  credits={credits}
                  chartPlacements={chartPlacements}
                  recordLabel={songData.recordLabel}
                  onSwitchTab={setActiveTab}
                  songTitle={songData.title}
                  songArtist={songData.artist}
                  songProjectData={songProjectData}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="credits" className="p-6 m-0 animate-fade-in">
              <ErrorBoundary fallbackTitle="Credits failed to load">
                <FullCreditsTab
                  credits={credits}
                  isLoadingPro={isLoadingPro}
                  isLoadingShares={isLoadingShares}
                  proError={proError}
                  onRetryPro={onRetryPro}
                  onViewCatalog={onViewCatalog}
                  songTitle={songData.title}
                  songArtist={songData.artist}
                  songAlbum={songData.album}
                  isrc={songData.isrc}
                  recordLabel={songData.recordLabel}
                  streamingStats={streamingStats}
                  creditFilters={creditFilters}
                  onCreditFiltersChange={setCreditFilters}
                  onResetCreditFilters={resetCreditFilters}
                  multiSourceData={multiSourceData}
                  isLoadingMultiSource={isLoadingMultiSource}
                  collectingPublishers={collectingPublishers}
                  detectedOrgs={detectedOrgs}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="exposure" className="p-6 m-0 animate-fade-in">
              <ErrorBoundary fallbackTitle="Exposure data failed to load" compact>
                <ExposureTab
                  songTitle={songData.title}
                  artist={songData.artist}
                  chartPlacements={chartPlacements}
                />
              </ErrorBoundary>
            </TabsContent>

            <TabsContent value="contacts" className="p-6 m-0 animate-fade-in">
              <ErrorBoundary fallbackTitle="Contacts failed to load" compact>
                <ContactsTab
                  artist={songData.artist}
                  songTitle={songData.title}
                  credits={credits}
                  recordLabel={songData.recordLabel}
                />
              </ErrorBoundary>
            </TabsContent>

          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}));

SongProfilePanel.displayName = "SongProfilePanel";
