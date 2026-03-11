import { memo, useState, useMemo } from "react";
import { X, Shield, Music, Eye, FileText, Users, BarChart3, Mail, Kanban } from "lucide-react";
import { useFilterPreferences } from "@/hooks/useFilterPreferences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Credit } from "@/components/CreditsSection";
import { ChartPlacement } from "@/lib/api/chartLookup";
import { cn } from "@/lib/utils";

import { SummaryTab } from "@/components/tabs/SummaryTab";
import { FullCreditsTab } from "@/components/tabs/FullCreditsTab";
import { ExposureTab } from "@/components/tabs/ExposureTab";
import { ContactsTab } from "@/components/tabs/ContactsTab";
import { PipelineTab } from "@/components/tabs/PipelineTab";

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
}

const MAJOR_PUBLISHERS = ["sony", "universal", "warner", "bmg", "kobalt", "concord"];
const MAJOR_LABELS = ["universal", "sony", "warner", "emi", "atlantic", "capitol", "interscope"];

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
  { value: "pipeline", label: "Watchlist / Pipeline", icon: Eye },
];

export const SongProfilePanel = memo(({
  songData, credits, chartPlacements, isLoadingPro, isLoadingShares,
  proError, onRetryPro, onViewCatalog, onClose, songProjectData,
}: SongProfilePanelProps) => {
  const [activeTab, setActiveTab] = useState("summary");
  const { filters: creditFilters, setFilters: setCreditFilters, resetFilters: resetCreditFilters } = useFilterPreferences();

  const signingStatus = useMemo(() => {
    if (credits.length === 0) return "low" as const;
    const signedRatio = credits.filter(c => c.publisher).length / credits.length;
    return signedRatio >= 0.8 ? "high" as const : signedRatio >= 0.5 ? "medium" as const : "low" as const;
  }, [credits]);

  const statusConfig = SIGNING_STATUS_CONFIG[signingStatus];

  const publishingMix = useMemo(() => {
    const pubs = Array.from(new Set(credits.filter(c => c.publisher).map(c => c.publisher)));
    const majorCount = pubs.filter(p => MAJOR_PUBLISHERS.some(m => p!.toLowerCase().includes(m))).length;
    return majorCount === 0 ? "Indie" : majorCount === pubs.length ? "Major" : "Mixed";
  }, [credits]);

  const labelType = useMemo(() => {
    if (!songData.recordLabel) return "Unknown";
    return MAJOR_LABELS.some(m => songData.recordLabel!.toLowerCase().includes(m)) ? "Major" : "Indie";
  }, [songData.recordLabel]);

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
                {onClose && (
                  <Button variant="ghost" size="icon" className="shrink-0 -mt-1 -mr-2 text-muted-foreground hover:text-foreground" onClick={onClose}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-3">
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="w-full px-4 py-0 border-b border-border/50 justify-start bg-transparent shrink-0 h-auto">
            {TAB_CONFIG.map((tab) => {
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
              <SummaryTab
                credits={credits}
                chartPlacements={chartPlacements}
                recordLabel={songData.recordLabel}
                onSwitchTab={setActiveTab}
                songProjectData={songProjectData}
              />
            </TabsContent>

            <TabsContent value="credits" className="p-6 m-0 animate-fade-in">
              <FullCreditsTab
                credits={credits}
                isLoadingPro={isLoadingPro}
                isLoadingShares={isLoadingShares}
                proError={proError}
                onRetryPro={onRetryPro}
                onViewCatalog={onViewCatalog}
                songTitle={songData.title}
                songArtist={songData.artist}
                creditFilters={creditFilters}
                onCreditFiltersChange={setCreditFilters}
                onResetCreditFilters={resetCreditFilters}
              />
            </TabsContent>

            <TabsContent value="exposure" className="p-6 m-0 animate-fade-in">
              <ExposureTab
                songTitle={songData.title}
                artist={songData.artist}
                chartPlacements={chartPlacements}
              />
            </TabsContent>

            <TabsContent value="contacts" className="p-6 m-0 animate-fade-in">
              <ContactsTab
                artist={songData.artist}
                songTitle={songData.title}
                credits={credits}
                recordLabel={songData.recordLabel}
              />
            </TabsContent>

            <TabsContent value="pipeline" className="p-6 m-0 animate-fade-in">
              <PipelineTab
                songTitle={songData.title}
                songArtist={songData.artist}
                credits={credits}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
});

SongProfilePanel.displayName = "SongProfilePanel";
