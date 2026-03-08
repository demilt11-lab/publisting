import { memo, useMemo } from "react";
import { MessageCircle, Linkedin, Instagram, Twitter, Mail, Copy, Check, ExternalLink, Users, Building2, Mic2, PenTool } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface OutreachTarget {
  name: string;
  role: "artist" | "writer" | "producer" | "publisher" | "label";
  publisher?: string;
  pro?: string;
  isMajor?: boolean;
  region?: string;
}

interface OutreachPanelProps {
  artist: string;
  songTitle: string;
  credits: {
    name: string;
    role: string;
    publisher?: string;
    pro?: string;
    recordLabel?: string;
  }[];
  recordLabel?: string;
  genre?: string;
}

// Rule-based Reddit community suggestions
const GENRE_SUBREDDITS: Record<string, string[]> = {
  pop: ["r/popheads", "r/popmusic"],
  "hip-hop": ["r/hiphopheads", "r/makinghiphop"],
  rap: ["r/hiphopheads", "r/makinghiphop"],
  rock: ["r/rock", "r/indieheads"],
  indie: ["r/indieheads", "r/listentothis"],
  electronic: ["r/electronicmusic", "r/edm"],
  edm: ["r/edm", "r/electronicmusic"],
  country: ["r/country", "r/CountryMusicStuff"],
  latin: ["r/latinmusic", "r/reggaeton"],
  kpop: ["r/kpop", "r/kpophelp"],
  rnb: ["r/rnb", "r/RnBHeads"],
  "r&b": ["r/rnb", "r/RnBHeads"],
  metal: ["r/Metal", "r/metalmusicians"],
  jazz: ["r/Jazz", "r/jazzguitar"],
  classical: ["r/classicalmusic"],
  folk: ["r/folk", "r/indiefolk"],
};

const ROLE_SUBREDDITS: Record<string, string[]> = {
  writer: ["r/Songwriting", "r/WeAreTheMusicMakers", "r/musicbusiness"],
  producer: ["r/musicproduction", "r/WeAreTheMusicMakers", "r/edmproduction"],
  artist: ["r/WeAreTheMusicMakers", "r/musicmarketing", "r/independentmusic"],
  publisher: ["r/musicbusiness", "r/musicindustry"],
  label: ["r/musicbusiness", "r/recordlabels", "r/musicindustry"],
};

const MAJOR_PUBLISHERS = ["sony", "universal", "warner", "bmg", "kobalt", "concord", "downtown", "spirit", "peermusic"];
const MAJOR_LABELS = ["universal", "sony", "warner", "emi", "atlantic", "capitol", "interscope", "def jam", "republic", "columbia", "rca", "epic"];

function isMajorPublisher(pub?: string): boolean {
  if (!pub) return false;
  const lower = pub.toLowerCase();
  return MAJOR_PUBLISHERS.some(m => lower.includes(m));
}

function isMajorLabel(label?: string): boolean {
  if (!label) return false;
  const lower = label.toLowerCase();
  return MAJOR_LABELS.some(m => lower.includes(m));
}

function getRoleIcon(role: string) {
  switch (role) {
    case "artist": return <Mic2 className="w-3.5 h-3.5" />;
    case "writer": return <PenTool className="w-3.5 h-3.5" />;
    case "producer": return <Users className="w-3.5 h-3.5" />;
    case "publisher": return <Building2 className="w-3.5 h-3.5" />;
    case "label": return <Building2 className="w-3.5 h-3.5" />;
    default: return <Users className="w-3.5 h-3.5" />;
  }
}

