import { memo, useState, useMemo } from "react";
import { classifyLabel, classifyPublisher } from "@/lib/labelClassifier";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  FileText, Users, Mail, FolderOpen, HelpCircle, Building2, 
  Shield, ChevronRight, Eye, Plus, ExternalLink
} from "lucide-react";
import { Credit } from "./CreditsSection";
import { CreditsSection } from "./CreditsSection";
import { PublishingSplitChart } from "./PublishingSplitChart";
import { ChartDetailsSection } from "./ChartPlacements";
import { RadioAirplayPanel } from "./RadioAirplayPanel";
import { OutreachPanel } from "./OutreachPanel";
import { ProjectSelector } from "./ProjectSelector";
import { MethodologyPopover } from "./MethodologyPopover";
import { ChartPlacement } from "@/lib/api/chartLookup";

interface SongDetailTabsProps {
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
  onAddToProject?: () => void;
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

export const SongDetailTabs = memo(({
  songData,
  credits,
  chartPlacements,
  isLoadingPro,
  isLoadingShares,
  proError,
  onRetryPro,
  onViewCatalog,
  songProjectData,
}: SongDetailTabsProps) => {
  const [activeTab, setActiveTab] = useState("summary");

  // Compute summary data
  const summaryData = useMemo(() => {
    const writers = credits.filter(c => c.role === "writer");
    const producers = credits.filter(c => c.role === "producer");
    const publishers = new Set(credits.filter(c => c.publisher).map(c => c.publisher));
    const pubList = Array.from(publishers);
    
    // Publishing mix
    const majorCount = pubList.filter(p => 
      MAJOR_PUBLISHERS.some(m => p!.toLowerCase().includes(m))
    ).length;
    const publishingMix = majorCount === 0 ? "Mostly indie" : 
      majorCount === pubList.length ? "Major publishers" : "Mixed (indie + major)";
    
    // Label type
    const isMajorLabel = songData.recordLabel && 
      MAJOR_LABELS.some(m => songData.recordLabel!.toLowerCase().includes(m));
    const labelType = isMajorLabel ? "Major label" : "Indie label";
    
    // Signing status calculation
    const signedRatio = credits.length > 0 
      ? credits.filter(c => c.publisher).length / credits.length 
      : 0;
    const signingStatus = signedRatio >= 0.8 && publishers.size <= 2 
      ? "high" : signedRatio >= 0.5 ? "medium" : "low";
    
    // Key people
    const keyWriters = writers.slice(0, 5).map(w => ({
      name: w.name,
      pro: w.pro,
      publisher: w.publisher,
    }));
    
    const keyPublishers = pubList.slice(0, 2).map(pub => ({
      name: pub!,
      isMajor: MAJOR_PUBLISHERS.some(m => pub!.toLowerCase().includes(m)),
    }));

    return {
      writersCount: writers.length,
      producersCount: producers.length,
      publishersCount: publishers.size,
      publishingMix,
      labelType,
      signingStatus,
      keyWriters,
      keyPublishers,
    };
  }, [credits, songData.recordLabel]);

  const signingStatusConfig = {
    high: { 
      label: "Mostly Signed", 
      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      desc: "Most writers are signed to publishers"
    },
    medium: { 
      label: "Partially Signed", 
      cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
      desc: "Some writers are unsigned or unregistered"
    },
    low: { 
      label: "Mostly Unsigned", 
      cls: "bg-red-500/15 text-red-400 border-red-500/25",
      desc: "Many writers appear unsigned"
    },
  };

  const statusConfig = signingStatusConfig[summaryData.signingStatus];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="w-full mb-8">
        <TabsTrigger value="summary" className="gap-1.5 text-xs sm:text-sm">
          <FileText className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Summary</span>
        </TabsTrigger>
        <TabsTrigger value="credits" className="gap-1.5 text-xs sm:text-sm">
          <Users className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Full Credits</span>
        </TabsTrigger>
        <TabsTrigger value="outreach" className="gap-1.5 text-xs sm:text-sm">
          <Mail className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Contacts</span>
        </TabsTrigger>
        <TabsTrigger value="projects" className="gap-1.5 text-xs sm:text-sm">
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Projects</span>
        </TabsTrigger>
      </TabsList>

      {/* SUMMARY TAB — elevated surface with more spacing */}
      <TabsContent value="summary" className="space-y-6 animate-fade-up">
        <div className="surface-elevated rounded-lg p-6 space-y-6">
          {/* Header with signing status */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="section-label mb-1">Quick Overview</h3>
              <p className="text-sm text-muted-foreground">
                This song's writers and producers, their signing status, and exposure.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={`text-sm px-3 py-1 cursor-help ${statusConfig.cls}`}>
                    <Shield className="w-3.5 h-3.5 mr-1.5" />
                    {statusConfig.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px]">
                  <p className="font-medium">{statusConfig.label}</p>
                  <p className="text-xs text-muted-foreground">{statusConfig.desc}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="w-4 h-4 text-muted-foreground/50" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  Signing status indicates how many writers and producers are signed to publishers. This is based on available data and may not be complete.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs bg-primary/5">
              Publishing: {summaryData.publishingMix}
            </Badge>
            <Badge variant="outline" className="text-xs bg-primary/5">
              Label: {summaryData.labelType}
            </Badge>
            <Badge variant="outline" className="text-xs bg-muted">
              {summaryData.writersCount} writers · {summaryData.publishersCount} publishers
            </Badge>
          </div>

          {/* Explanation */}
          <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
            💡 Fewer writers and more indie control usually means simpler deals. Major publishers often have longer approval processes.
          </p>

          {/* Key People — more spacing */}
          <div className="space-y-4 pt-2">
            <h4 className="section-label">Key People (who controls this song)</h4>
            
            {summaryData.keyWriters.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Top Songwriters</p>
                <div className="flex flex-wrap gap-2">
                  {summaryData.keyWriters.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                      <span className="text-sm font-medium text-foreground">{w.name}</span>
                      {w.pro && <span className="text-xs text-muted-foreground">({w.pro})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Publishers */}
            {summaryData.keyPublishers.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Publishers / Admins</p>
                <div className="flex flex-wrap gap-2">
                  {summaryData.keyPublishers.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                      <Building2 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                      <Badge variant="outline" className={`text-[10px] ${p.isMajor ? 'bg-purple-500/10 text-purple-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                        {p.isMajor ? "Major" : "Indie"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Record Label */}
            {songData.recordLabel && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Master Owner (Label)</p>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50 w-fit">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-medium text-foreground">{songData.recordLabel}</span>
                  <Badge variant="outline" className={`text-[10px] ${summaryData.labelType === "Major label" ? 'bg-purple-500/10 text-purple-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {summaryData.labelType === "Major label" ? "Major" : "Indie"}
                  </Badge>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-border/50">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={() => setActiveTab("credits")}
            >
              <ChevronRight className="w-4 h-4" />
              View full credits
            </Button>
            {songProjectData && <ProjectSelector song={songProjectData} />}
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={() => setActiveTab("outreach")}
            >
              <Mail className="w-4 h-4" />
              Find contacts
            </Button>
          </div>
        </div>
      </TabsContent>

      {/* FULL CREDITS TAB */}
      <TabsContent value="credits" className="space-y-6 animate-fade-up">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-foreground">Full Credits & Publishing Data</h3>
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

      {/* OUTREACH TAB */}
      <TabsContent value="outreach" className="space-y-6 animate-fade-up">
        <div className="mb-2">
          <h3 className="text-lg font-semibold text-foreground">Contacts & Outreach</h3>
          <p className="text-sm text-muted-foreground">Find and reach key decision-makers</p>
        </div>
        
        <OutreachPanel
          artist={songData.artist}
          songTitle={songData.title}
          credits={credits}
          recordLabel={songData.recordLabel}
        />
      </TabsContent>

      {/* PROJECTS TAB */}
      <TabsContent value="projects" className="space-y-6 animate-fade-up">
        <div className="mb-2">
          <h3 className="text-lg font-semibold text-foreground">Projects & Organization</h3>
          <p className="text-sm text-muted-foreground">Save this song to your scouting projects</p>
        </div>
        
        <div className="glass rounded-xl p-5 space-y-4">
          {songProjectData && (
            <div className="space-y-4">
              <ProjectSelector song={songProjectData} />
              <p className="text-xs text-muted-foreground">
                Add this song to a project to track it alongside other potential deals. 
                Use the Watchlist to follow specific writers or publishers across multiple songs.
              </p>
            </div>
          )}
          
          <div className="pt-4 border-t border-border/50">
            <h4 className="text-sm font-semibold text-foreground mb-2">Quick Actions</h4>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setActiveTab("outreach")}>
                <Mail className="w-4 h-4" />
                View contacts
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setActiveTab("credits")}>
                <Users className="w-4 h-4" />
                View all credits
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
});

SongDetailTabs.displayName = "SongDetailTabs";
