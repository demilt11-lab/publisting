import { memo, useState, useMemo } from "react";
import { X, Shield, HelpCircle, Building2, ChevronRight, Mail, Users, FolderOpen, FileText, BarChart3, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Credit, CreditsSection } from "@/components/CreditsSection";
import { PublishingSplitChart } from "@/components/PublishingSplitChart";
import { ChartDetailsSection } from "@/components/ChartPlacements";
import { RadioAirplayPanel } from "@/components/RadioAirplayPanel";
import { OutreachPanel } from "@/components/OutreachPanel";
import { ProjectSelector } from "@/components/ProjectSelector";
import { MethodologyPopover } from "@/components/MethodologyPopover";
import { ChartPlacement } from "@/lib/api/chartLookup";
import { cn } from "@/lib/utils";

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
    dealability: "high" | "medium" | "low";
    recordLabel?: string;
  } | null;
}

const MAJOR_PUBLISHERS = ["sony", "universal", "warner", "bmg", "kobalt", "concord"];
const MAJOR_LABELS = ["universal", "sony", "warner", "emi", "atlantic", "capitol", "interscope"];

const DEALABILITY_CONFIG = {
  high: { 
    label: "Easier to deal", 
    cls: "bg-[#052E16] text-[#16A34A] border-[#14532D]",
    desc: "Few writers, clear admin ownership"
  },
  medium: { 
    label: "Moderate complexity", 
    cls: "bg-[#451A03] text-[#D97706] border-[#4A2F05]",
    desc: "Some complexity in splits or ownership"
  },
  low: { 
    label: "Complex deal", 
    cls: "bg-[#450A0A] text-[#DC2626] border-[#7F1D1D]",
    desc: "Many writers or unclear admin"
  },
};