export const OutreachPanel = memo(({ artist, songTitle, credits, recordLabel, genre }: OutreachPanelProps) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const targets = useMemo<OutreachTarget[]>(() => {
    const result: OutreachTarget[] = [];
    
    // Main artist
    result.push({
      name: artist,
      role: "artist",
      isMajor: isMajorLabel(recordLabel),
    });

    // Key writers (max 3)
    const writers = credits.filter(c => c.role === "writer").slice(0, 3);
    writers.forEach(w => {
      result.push({
        name: w.name,
        role: "writer",
        publisher: w.publisher,
        pro: w.pro,
        isMajor: isMajorPublisher(w.publisher),
      });
    });

    // Key producers (max 2)
    const producers = credits.filter(c => c.role === "producer").slice(0, 2);
    producers.forEach(p => {
      if (!result.find(r => r.name === p.name)) {
        result.push({
          name: p.name,
          role: "producer",
          publisher: p.publisher,
          pro: p.pro,
          isMajor: isMajorPublisher(p.publisher),
        });
      }
    });

    // Primary publishers (unique)
    const publishers = new Set(credits.filter(c => c.publisher).map(c => c.publisher!));
    Array.from(publishers).slice(0, 2).forEach(pub => {
      result.push({
        name: pub,
        role: "publisher",
        isMajor: isMajorPublisher(pub),
      });
    });

    // Label
    if (recordLabel) {
      result.push({
        name: recordLabel,
        role: "label",
        isMajor: isMajorLabel(recordLabel),
      });
    }

    return result;
  }, [artist, credits, recordLabel]);

  const getSuggestions = useCallback((target: OutreachTarget) => {
    const subreddits: string[] = ["r/WeAreTheMusicMakers", "r/musicbusiness"];
    
    // Add genre-specific
    if (genre) {
      const genreLower = genre.toLowerCase();
      Object.entries(GENRE_SUBREDDITS).forEach(([key, subs]) => {
        if (genreLower.includes(key)) {
          subreddits.push(...subs);
        }
      });
    }

    // Add role-specific
    if (ROLE_SUBREDDITS[target.role]) {
      subreddits.push(...ROLE_SUBREDDITS[target.role]);
    }

    // Social suggestions based on role
    const socials: string[] = [];
    if (target.role === "artist") {
      socials.push("Instagram DM", "X/Twitter mentions");
    } else if (target.role === "writer" || target.role === "producer") {
      socials.push("Instagram DM", "LinkedIn (if pro)", "X/Twitter");
    } else if (target.role === "publisher" || target.role === "label") {
      socials.push("LinkedIn (A&R staff)", "Company website contact", "Industry events");
    }

    return {
      subreddits: [...new Set(subreddits)].slice(0, 4),
      socials,
    };
  }, [genre]);

  const generatePrompt = useCallback((target: OutreachTarget): string => {
    if (target.role === "artist") {
      return `Hi! I came across "${songTitle}" and loved the sound. I'm researching catalog opportunities — would love to connect with whoever handles your publishing/admin. Best person to reach out to?`;
    }
    if (target.role === "writer" || target.role === "producer") {
      if (target.isMajor) {
        return `Hi ${target.name.split(" ")[0]}, loved your work on "${songTitle}". I'm exploring admin/sync opportunities for writers at your level. Is there a good time to chat about how you're set up on the publishing side?`;
      }
      return `Hey ${target.name.split(" ")[0]}! Discovered your credit on "${songTitle}" — great track. I work in publishing/admin and would love to connect. Are you currently signed or open to exploring options?`;
    }
    if (target.role === "publisher") {
      return `Hi, I'm researching catalog/admin opportunities and noticed your involvement with "${songTitle}" by ${artist}. Would love to learn more about potential JV structures or co-pub conversations. Best way to connect?`;
    }
    if (target.role === "label") {
      return `Hello, I'm researching the catalog around "${songTitle}". Who would be the best contact to discuss sync licensing or catalog representation opportunities?`;
    }
    return "";
  }, [songTitle, artist]);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      toast({ title: "Copied!", description: "Prompt copied to clipboard" });
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, [toast]);

  if (credits.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4 sm:p-5 space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          Outreach & Targets
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {targets.length} contacts
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Rule-based suggestions for reaching key decision-makers. Use these as starting points — always verify before outreach.
      </p>

      <div className="space-y-3">
        {targets.map((target, idx) => {
          const suggestions = getSuggestions(target);
          const prompt = generatePrompt(target);
          const copyId = `${target.name}-${idx}`;

          return (
            <div
              key={copyId}
              className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                    target.role === "artist" ? "bg-primary/20 text-primary" :
                    target.role === "publisher" || target.role === "label" ? "bg-emerald-500/20 text-emerald-400" :
                    "bg-blue-500/20 text-blue-400"
                  }`}>
                    {getRoleIcon(target.role)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{target.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {target.role}
                      {target.publisher && ` • ${target.publisher}`}
                      {target.pro && ` • ${target.pro}`}
                    </p>
                  </div>
                </div>
                {target.isMajor ? (
                  <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20">Major</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Indie</Badge>
                )}
              </div>

              {/* Where to look */}
              <div className="pl-9 space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Where to look</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.subreddits.map(sub => (
                    <a
                      key={sub}
                      href={`https://reddit.com/${sub}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-[10px] hover:bg-orange-500/20 transition-colors"
                    >
                      {sub}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {suggestions.socials.map(social => (
                    <span
                      key={social}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px]"
                    >
                      {social.includes("Instagram") && <Instagram className="w-2.5 h-2.5" />}
                      {social.includes("LinkedIn") && <Linkedin className="w-2.5 h-2.5" />}
                      {social.includes("Twitter") && <Twitter className="w-2.5 h-2.5" />}
                      {social.includes("email") && <Mail className="w-2.5 h-2.5" />}
                      {social}
                    </span>
                  ))}
                </div>
              </div>

              {/* Outreach prompt */}
              {prompt && (target.role === "artist" || target.role === "publisher" || target.role === "writer" || target.role === "producer") && (
                <div className="pl-9 pt-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Sample prompt</p>
                  <div className="relative group">
                    <p className="text-xs text-foreground/80 bg-secondary/50 rounded-md p-2 pr-8 leading-relaxed">
                      {prompt}
                    </p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleCopy(prompt, copyId)}
                        >
                          {copiedId === copyId ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy prompt</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground text-center pt-2">
        💡 These are rule-based suggestions, not scraped data. Always verify contacts independently.
      </p>
    </div>
  );
});

OutreachPanel.displayName = "OutreachPanel";
