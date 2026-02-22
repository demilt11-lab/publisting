import { useState } from "react";
import { AlertCircle, RefreshCw, Eye, EyeOff } from "lucide-react";
import { CreditCard, CreditRole, PublishingStatus } from "./CreditCard";
import { CreditCardSkeleton } from "./CreditCardSkeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export interface Credit {
  name: string;
  role: CreditRole;
  publishingStatus: PublishingStatus;
  publisher?: string;
  recordLabel?: string;
  management?: string;
  ipi?: string;
  pro?: string;
  region?: string;
  regionFlag?: string;
  regionLabel?: string;
  /** Other roles this person has on the same song */
  alsoRoles?: CreditRole[];
  isLoading?: boolean;
  error?: string;
  /** Publishing share percentage (0-100) */
  publishingShare?: number;
  /** Source of share data (e.g. "MLC", "ASCAP") */
  shareSource?: string;
}

interface CreditsSectionProps {
  credits: Credit[];
  isLoadingPro?: boolean;
  isLoadingShares?: boolean;
  proError?: string;
  onRetryPro?: () => void;
  onViewCatalog?: (name: string, role: CreditRole) => void;
}

export const CreditsSection = ({ credits, isLoadingPro, isLoadingShares, proError, onRetryPro, onViewCatalog }: CreditsSectionProps) => {
  const [hideDuplicates, setHideDuplicates] = useState(false);

  const rolesByName = credits.reduce<Record<string, CreditRole[]>>((acc, c) => {
    const key = c.name.toLowerCase();
    if (!acc[key]) acc[key] = [];
    if (!acc[key].includes(c.role)) acc[key].push(c.role);
    return acc;
  }, {});

  const withAlsoRoles = (c: Credit): Credit => {
    const key = c.name.toLowerCase();
    return { ...c, alsoRoles: rolesByName[key] || [c.role] };
  };

  // When hiding duplicates, only show a person once (in their "primary" role)
  // Priority: artist > writer > producer
  const getFilteredCredits = () => {
    if (!hideDuplicates) {
      return {
        artists: credits.filter(c => c.role === "artist").map(withAlsoRoles),
        writers: credits.filter(c => c.role === "writer").map(withAlsoRoles),
        producers: credits.filter(c => c.role === "producer").map(withAlsoRoles),
      };
    }

    const seenNames = new Set<string>();
    const artists: Credit[] = [];
    const writers: Credit[] = [];
    const producers: Credit[] = [];

    // First pass: add all artists
    for (const c of credits.filter(c => c.role === "artist")) {
      const key = c.name.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        artists.push(withAlsoRoles(c));
      }
    }

    // Second pass: add writers not already shown as artists
    for (const c of credits.filter(c => c.role === "writer")) {
      const key = c.name.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        writers.push(withAlsoRoles(c));
      }
    }

    // Third pass: add producers not already shown
    for (const c of credits.filter(c => c.role === "producer")) {
      const key = c.name.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        producers.push(withAlsoRoles(c));
      }
    }

    return { artists, writers, producers };
  };

  const { artists, writers, producers } = getFilteredCredits();

  // Count duplicates for the toggle label
  const totalCredits = credits.length;
  const uniqueNames = new Set(credits.map(c => c.name.toLowerCase())).size;
  const duplicateCount = totalCredits - uniqueNames;

  const renderSection = (title: string, items: Credit[], emptyHint: string) => {
    return (
      <div className="space-y-3">
        <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
          {title}
          <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
          {isLoadingPro && (
            <span className="flex items-center gap-1.5 text-xs font-normal text-primary">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Looking up PRO info...
            </span>
          )}
        </h3>

        {items.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-secondary/30 p-4 text-sm text-muted-foreground">
            {emptyHint}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((credit, index) =>
              credit.isLoading ? (
                <CreditCardSkeleton key={`skeleton-${index}`} />
              ) : (
                <CreditCard key={`${credit.name}-${index}`} {...credit} onViewCatalog={onViewCatalog} />
              )
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
      {/* Duplicate toggle - only show if there are duplicates */}
      {duplicateCount > 0 && (
        <div className="flex items-center justify-end gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
          <div className="flex items-center gap-2">
            {hideDuplicates ? (
              <EyeOff className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Eye className="w-4 h-4 text-muted-foreground" />
            )}
            <Label htmlFor="hide-duplicates" className="text-sm text-muted-foreground cursor-pointer">
              Hide duplicates ({duplicateCount} people appear in multiple roles)
            </Label>
          </div>
          <Switch
            id="hide-duplicates"
            checked={hideDuplicates}
            onCheckedChange={setHideDuplicates}
          />
        </div>
      )}

      {/* PRO Lookup Error Banner */}
      {proError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">PRO lookup failed</p>
            <p className="text-xs opacity-80">{proError}</p>
          </div>
          {onRetryPro && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={onRetryPro}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <RefreshCw className="w-3 h-3 mr-1.5" />
              Retry
            </Button>
          )}
        </div>
      )}

      {/* PRO Loading Indicator */}
      {isLoadingPro && !proError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20 text-primary">
          <RefreshCw className="w-5 h-5 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Looking up PRO affiliations...</p>
            <p className="text-xs opacity-80">Checking ASCAP, BMI, and other registries</p>
          </div>
        </div>
      )}

      {/* Shares Loading Indicator */}
      {isLoadingShares && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
          <RefreshCw className="w-5 h-5 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Looking up publishing shares...</p>
            <p className="text-xs opacity-80">Searching MLC, ASCAP, and other sources</p>
          </div>
        </div>
      )}

      {renderSection("Artists", artists, "No artist credits found (unexpected).")}
      {renderSection(
        "Songwriters",
        writers,
        "No songwriter credits found yet for this track from our sources. Check the Debug: Credit Sources panel to see which sites returned data."
      )}
      {renderSection(
        "Producers",
        producers,
        "No producer credits found yet for this track from our sources. Check the Debug: Credit Sources panel to see which sites returned data."
      )}
    </div>
  );
};
