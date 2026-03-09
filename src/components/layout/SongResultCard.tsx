import { memo } from "react";
import { Music, Users, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Credit } from "@/components/CreditsSection";

interface SongResultCardProps {
  title: string;
  artist: string;
  coverUrl?: string;
  dealability?: "high" | "medium" | "low";
  publishingMix?: "indie" | "mixed" | "major";
  labelType?: "indie" | "major";
  writersCount?: number;
  publishersCount?: number;
  hasProData?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

const DEALABILITY_CONFIG = {
  high: { label: "High", cls: "bg-[#052E16] text-[#16A34A] border-[#14532D]" },
  medium: { label: "Medium", cls: "bg-[#451A03] text-[#D97706] border-[#4A2F05]" },
  low: { label: "Low", cls: "bg-[#450A0A] text-[#DC2626] border-[#7F1D1D]" },
};

export const SongResultCard = memo(({
  title,
  artist,
  coverUrl,
  dealability,
  publishingMix,
  labelType,
  writersCount,
  publishersCount,
  hasProData = true,
  isSelected = false,
  onClick,
}: SongResultCardProps) => {
  const dealConfig = dealability ? DEALABILITY_CONFIG[dealability] : null;

  const pubLabel = publishingMix === "indie"
    ? "Mostly indie pubs"
    : publishingMix === "major"
    ? "Major pubs"
    : publishingMix === "mixed"
    ? "Mixed pubs"
    : null;

  const labelLabel = labelType === "indie" ? "Indie label" : labelType === "major" ? "Major label" : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 p-4 rounded-xl border transition-all text-left",
        isSelected
          ? "bg-surface-elevated border-primary/30 shadow-md"
          : "bg-surface border-border/50 hover:border-primary/20 hover:bg-surface-elevated"
      )}
    >
      {/* Cover */}
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className="w-12 h-12 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Music className="w-5 h-5 text-muted-foreground" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Title and artist */}
        <div>
          <h4 className="text-sm font-semibold text-foreground truncate">{title}</h4>
          <p className="text-xs text-muted-foreground truncate">{artist}</p>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          {dealConfig && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", dealConfig.cls)}>
              {dealConfig.label}
            </Badge>
          )}
          {pubLabel && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-surface text-secondary-foreground">
              {pubLabel}
            </Badge>
          )}
          {labelLabel && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-surface text-secondary-foreground">
              {labelLabel}
            </Badge>
          )}
        </div>

        {/* Info line */}
        <p className="text-[11px] text-muted-foreground">
          {writersCount !== undefined && `${writersCount} writer${writersCount !== 1 ? "s" : ""}`}
          {publishersCount !== undefined && ` · ${publishersCount} publisher${publishersCount !== 1 ? "s" : ""}`}
          {hasProData && " · PRO data OK"}
        </p>
      </div>
    </button>
  );
});

SongResultCard.displayName = "SongResultCard";
