import { AlertCircle, RefreshCw } from "lucide-react";
import { CreditCard, CreditRole, PublishingStatus } from "./CreditCard";
import { CreditCardSkeleton } from "./CreditCardSkeleton";
import { Button } from "@/components/ui/button";

export interface Credit {
  name: string;
  role: CreditRole;
  publishingStatus: PublishingStatus;
  publisher?: string;
  ipi?: string;
  pro?: string;
  region?: string;
  regionFlag?: string;
  regionLabel?: string;
  isLoading?: boolean;
  error?: string;
}

interface CreditsSectionProps {
  credits: Credit[];
  isLoadingPro?: boolean;
  proError?: string;
  onRetryPro?: () => void;
}

export const CreditsSection = ({ credits, isLoadingPro, proError, onRetryPro }: CreditsSectionProps) => {
  const artists = credits.filter(c => c.role === "artist");
  const writers = credits.filter(c => c.role === "writer");
  const producers = credits.filter(c => c.role === "producer");

  const renderSection = (title: string, items: Credit[]) => {
    if (items.length === 0) return null;
    
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
        <div className="space-y-2">
          {items.map((credit, index) => (
            credit.isLoading ? (
              <CreditCardSkeleton key={`skeleton-${index}`} />
            ) : (
              <CreditCard key={`${credit.name}-${index}`} {...credit} />
            )
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
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

      {renderSection("Artists", artists)}
      {renderSection("Songwriters", writers)}
      {renderSection("Producers", producers)}
    </div>
  );
};
