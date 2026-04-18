import { useState, useCallback, useMemo } from "react";
import { AlertCircle, RefreshCw, Eye, EyeOff, Copy, Check, Users } from "lucide-react";
import { CreditsExport } from "./CreditsExport";
import { StreamingStats } from "@/lib/api/streamingStats";
import { CreditCard, CreditRole, PublishingStatus } from "./CreditCard";
import { CreditCardSkeleton } from "./CreditCardSkeleton";
import { CreditsFilterBar } from "./CreditsFilterBar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { GapsMessage } from "@/components/ui/gaps-message";
import { calculateCreditsConfidence, detectPublishingGaps } from "@/lib/confidence";
import { CreditFilters, DEFAULT_CREDIT_FILTERS } from "@/hooks/useFilterPreferences";

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
  socialLinks?: Record<string, string>;
  spotifyArtistId?: string;
  appleArtistId?: string;
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
  songAlbum?: string;
  isrc?: string;
  recordLabel?: string;
  streamingStats?: StreamingStats | null;
  creditFilters?: CreditFilters;
  onCreditFiltersChange?: (filters: CreditFilters) => void;
  onResetCreditFilters?: () => void;
}

export const CreditsSection = ({ credits, isLoadingPro, isLoadingShares, proError, onRetryPro, onViewCatalog, songTitle, songArtist, songAlbum, isrc, recordLabel, streamingStats, creditFilters, onCreditFiltersChange, onResetCreditFilters }: CreditsSectionProps) => {
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [copied, setCopied] = useState(false);
  const filters = creditFilters || DEFAULT_CREDIT_FILTERS;
  const { toast } = useToast();

  // Nickname / abbreviation map for common first-name variants
  const NAME_VARIANTS: Record<string, string> = {
    matt: 'matthew', matty: 'matthew', mike: 'michael', mikey: 'michael',
    rob: 'robert', robbie: 'robert', bob: 'robert', bobby: 'robert',
    will: 'william', bill: 'william', billy: 'william', willy: 'william',
    jim: 'james', jimmy: 'james', jamie: 'james',
    dave: 'david', danny: 'daniel', dan: 'daniel',
    chris: 'christopher', tony: 'anthony', joe: 'joseph', joey: 'joseph',
    tom: 'thomas', tommy: 'thomas', nick: 'nicholas', nicky: 'nicholas',
    ben: 'benjamin', benny: 'benjamin', ed: 'edward', eddie: 'edward',
    sam: 'samuel', sammy: 'samuel', steve: 'stephen', stevie: 'stephen',
    alex: 'alexander', al: 'albert', fred: 'frederick', freddie: 'frederick',
    charlie: 'charles', chuck: 'charles', dick: 'richard', rick: 'richard',
    pat: 'patrick', paddy: 'patrick', andy: 'andrew', drew: 'andrew',
    greg: 'gregory', larry: 'lawrence', lenny: 'leonard', ray: 'raymond',
    ted: 'theodore', theo: 'theodore', pete: 'peter', jon: 'jonathan',
    kate: 'katherine', katie: 'katherine', liz: 'elizabeth', beth: 'elizabeth',
    jen: 'jennifer', jenny: 'jennifer', meg: 'margaret', maggie: 'margaret',
    sue: 'susan', becky: 'rebecca', lex: 'alexis',
  };

  // Extract the "core" of a name: strip quotes/parens, normalize first-name variants
  const coreName = (name: string): string => {
    let n = name.toLowerCase()
      .replace(/[''"""]/g, '') // strip quotes
      .replace(/\s*\(.*?\)\s*/g, ' ') // strip parentheticals
      .replace(/\s*\[.*?\]\s*/g, ' ')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Normalize first name via variant map
    const parts = n.split(' ');
    if (parts.length >= 2 && NAME_VARIANTS[parts[0]]) {
      parts[0] = NAME_VARIANTS[parts[0]];
    }
    return parts.join(' ');
  };

  // Extract nicknames from quoted portions like Oscar "Oskeyz" Steeler → ["oskeyz"]
  const extractNicknames = (name: string): string[] => {
    const matches = name.match(/[''"""\u201C\u201D\u2018\u2019]([^'"""\u201C\u201D\u2018\u2019]+)[''"""\u201C\u201D\u2018\u2019]/g);
    if (!matches) return [];
    return matches.map(m => m.replace(/[''"""\u201C\u201D\u2018\u2019]/g, '').toLowerCase().trim()).filter(Boolean);
  };

  // Step 0: Normalize role aliases so DSP/source variants map to our 3 buckets.
  // Composers, songwriters, lyricists, authors → writer.
  // Co-producers, executive producers, "produced by", production → producer.
  const normalizeRole = (raw: any): CreditRole => {
    const r = String(raw || '').toLowerCase().trim();
    if (!r) return 'writer';
    if (/(^|[^a-z])(co-?producer|executive\s+producer|produced\s+by|production|producer)([^a-z]|$)/.test(r)) return 'producer';
    if (/(^|[^a-z])(writer|songwriter|composer|composed\s+by|lyricist|lyrics|author|written\s+by|music\s+by|words\s+by|arranger)([^a-z]|$)/.test(r)) return 'writer';
    if (/(artist|performer|vocal|featuring|feat\.?)/.test(r)) return 'artist';
    // Pass through if it already matches our enum
    if (r === 'writer' || r === 'producer' || r === 'artist') return r as CreditRole;
    // Default unrecognized creative roles to writer so we don't drop them silently
    return 'writer';
  };

  const normalizedCredits = useMemo(
    () => credits.map(c => ({ ...c, role: normalizeRole(c.role) })),
    [credits]
  );

  // Step 1: Merge metadata so the same person always shows the same info
  // Also handles nickname/abbreviation dedup (Matt Brooks = Matthew Brooks, Oskeyz = Oscar "Oskeyz" Steeler)
  const unifiedCredits = useMemo(() => {
    const bestByKey = new Map<string, { credit: Credit; aliases: Set<string> }>();

    // Build a function to find the matching key for a name
    const findKey = (name: string): string | null => {
      const core = coreName(name);
      if (bestByKey.has(core)) return core;
      // Check if this name's core is a nickname embedded in another entry
      const nicknames = extractNicknames(name);
      for (const [key, entry] of bestByKey) {
        // Check if core matches via nickname aliases
        if (entry.aliases.has(core)) return key;
        // Check if any nickname of this name matches a known alias
        for (const nick of nicknames) {
          if (entry.aliases.has(nick)) return key;
        }
        // Check if any known alias matches a nickname or surname
        const coreParts = core.split(' ');
        const keyParts = key.split(' ');
        // Same surname, compatible first name
        if (coreParts.length >= 2 && keyParts.length >= 2) {
          const coreSurname = coreParts[coreParts.length - 1];
          const keySurname = keyParts[keyParts.length - 1];
          if (coreSurname === keySurname && (
            coreParts[0] === keyParts[0] || // same first name after normalization
            NAME_VARIANTS[coreParts[0]] === keyParts[0] ||
            NAME_VARIANTS[keyParts[0]] === coreParts[0]
          )) return key;
        }
      }
      return null;
    };

    // First pass: group credits by resolved identity
    for (const c of normalizedCredits) {
      const core = coreName(c.name);
      const nicknames = extractNicknames(c.name);
      const existingKey = findKey(c.name);

      if (existingKey) {
        const entry = bestByKey.get(existingKey)!;
        entry.aliases.add(core);
        nicknames.forEach(n => entry.aliases.add(n));
        // Merge metadata into best
        const existing = entry.credit;
        if (!existing.publisher && c.publisher) existing.publisher = c.publisher;
        if (!existing.pro && c.pro) existing.pro = c.pro;
        if (!existing.ipi && c.ipi) existing.ipi = c.ipi;
        if (!existing.recordLabel && c.recordLabel) existing.recordLabel = c.recordLabel;
        if (!existing.management && c.management) existing.management = c.management;
        if (!existing.source && c.source) existing.source = c.source;
        if (!existing.region && c.region) existing.region = c.region;
        if (!existing.regionFlag && c.regionFlag) existing.regionFlag = c.regionFlag;
        if (!existing.regionLabel && c.regionLabel) existing.regionLabel = c.regionLabel;
        if (existing.publishingShare == null && c.publishingShare != null) existing.publishingShare = c.publishingShare;
        if (!existing.shareSource && c.shareSource) existing.shareSource = c.shareSource;
        if (!existing.socialLinks && c.socialLinks) existing.socialLinks = c.socialLinks;
        else if (existing.socialLinks && c.socialLinks) existing.socialLinks = { ...existing.socialLinks, ...c.socialLinks };
        if (existing.publishingStatus === 'unknown' && c.publishingStatus !== 'unknown') existing.publishingStatus = c.publishingStatus;
        if (existing.publishingStatus === 'unsigned' && c.publishingStatus === 'signed') existing.publishingStatus = c.publishingStatus;
        // Prefer the longer/fuller name
        if (c.name.length > existing.name.length) existing.name = c.name;
      } else {
        const aliases = new Set([core, ...nicknames]);
        bestByKey.set(core, { credit: { ...c }, aliases });
      }
    }

    // Build a lookup: for any credit, find its canonical entry
    const canonicalFor = (name: string): Credit => {
      const key = findKey(name);
      if (key) return bestByKey.get(key)!.credit;
      return bestByKey.values().next().value!.credit; // fallback
    };

    // Second pass: apply unified metadata back to all credits
    return normalizedCredits.map(c => {
      const best = canonicalFor(c.name);
      return {
        ...c,
        name: best.name, // use canonical (fullest) name
        publisher: best.publisher,
        pro: best.pro,
        ipi: best.ipi,
        recordLabel: best.recordLabel,
        management: best.management,
        publishingStatus: best.publishingStatus,
        publishingShare: best.publishingShare,
        shareSource: best.shareSource,
        socialLinks: best.socialLinks,
        region: best.region,
        regionFlag: best.regionFlag,
        regionLabel: best.regionLabel,
      };
    });
  }, [normalizedCredits]);

  // Step 2: Compute which roles each name has
  const rolesByName = useMemo(() => {
    return unifiedCredits.reduce<Record<string, CreditRole[]>>((acc, c) => {
      const key = coreName(c.name);
      if (!acc[key]) acc[key] = [];
      if (!acc[key].includes(c.role)) acc[key].push(c.role);
      return acc;
    }, {});
  }, [unifiedCredits]);

  const withAlsoRoles = useCallback((c: Credit): Credit => {
    const key = coreName(c.name);
    return { ...c, alsoRoles: rolesByName[key] || [c.role] };
  }, [rolesByName]);

  // Step 3: Deduplicate within each section (a name should only appear once per role)
  const deduplicateSection = useCallback((items: Credit[]): Credit[] => {
    const seen = new Set<string>();
    return items.filter(c => {
      const key = coreName(c.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const { artists, writers, producers, totalCredits, uniqueNames, duplicateCount, roleCounts } = useMemo(() => {
    // Always deduplicate within each section (no name appears twice in same section)
    const allArtists = deduplicateSection(unifiedCredits.filter(c => c.role === "artist").map(withAlsoRoles));
    const allWriters = deduplicateSection(unifiedCredits.filter(c => c.role === "writer").map(withAlsoRoles));
    const allProducers = deduplicateSection(unifiedCredits.filter(c => c.role === "producer").map(withAlsoRoles));

    const totalUniqueNames = new Set(unifiedCredits.map(c => c.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim())).size;
    const crossRoleDuplicates = (allArtists.length + allWriters.length + allProducers.length) - totalUniqueNames;

    if (!hideDuplicates) {
      return {
        artists: allArtists, writers: allWriters, producers: allProducers,
        totalCredits: unifiedCredits.length,
        uniqueNames: totalUniqueNames,
        duplicateCount: Math.max(0, crossRoleDuplicates),
        roleCounts: { artist: allArtists.length, writer: allWriters.length, producer: allProducers.length },
      };
    }

    // When hiding duplicates, show each person only once across all sections
    const dedupKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const seenNames = new Set<string>();
    const dedupedArtists: Credit[] = [];
    const dedupedWriters: Credit[] = [];
    const dedupedProducers: Credit[] = [];

    for (const c of allArtists) { const key = dedupKey(c.name); if (!seenNames.has(key)) { seenNames.add(key); dedupedArtists.push(c); } }
    for (const c of allWriters) { const key = dedupKey(c.name); if (!seenNames.has(key)) { seenNames.add(key); dedupedWriters.push(c); } }
    for (const c of allProducers) { const key = dedupKey(c.name); if (!seenNames.has(key)) { seenNames.add(key); dedupedProducers.push(c); } }

    return {
      artists: dedupedArtists, writers: dedupedWriters, producers: dedupedProducers,
      totalCredits: unifiedCredits.length,
      uniqueNames: totalUniqueNames,
      duplicateCount: Math.max(0, crossRoleDuplicates),
      roleCounts: { artist: allArtists.length, writer: allWriters.length, producer: allProducers.length },
    };
  }, [unifiedCredits, hideDuplicates, withAlsoRoles, deduplicateSection]);

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

  // Apply pub/label/role filters
  const applySigningFilter = useCallback((items: Credit[]) => {
    let result = items;
    if (filters.pubStatus === "pub_signed") result = result.filter(c => !!c.publisher);
    else if (filters.pubStatus === "pub_unsigned") result = result.filter(c => !c.publisher && !c.pro);
    else if (filters.pubStatus === "pub_unknown") result = result.filter(c => !c.publisher && !!c.pro);

    if (filters.labelStatus === "label_signed") result = result.filter(c => !!c.recordLabel);
    else if (filters.labelStatus === "label_unsigned") result = result.filter(c => c.role === "artist" && !c.recordLabel);
    else if (filters.labelStatus === "label_unknown") result = result.filter(c => c.role !== "artist" || !c.recordLabel);

    return result;
  }, [filters]);

  const roleFilter = filters.roleFilter;
  const filteredArtists = (roleFilter === "all" || roleFilter === "artists") ? applySigningFilter(artists) : [];
  const filteredWriters = (roleFilter === "all" || roleFilter === "writers") ? applySigningFilter(writers) : [];
  const filteredProducers = (roleFilter === "all" || roleFilter === "producers") ? applySigningFilter(producers) : [];

  // Calculate confidence and gaps
  // If splits are estimated (no MLC/SongView data), override to "medium" with "Estimated" label
  const rawConfidence = useMemo(() => calculateCreditsConfidence(credits), [credits]);
  const hasVerifiedShares = credits.some(c => c.shareSource && /mlc|songview|ascap|bmi|sesac/i.test(c.shareSource));
  const confidence = useMemo(() => {
    if (!hasVerifiedShares && rawConfidence.level === "high") {
      return {
        ...rawConfidence,
        level: "medium" as const,
        reasons: ["Publishing splits are estimated — not sourced from MLC/SongView", ...rawConfidence.reasons],
      };
    }
    return rawConfidence;
  }, [rawConfidence, hasVerifiedShares]);
  const gaps = useMemo(() => detectPublishingGaps(credits), [credits]);

  const renderSection = (title: string, items: Credit[], emptyHint: string) => {
    if (items.length === 0 && roleFilter !== "all") return null;
    return (
      <div className="space-y-3">
        {/* Section title — 12px uppercase */}
        <h3 className="section-label flex items-center gap-2">
          {title}
          <span className="text-muted-foreground font-normal">({items.length})</span>
          {isLoadingPro && (
            <span className="flex items-center gap-1.5 text-xs font-normal text-primary normal-case tracking-normal">
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
      {/* Section header — 12px uppercase label */}
      <div className="border-l-2 border-primary pl-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="section-label mb-1">Credits & Publishing Rights</h2>
            <p className="text-xs text-muted-foreground">
              Everyone who wrote, produced, or performed this song — and who owns the rights
            </p>
          </div>
          <ConfidenceBadge confidence={confidence} />
        </div>
      </div>

      {/* Filter bar */}
      <CreditsFilterBar
        filters={filters}
        onChange={onCreditFiltersChange || (() => {})}
        onReset={onResetCreditFilters || (() => {})}
      />

      {/* Controls row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyAll} disabled={credits.length === 0}>
            {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
            {copied ? "Copied!" : "Copy All Credits"}
          </Button>
          {songTitle && songArtist && (
            <CreditsExport
              credits={credits}
              songTitle={songTitle}
              artist={songArtist}
              album={songAlbum}
              isrc={isrc}
              recordLabel={recordLabel}
              streamingStats={streamingStats ? {
                spotifyStreams: streamingStats.spotify?.streamCount,
                youtubeViews: streamingStats.youtube?.viewCount,
                shazamCount: streamingStats.shazam?.count,
                geniusPageviews: streamingStats.genius?.pageviews,
              } : undefined}
            />
          )}
        </div>

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

      {/* Gaps and next steps */}
      <GapsMessage gaps={gaps} />
    </div>
  );
};
