import { useState, useCallback, useMemo } from "react";
import { AlertCircle, RefreshCw, Eye, EyeOff, Copy, Check, Users } from "lucide-react";
import { CreditCard, CreditRole, PublishingStatus } from "./CreditCard";
import { CreditCardSkeleton } from "./CreditCardSkeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export interface Credit {
  name: string;
  role: CreditRole;
  publishingStatus: PublishingStatus;
  publisher?: string;
  recordLabel?: string;
  management?: string;
  ipi?: string;
  pro?: string;
  source?: string;
  region?: string;
  regionFlag?: string;
  regionLabel?: string;
  alsoRoles?: CreditRole[];
  isLoading?: boolean;
  error?: string;
  publishingShare?: number;
  shareSource?: string;
}

interface CreditsSectionProps {
  credits: Credit[];
  isLoadingPro?: boolean;
  isLoadingShares?: boolean;
  proError?: string;
  onRetryPro?: () => void;
  onViewCatalog?: (name: string, role: CreditRole) => void;
  songTitle?: string;
  songArtist?: string;
}

export const CreditsSection = ({ credits, isLoadingPro, isLoadingShares, proError, onRetryPro, onViewCatalog, songTitle, songArtist }: CreditsSectionProps) => {
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [copied, setCopied] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "artist" | "writer" | "producer">("all");
  const { toast } = useToast();

  const rolesByName = useMemo(() => {
    return credits.reduce<Record<string, CreditRole[]>>((acc, c) => {
      const key = c.name.toLowerCase();
      if (!acc[key]) acc[key] = [];
      if (!acc[key].includes(c.role)) acc[key].push(c.role);
      return acc;
    }, {});
  }, [credits]);

  const withAlsoRoles = useCallback((c: Credit): Credit => {
    const key = c.name.toLowerCase();
    return { ...c, alsoRoles: rolesByName[key] || [c.role] };
  }, [rolesByName]);

  const { artists, writers, producers, totalCredits, uniqueNames, duplicateCount, roleCounts } = useMemo(() => {
    const allArtists = credits.filter(c => c.role === "artist").map(withAlsoRoles);
    const allWriters = credits.filter(c => c.role === "writer").map(withAlsoRoles);
    const allProducers = credits.filter(c => c.role === "producer").map(withAlsoRoles);

    if (!hideDuplicates) {
      return {
        artists: allArtists, writers: allWriters, producers: allProducers,
        totalCredits: credits.length,
        uniqueNames: new Set(credits.map(c => c.name.toLowerCase())).size,
        duplicateCount: credits.length - new Set(credits.map(c => c.name.toLowerCase())).size,
        roleCounts: { artist: allArtists.length, writer: allWriters.length, producer: allProducers.length },
      };
    }

    const seenNames = new Set<string>();
    const dedupedArtists: Credit[] = [];
    const dedupedWriters: Credit[] = [];
    const dedupedProducers: Credit[] = [];

    for (const c of allArtists) { const key = c.name.toLowerCase(); if (!seenNames.has(key)) { seenNames.add(key); dedupedArtists.push(c); } }
    for (const c of allWriters) { const key = c.name.toLowerCase(); if (!seenNames.has(key)) { seenNames.add(key); dedupedWriters.push(c); } }
    for (const c of allProducers) { const key = c.name.toLowerCase(); if (!seenNames.has(key)) { seenNames.add(key); dedupedProducers.push(c); } }

    return {
      artists: dedupedArtists, writers: dedupedWriters, producers: dedupedProducers,
      totalCredits: credits.length,
      uniqueNames: new Set(credits.map(c => c.name.toLowerCase())).size,
      duplicateCount: credits.length - new Set(credits.map(c => c.name.toLowerCase())).size,
      roleCounts: { artist: allArtists.length, writer: allWriters.length, producer: allProducers.length },
    };
  }, [credits, hideDuplicates, withAlsoRoles]);

  const handleCopyAll = useCallback(() => {
    const lines: string[] = [];
    const addSection = (title: string, items: Credit[]) => {
      if (items.length === 0) return;
      lines.push(`${title}:`);
      items.forEach((c) => {
        let line = `  ${c.name} (${c.role})`;
        if (c.publisher) line += ` | Publisher: ${c.publisher}`;
        if (c.pro) line += ` | PRO: ${c.pro}`;
        if (c.ipi) line += ` | IPI: ${c.ipi}`;
        if (c.publishingShare != null) line += ` | Share: ${c.publishingShare}%`;
        lines.push(line);
      });
      lines.push("");
    };
    addSection("Artists", artists);
    addSection("Songwriters", writers);
    addSection("Producers", producers);

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      toast({ title: "Credits copied!", description: "All credits copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" });
    });
  }, [artists, writers, producers, toast]);

  const filteredArtists = roleFilter === "all" || roleFilter === "artist" ? artists : [];
  const filteredWriters = roleFilter === "all" || roleFilter === "writer" ? writers : [];
  const filteredProducers = roleFilter === "all" || roleFilter === "producer" ? producers : [];

  const renderSection = (title: string, items: Credit[], emptyHint: string) => {
    if (items.length === 0 && roleFilter !== "all") return null;
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
          <div className="rounded-xl border border-border/50 bg-secondary/30 p-4 text-sm text-muted-foreground">{emptyHint}</div>
        ) : (
          <div className="space-y-2">
            {items.map((credit, index) =>
              credit.isLoading ? (
                <CreditCardSkeleton key={`skeleton-${index}`} />
              ) : (
                <CreditCard key={`${credit.name}-${index}`} {...credit} onViewCatalog={onViewCatalog} songTitle={songTitle} songArtist={songArtist} />
              )
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
      {/* Section header */}
      <div className="border-l-4 border-primary pl-4">
        <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Credits & Publishing Rights
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Everyone who wrote, produced, or performed this song — and who owns the rights
        </p>
      </div>

      {/* Role filter tabs */}
      <Tabs value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All ({credits.length})</TabsTrigger>
          <TabsTrigger value="artist">Artists ({roleCounts.artist})</TabsTrigger>
          <TabsTrigger value="writer">Writers ({roleCounts.writer})</TabsTrigger>
          <TabsTrigger value="producer">Producers ({roleCounts.producer})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleCopyAll} disabled={credits.length === 0}>
          {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
          {copied ? "Copied!" : "Copy All Credits"}
        </Button>

        {duplicateCount > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
            <div className="flex items-center gap-2">
              {hideDuplicates ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
              <Label htmlFor="hide-duplicates" className="text-sm text-muted-foreground cursor-pointer">
                Hide duplicates ({duplicateCount} appear in multiple roles)
              </Label>
            </div>
            <Switch id="hide-duplicates" checked={hideDuplicates} onCheckedChange={setHideDuplicates} />
          </div>
        )}
      </div>

      {/* PRO Lookup Error Banner */}
      {proError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">PRO lookup failed</p>
            <p className="text-xs opacity-80">{proError}</p>
          </div>
          {onRetryPro && (
            <Button variant="outline" size="sm" onClick={onRetryPro} className="text-destructive border-destructive/30 hover:bg-destructive/10">
              <RefreshCw className="w-3 h-3 mr-1.5" /> Retry
            </Button>
          )}
        </div>
      )}

      {isLoadingPro && !proError && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20 text-primary">
          <RefreshCw className="w-5 h-5 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Looking up PRO affiliations...</p>
            <p className="text-xs opacity-80">Checking ASCAP, BMI, and other registries</p>
          </div>
        </div>
      )}

      {isLoadingShares && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
          <RefreshCw className="w-5 h-5 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Looking up publishing shares...</p>
            <p className="text-xs opacity-80">Searching MLC, ASCAP, and other sources</p>
          </div>
        </div>
      )}

      {renderSection("Artists", filteredArtists, "No artist credits found (unexpected).")}
      {renderSection("Songwriters", filteredWriters, credits.length > 0 ? "No songwriter credits found yet for this track." : "No credits found.")}
      {renderSection("Producers", filteredProducers, credits.length > 0 ? "No producer credits found yet for this track." : "No credits found.")}

      {credits.length === 0 && (
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-6 text-center">
          <p className="text-muted-foreground font-medium">No credits found for this song.</p>
          <p className="text-xs text-muted-foreground mt-1">Try a different search query or streaming link.</p>
        </div>
      )}
    </div>
  );
};
