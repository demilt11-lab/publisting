import { memo, useState, useMemo } from "react";
import { X, Shield, Building2, ChevronRight, Mail, Users, FolderOpen, FileText, BarChart3, Music, ChevronDown, Download, User } from "lucide-react";
import { useFilterPreferences } from "@/hooks/useFilterPreferences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Credit, CreditsSection } from "@/components/CreditsSection";
import { PublishingSplitChart } from "@/components/PublishingSplitChart";
import { ChartDetailsSection } from "@/components/ChartPlacements";
import { RadioAirplayPanel } from "@/components/RadioAirplayPanel";
import { PlaylistAppearancesPanel } from "@/components/PlaylistAppearancesPanel";
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
  signingStatus: "high" | "medium" | "low";
    recordLabel?: string;
  } | null;
}

const MAJOR_PUBLISHERS = ["sony", "universal", "warner", "bmg", "kobalt", "concord"];
const MAJOR_LABELS = ["universal", "sony", "warner", "emi", "atlantic", "capitol", "interscope"];

const SIGNING_STATUS_CONFIG = {
  high: { 
    label: "Mostly Signed", 
    cls: "bg-[#052E16] text-[#16A34A] border-[#14532D]",
    desc: "Most writers are signed to publishers"
  },
  medium: { 
    label: "Partially Signed", 
    cls: "bg-[#451A03] text-[#D97706] border-[#4A2F05]",
    desc: "Some writers are unsigned or unregistered"
  },
  low: { 
    label: "Mostly Unsigned", 
    cls: "bg-[#450A0A] text-[#DC2626] border-[#7F1D1D]",
    desc: "Many writers appear unsigned — potential signing opportunities"
  },
};

/** Generate a plain-language intro sentence about signing status */
function generateIntroSentence(
  signingStatus: "high" | "medium" | "low",
  writersCount: number,
  publishersCount: number,
  publishingMix: string,
  labelType: string,
): string {
  const writerDesc = writersCount <= 2 ? "just a couple of writers" : writersCount <= 4 ? "a few writers" : "many collaborators";
  const pubDesc = publishingMix.toLowerCase().includes("indie")
    ? "mostly indie publishing"
    : publishingMix.toLowerCase().includes("major")
    ? "major publisher involvement"
    : "a mix of indie and major publishing";
  
  if (signingStatus === "high") {
    return `This song has ${writerDesc} and ${pubDesc} — most credits are accounted for.`;
  } else if (signingStatus === "medium") {
    return `This song has ${writerDesc} and ${pubDesc} — some writers may be available for signing.`;
  } else {
    return `This song has ${writerDesc} — several writers appear unsigned, which could represent signing opportunities.`;
  }
}