export const SongProfilePanel = memo(({
  songData,
  credits,
  chartPlacements,
  isLoadingPro,
  isLoadingShares,
  proError,
  onRetryPro,
  onViewCatalog,
  onClose,
  songProjectData,
}: SongProfilePanelProps) => {
  const [activeTab, setActiveTab] = useState("summary");

  // Compute summary data
  const summaryData = useMemo(() => {
    const writers = credits.filter(c => c.role === "writer");
    const producers = credits.filter(c => c.role === "producer");
    const publishers = new Set(credits.filter(c => c.publisher).map(c => c.publisher));
    const pubList = Array.from(publishers);
    
    const majorCount = pubList.filter(p => 
      MAJOR_PUBLISHERS.some(m => p!.toLowerCase().includes(m))
    ).length;
    const publishingMix = majorCount === 0 ? "Mostly indie" : 
      majorCount === pubList.length ? "Major publishers" : "Mixed (indie + major)";
    
    const isMajorLabel = songData.recordLabel && 
      MAJOR_LABELS.some(m => songData.recordLabel!.toLowerCase().includes(m));
    const labelType = isMajorLabel ? "Major label" : "Indie label";
    
    const signedRatio = credits.length > 0 
      ? credits.filter(c => c.publisher).length / credits.length 
      : 0;
    const dealability = signedRatio >= 0.8 && publishers.size <= 2 
      ? "high" : signedRatio >= 0.5 ? "medium" : "low";
    
    const keyWriters = writers.slice(0, 5).map(w => ({
      name: w.name,
      pro: w.pro,
      publisher: w.publisher,
      isMajor: w.publisher ? MAJOR_PUBLISHERS.some(m => w.publisher!.toLowerCase().includes(m)) : false,
    }));
    
    const keyPublishers = pubList.slice(0, 3).map(pub => ({
      name: pub!,
      isMajor: MAJOR_PUBLISHERS.some(m => pub!.toLowerCase().includes(m)),
    }));

    // Chart summary
    const chartSummary = chartPlacements.length > 0
      ? `Peaked #${Math.min(...chartPlacements.map(c => c.peakPosition || 100))} on ${chartPlacements[0]?.chart || "charts"}`
      : null;

    return {
      writersCount: writers.length,
      producersCount: producers.length,
      publishersCount: publishers.size,
      publishingMix,
      labelType,
      dealability,
      keyWriters,
      keyPublishers,
      chartSummary,
    };
  }, [credits, songData.recordLabel, chartPlacements]);

  const dealConfig = DEALABILITY_CONFIG[summaryData.dealability];

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-5 border-b border-border/50 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-foreground truncate">{songData.title}</h2>
              <p className="text-sm text-primary truncate">{songData.artist}</p>
            </div>
            {onClose && (
              <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={cn("text-xs px-2.5 py-1 cursor-help", dealConfig.cls)}>
                  <Shield className="w-3 h-3 mr-1.5" />
                  {dealConfig.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px]">
                <p className="font-medium">{dealConfig.label}</p>
                <p className="text-xs text-muted-foreground">{dealConfig.desc}</p>
              </TooltipContent>
            </Tooltip>

            <Badge variant="outline" className="text-xs bg-surface text-secondary-foreground">
              Publishing: {summaryData.publishingMix}
            </Badge>
            <Badge variant="outline" className="text-xs bg-surface text-secondary-foreground">
              Label: {summaryData.labelType}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Who controls this song and how easy it is to make a deal.
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="w-full px-4 py-2 border-b border-border/50 justify-start bg-transparent">
            <TabsTrigger value="summary" className="text-xs gap-1.5">
              <FileText className="w-3 h-3" /> Summary
            </TabsTrigger>
            <TabsTrigger value="credits" className="text-xs gap-1.5">
              <Users className="w-3 h-3" /> Full Credits
            </TabsTrigger>
            <TabsTrigger value="contacts" className="text-xs gap-1.5">
              <Mail className="w-3 h-3" /> Contacts
            </TabsTrigger>
            <TabsTrigger value="projects" className="text-xs gap-1.5">
              <FolderOpen className="w-3 h-3" /> Projects
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            {/* Summary Tab */}
            <TabsContent value="summary" className="p-5 space-y-6 m-0">
              {/* Who controls this? */}
              <section className="space-y-4">
                <h3 className="section-label text-secondary-foreground">Who controls this?</h3>
                
                {/* Writers */}
                {summaryData.keyWriters.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Top Songwriters</p>
                    <div className="space-y-1.5">
                      {summaryData.keyWriters.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border/50">
                          <span className="text-sm font-medium text-foreground">{w.name}</span>
                          {w.pro && <Badge variant="outline" className="text-[10px]">{w.pro}</Badge>}
                          {w.isMajor !== undefined && (
                            <Badge variant="outline" className={cn("text-[10px]", w.isMajor ? "bg-purple-500/10 text-purple-400" : "bg-emerald-500/10 text-emerald-400")}>
                              {w.isMajor ? "Major" : "Indie"}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Publishers */}
                {summaryData.keyPublishers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Publishers / Admins</p>
                    <div className="space-y-1.5">
                      {summaryData.keyPublishers.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border/50">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                          <span className="text-sm font-medium text-foreground">{p.name}</span>
                          <Badge variant="outline" className={cn("text-[10px]", p.isMajor ? "bg-purple-500/10 text-purple-400" : "bg-emerald-500/10 text-emerald-400")}>
                            {p.isMajor ? "Major" : "Indie"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Label */}
                {songData.recordLabel && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Master Owner (Label)</p>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border/50 w-fit">
                      <Building2 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-sm font-medium text-foreground">{songData.recordLabel}</span>
                      <Badge variant="outline" className={cn("text-[10px]", summaryData.labelType === "Major label" ? "bg-purple-500/10 text-purple-400" : "bg-emerald-500/10 text-emerald-400")}>
                        {summaryData.labelType === "Major label" ? "Major" : "Indie"}
                      </Badge>
                    </div>
                  </div>
                )}
              </section>

              {/* Song stats */}
              {summaryData.chartSummary && (
                <section className="space-y-3">
                  <h3 className="section-label text-secondary-foreground">Song Stats</h3>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    {summaryData.chartSummary}
                  </div>
                </section>
              )}

              {/* Next actions */}
              <section className="space-y-3 pt-2">
                <h3 className="section-label text-secondary-foreground">Next Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {songProjectData && <ProjectSelector song={songProjectData} />}
                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setActiveTab("credits")}>
                    <ChevronRight className="w-3.5 h-3.5" />
                    Open full credits
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setActiveTab("contacts")}>
                    <Mail className="w-3.5 h-3.5" />
                    View contacts & emails
                  </Button>
                </div>
              </section>
            </TabsContent>

            {/* Full Credits Tab */}
            <TabsContent value="credits" className="p-5 space-y-6 m-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="section-label text-secondary-foreground">Full Credits & Publishing Data</h3>
                  <p className="text-xs text-muted-foreground mt-1">Detailed ownership and registration info for power users.</p>
                </div>
                <MethodologyPopover />
              </div>
              
              <CreditsSection
                credits={credits}
                isLoadingPro={isLoadingPro}
                isLoadingShares={isLoadingShares}
                proError={proError}
                onRetryPro={onRetryPro}
                onViewCatalog={onViewCatalog}
                songTitle={songData.title}
                songArtist={songData.artist}
              />
              
              <PublishingSplitChart credits={credits} />
              
              <ChartDetailsSection placements={chartPlacements} />
              
              <RadioAirplayPanel songTitle={songData.title} artist={songData.artist} />
            </TabsContent>

            {/* Contacts Tab */}
            <TabsContent value="contacts" className="p-5 space-y-6 m-0">
              <div>
                <h3 className="section-label text-secondary-foreground">Who to Talk To</h3>
                <p className="text-xs text-muted-foreground mt-1">Find and reach key decision-makers for this song.</p>
              </div>
              
              <OutreachPanel
                artist={songData.artist}
                songTitle={songData.title}
                credits={credits}
                recordLabel={songData.recordLabel}
              />
            </TabsContent>

            {/* Projects Tab */}
            <TabsContent value="projects" className="p-5 space-y-6 m-0">
              <div>
                <h3 className="section-label text-secondary-foreground">Scouting Lists & Organization</h3>
                <p className="text-xs text-muted-foreground mt-1">Save this song to your scouting projects.</p>
              </div>
              
              <div className="rounded-xl border border-border/50 bg-surface p-4 space-y-4">
                {songProjectData && (
                  <div className="space-y-3">
                    <ProjectSelector song={songProjectData} />
                    <p className="text-xs text-muted-foreground">
                      Add this song to a scouting list to track it alongside other potential deals.
                    </p>
                  </div>
                )}
                
                <div className="pt-3 border-t border-border/50">
                  <h4 className="text-xs font-medium text-foreground mb-2">Quick Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setActiveTab("contacts")}>
                      <Mail className="w-3.5 h-3.5" />
                      View contacts
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setActiveTab("credits")}>
                      <Users className="w-3.5 h-3.5" />
                      View all credits
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
});

SongProfilePanel.displayName = "SongProfilePanel";
