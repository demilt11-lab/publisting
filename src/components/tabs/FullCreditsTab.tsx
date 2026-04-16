import { memo, forwardRef } from "react";
import { CreditsSection, Credit } from "@/components/CreditsSection";
import { StreamingStats } from "@/lib/api/streamingStats";
import { PublishingSplitChart } from "@/components/PublishingSplitChart";
import { MethodologyPopover } from "@/components/MethodologyPopover";
import { CreditFilters } from "@/hooks/useFilterPreferences";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import { MultiSourceCreditsPanel } from "@/components/MultiSourceCreditsPanel";
import { MultiSourceResult } from "@/lib/types/multiSource";
import { CollectingPublisher } from "@/lib/api/songLookup";
import { PublishingRegistryPanel } from "@/components/PublishingRegistryPanel";
import { Loader2, Building2, Globe, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FullCreditsTabProps {
  credits: Credit[];
  isLoadingPro: boolean;
  isLoadingShares: boolean;
  proError: string | null;
  onRetryPro: () => void;
  onViewCatalog: (name: string, role: string) => void;
  songTitle: string;
  songArtist: string;
  songAlbum?: string;
  isrc?: string;
  recordLabel?: string;
  streamingStats?: StreamingStats | null;
  creditFilters: CreditFilters;
  onCreditFiltersChange: (filters: CreditFilters) => void;
  onResetCreditFilters: () => void;
  multiSourceData?: MultiSourceResult | null;
  isLoadingMultiSource?: boolean;
  collectingPublishers?: CollectingPublisher[];
  detectedOrgs?: string[];
}

export const FullCreditsTab = memo(forwardRef<HTMLDivElement, FullCreditsTabProps>(({
  credits, isLoadingPro, isLoadingShares, proError, onRetryPro, onViewCatalog,
  songTitle, songArtist, songAlbum, isrc, recordLabel, streamingStats,
  creditFilters, onCreditFiltersChange, onResetCreditFilters,
  multiSourceData, isLoadingMultiSource,
  collectingPublishers, detectedOrgs,
}, _ref) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Full Credits & Publishing Data</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Detailed ownership and registration info.</p>
        </div>
        <div className="flex items-center gap-3">
          <ReportIssueModal songTitle={songTitle} songArtist={songArtist} module="credits" />
          <MethodologyPopover />
        </div>
      </div>

      {/* Publishing Registry Search Panel — top priority */}
      <PublishingRegistryPanel
        songTitle={songTitle}
        songArtist={songArtist}
        isrc={isrc}
      />

      <CreditsSection
        credits={credits}
        isLoadingPro={isLoadingPro}
        isLoadingShares={isLoadingShares}
        proError={proError}
        onRetryPro={onRetryPro}
        onViewCatalog={onViewCatalog}
        songTitle={songTitle}
        songArtist={songArtist}
        songAlbum={songAlbum}
        isrc={isrc}
        recordLabel={recordLabel}
        streamingStats={streamingStats}
        creditFilters={creditFilters}
        onCreditFiltersChange={onCreditFiltersChange}
        onResetCreditFilters={onResetCreditFilters}
      />

      <PublishingSplitChart credits={credits} />

      {/* Collecting Publishers & Rights Organizations */}
      {(collectingPublishers && collectingPublishers.length > 0) || (detectedOrgs && detectedOrgs.length > 0) ? (
        <div className="glass rounded-xl p-4 space-y-4 animate-fade-up">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Collecting Publishers & Rights Organizations</h3>
          </div>

          {collectingPublishers && collectingPublishers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Building2 className="w-3 h-3" />
                Publishers Collecting on This Work
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left p-2 text-xs text-muted-foreground font-medium">Publisher / Administrator</th>
                      <th className="text-left p-2 text-xs text-muted-foreground font-medium">Role</th>
                      <th className="text-right p-2 text-xs text-muted-foreground font-medium">Share %</th>
                      <th className="text-left p-2 text-xs text-muted-foreground font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectingPublishers.map((pub, i) => (
                      <tr key={`${pub.name}-${i}`} className="border-b border-border/50 hover:bg-accent/30">
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-primary flex-shrink-0" />
                            <span className="font-medium text-foreground">{pub.name}</span>
                          </div>
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">
                            {pub.role === 'administrator' ? 'Admin' : pub.role === 'sub-publisher' ? 'Sub-Pub' : 'Publisher'}
                          </Badge>
                        </td>
                        <td className="p-2 text-right">
                          {pub.share ? (
                            <Badge variant="outline" className="text-xs bg-violet-500/15 text-violet-400 border-violet-500/25">
                              {pub.share}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <span className="text-xs text-muted-foreground">{pub.source}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {detectedOrgs && detectedOrgs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Globe className="w-3 h-3" />
                Rights Organizations Referenced
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detectedOrgs.map((org) => (
                  <Badge key={org} variant="outline" className="text-[10px] bg-accent/50">
                    {org}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {isLoadingShares && !collectingPublishers?.length && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground rounded-lg border border-border/30 bg-muted/10">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Searching MLC, HFA, SoundExchange, PROs for collecting publishers...</span>
        </div>
      )}

      {/* Multi-Source Credits Intelligence */}
      {isLoadingMultiSource && !multiSourceData && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground rounded-lg border border-border/30 bg-muted/10">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Searching MusicBrainz, Discogs, iTunes, Deezer, ASCAP, BMI, MLC...</span>
        </div>
      )}

      {multiSourceData && (
        <div className="border-t border-border/50 pt-6">
          <MultiSourceCreditsPanel data={multiSourceData} isLoading={isLoadingMultiSource} />
        </div>
      )}
    </div>
  );
}));

FullCreditsTab.displayName = "FullCreditsTab";