/** Generate initials from a name */
function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

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
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { filters: creditFilters, setFilters: setCreditFilters, resetFilters: resetCreditFilters } = useFilterPreferences();

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
    const signingStatus: "high" | "medium" | "low" = signedRatio >= 0.8 
      ? "high" : signedRatio >= 0.5 ? "medium" : "low";
    
    const keyWriters = writers.slice(0, 5).map(w => ({
      name: w.name,
      role: "Writer" as const,
      pro: w.pro,
      publisher: w.publisher,
      isMajor: w.publisher ? MAJOR_PUBLISHERS.some(m => w.publisher!.toLowerCase().includes(m)) : false,
    }));
    
    const keyPublishers = pubList.slice(0, 3).map(pub => ({
      name: pub!,
      role: "Publisher" as const,
      isMajor: MAJOR_PUBLISHERS.some(m => pub!.toLowerCase().includes(m)),
    }));

    const chartSummary = chartPlacements.length > 0
      ? `Peaked #${Math.min(...chartPlacements.map(c => c.peakPosition || 100))} on ${chartPlacements[0]?.chart || "charts"}`
      : null;

    // Friendly collaborator summary
    const collabSummary = writersCount(writers.length, publishers.size);

    return {
      writersCount: writers.length,
      producersCount: producers.length,
      publishersCount: publishers.size,
      publishingMix,
      labelType,
      signingStatus,
      keyWriters,
      keyPublishers,
      chartSummary,
      collabSummary,
      introSentence: generateIntroSentence(signingStatus, writers.length, publishers.size, publishingMix, labelType),
    };
  }, [credits, songData.recordLabel, chartPlacements]);

  const statusConfig = SIGNING_STATUS_CONFIG[summaryData.signingStatus];

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Header with cover art */}
        <div className="p-5 border-b border-border/50">
          <div className="flex items-start gap-4">
            {/* Cover art */}
            {songData.coverUrl ? (
              <img
                src={songData.coverUrl}
                alt={`${songData.title} cover`}
                className="w-16 h-16 rounded-xl object-cover shrink-0 border border-border/50"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-secondary border border-border/50 flex items-center justify-center shrink-0">
                <Music className="w-7 h-7 text-muted-foreground" />
              </div>
            )}

            {/* Title & artist */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-foreground truncate">{songData.title}</h2>
                  <p className="text-sm text-primary truncate">{songData.artist}</p>
                </div>
                {onClose && (
                  <Button variant="ghost" size="icon" className="shrink-0 -mt-1 -mr-2" onClick={onClose}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 cursor-help", statusConfig.cls)}>
                      <Shield className="w-3 h-3 mr-1" />
                      {statusConfig.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[220px]">
                    <p className="font-medium">{statusConfig.label}</p>
                    <p className="text-xs text-muted-foreground">{statusConfig.desc}</p>
                  </TooltipContent>
                </Tooltip>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-surface text-secondary-foreground">
                  {summaryData.publishingMix}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-surface text-secondary-foreground">
                  {summaryData.labelType}
                </Badge>
              </div>
            </div>
          </div>
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
            {/* ─── SUMMARY TAB ─── */}
            <TabsContent value="summary" className="p-5 space-y-5 m-0">
              
              {/* a) Intro sentence */}
               <p className="text-sm text-foreground/80 leading-relaxed">
                 This song's writers and producers, their signing status, and exposure.
              </p>

              {/* b) Key People — people first, avatars, details link */}
              <section className="space-y-3">
                <h3 className="section-label text-secondary-foreground">Key People</h3>
                
                <div className="space-y-1">
                  {/* Writers */}
                  {summaryData.keyWriters.map((person, i) => (
                    <PersonRow
                      key={`w-${i}`}
                      name={person.name}
                      role="Writer"
                      pro={person.pro}
                      isMajor={person.isMajor}
                      onDetailsClick={() => setActiveTab("credits")}
                    />
                  ))}
                  
                  {/* Publishers */}
                  {summaryData.keyPublishers.map((pub, i) => (
                    <PersonRow
                      key={`p-${i}`}
                      name={pub.name}
                      role="Publisher"
                      isMajor={pub.isMajor}
                      onDetailsClick={() => setActiveTab("credits")}
                    />
                  ))}
                  
                  {/* Label */}
                  {songData.recordLabel && (
                    <PersonRow
                      name={songData.recordLabel}
                      role="Label"
                      isMajor={summaryData.labelType === "Major label"}
                      onDetailsClick={() => setActiveTab("credits")}
                    />
                  )}
                </div>
              </section>

              {/* c) Collabs summary — expandable */}
              <section className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {summaryData.collabSummary}
                  <button
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    className="ml-1.5 text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    {showBreakdown ? "Hide breakdown" : "Show full breakdown"}
                    <ChevronDown className={cn("w-3 h-3 transition-transform", showBreakdown && "rotate-180")} />
                  </button>
                </p>

                {showBreakdown && (
                  <div className="rounded-lg border border-border/50 bg-surface p-3 space-y-1.5 animate-fade-up">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Writers</span>
                      <span className="text-foreground font-medium">{summaryData.writersCount}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Producers</span>
                      <span className="text-foreground font-medium">{summaryData.producersCount}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Publishers</span>
                      <span className="text-foreground font-medium">{summaryData.publishersCount}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Publishing mix</span>
                      <span className="text-foreground font-medium">{summaryData.publishingMix}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Label</span>
                      <span className="text-foreground font-medium">{summaryData.labelType}</span>
                    </div>
                    <div className="pt-1.5 border-t border-border/50">
                      <button
                        onClick={() => setActiveTab("credits")}
                        className="text-xs text-primary hover:underline"
                      >
                        View full credits →
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Song stats (if charts available) */}
              {summaryData.chartSummary && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border/50">
                  <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground">{summaryData.chartSummary}</span>
                </div>
              )}

              {/* d) Actions area — visually separated CTA box */}
              <section className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4 space-y-3">
                <h3 className="text-xs font-semibold text-foreground">What do you want to do?</h3>
                <div className="flex flex-wrap gap-2">
                  {songProjectData && <ProjectSelector song={songProjectData} />}
                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setActiveTab("contacts")}>
                    <Mail className="w-3.5 h-3.5" />
                    View contacts & emails
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setActiveTab("credits")}>
                    <ChevronRight className="w-3.5 h-3.5" />
                    Open full credits
                  </Button>
                </div>
              </section>
            </TabsContent>

            {/* ─── FULL CREDITS TAB ─── */}
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
                creditFilters={creditFilters}
                onCreditFiltersChange={setCreditFilters}
                onResetCreditFilters={resetCreditFilters}
              />
              
              <PublishingSplitChart credits={credits} />
              <ChartDetailsSection placements={chartPlacements} />
              <RadioAirplayPanel songTitle={songData.title} artist={songData.artist} />
              <PlaylistAppearancesPanel songTitle={songData.title} artist={songData.artist} />
            </TabsContent>

            {/* ─── CONTACTS TAB ─── */}
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

            {/* ─── PROJECTS TAB ─── */}
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

// ─── Helper: friendly collaborator count sentence ───
function writersCount(w: number, p: number): string {
  const wDesc = w === 1 ? "One writer" : w <= 3 ? "A few collaborators" : "Many collaborators";
  const pDesc = p === 0 ? "no publishers listed" : p === 1 ? "one publisher" : `${p} publishers`;
  return `${wDesc} and ${pDesc}.`;
}

// ─── PersonRow component ───
interface PersonRowProps {
  name: string;
  role: "Writer" | "Publisher" | "Label";
  pro?: string;
  isMajor?: boolean;
  onDetailsClick?: () => void;
}

const PersonRow = memo(({ name, role, pro, isMajor, onDetailsClick }: PersonRowProps) => {
  const roleIcon = role === "Writer" ? User : Building2;
  const Icon = roleIcon;
  const roleColor = role === "Writer" ? "text-blue-400" : role === "Publisher" ? "text-primary" : "text-amber-400";

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border/50 hover:bg-surface-elevated transition-colors">
      {/* Avatar */}
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold", 
        role === "Writer" ? "bg-blue-500/10 text-blue-400" : 
        role === "Publisher" ? "bg-primary/10 text-primary" : 
        "bg-amber-500/10 text-amber-400"
      )}>
        {getInitials(name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">{name}</span>
          <span className={cn("text-[10px]", roleColor)}>{role}</span>
        </div>
        {pro && <span className="text-[10px] text-muted-foreground">{pro}</span>}
      </div>

      {/* Affiliation badge */}
      {isMajor !== undefined && (
        <Badge variant="outline" className={cn("text-[10px] shrink-0", isMajor ? "bg-purple-500/10 text-purple-400" : "bg-emerald-500/10 text-emerald-400")}>
          {isMajor ? "Major" : "Indie"}
        </Badge>
      )}

      {/* Details link */}
      {onDetailsClick && (
        <button onClick={onDetailsClick} className="text-[10px] text-primary hover:underline shrink-0">
          Details
        </button>
      )}
    </div>
  );
});

PersonRow.displayName = "PersonRow";
