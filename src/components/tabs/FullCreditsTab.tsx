import { memo, forwardRef } from "react";
import { CreditsSection, Credit } from "@/components/CreditsSection";
import { PublishingSplitChart } from "@/components/PublishingSplitChart";
import { MethodologyPopover } from "@/components/MethodologyPopover";
import { CreditFilters } from "@/hooks/useFilterPreferences";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import { MultiSourceCreditsPanel } from "@/components/MultiSourceCreditsPanel";
import { MultiSourceResult } from "@/lib/types/multiSource";
import { Loader2 } from "lucide-react";

interface FullCreditsTabProps {
  credits: Credit[];
  isLoadingPro: boolean;
  isLoadingShares: boolean;
  proError: string | null;
  onRetryPro: () => void;
  onViewCatalog: (name: string, role: string) => void;
  songTitle: string;
  songArtist: string;
  creditFilters: CreditFilters;
  onCreditFiltersChange: (filters: CreditFilters) => void;
  onResetCreditFilters: () => void;
  multiSourceData?: MultiSourceResult | null;
  isLoadingMultiSource?: boolean;
}

export const FullCreditsTab = memo(({
  credits, isLoadingPro, isLoadingShares, proError, onRetryPro, onViewCatalog,
  songTitle, songArtist, creditFilters, onCreditFiltersChange, onResetCreditFilters,
  multiSourceData, isLoadingMultiSource,
}: FullCreditsTabProps) => {
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

      <CreditsSection
        credits={credits}
        isLoadingPro={isLoadingPro}
        isLoadingShares={isLoadingShares}
        proError={proError}
        onRetryPro={onRetryPro}
        onViewCatalog={onViewCatalog}
        songTitle={songTitle}
        songArtist={songArtist}
        creditFilters={creditFilters}
        onCreditFiltersChange={onCreditFiltersChange}
        onResetCreditFilters={onResetCreditFilters}
      />

      <PublishingSplitChart credits={credits} />

      {/* Multi-Source Credits Intelligence */}
      {isLoadingMultiSource && !multiSourceData && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
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
});

FullCreditsTab.displayName = "FullCreditsTab";
