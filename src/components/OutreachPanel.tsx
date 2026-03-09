import { memo, useMemo, useState, useCallback } from "react";
import { Users, Linkedin, Instagram, Search, Mic2, PenTool, Building2, Mail, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ContactTarget {
  name: string;
  role: "artist" | "writer" | "producer";
  publisher?: string;
  pro?: string;
}

interface OutreachPanelProps {
  artist: string;
  songTitle: string;
  credits: {
    name: string;
    role: string;
    publisher?: string;
    pro?: string;
  }[];
  recordLabel?: string;
}

interface EmailResult {
  email: string | null;
  confidence?: number;
  position?: string;
  source?: string;
  message?: string;
  emails?: { email: string; confidence: number; firstName: string; lastName: string; position: string }[];
}

function buildLinkedInUrl(name: string, role?: string): string {
  const query = role ? `${name} ${role} music` : `${name} music`;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

function buildInstagramUrl(name: string): string {
  const handle = name.replace(/\s+/g, '').toLowerCase();
  return `https://www.instagram.com/${handle}`;
}

function buildGoogleUrl(name: string, context: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`"${name}" ${context} contact`)}`;
}

function getRoleIcon(role: string) {
  switch (role) {
    case "artist": return <Mic2 className="w-3.5 h-3.5" />;
    case "writer": return <PenTool className="w-3.5 h-3.5" />;
    case "producer": return <Users className="w-3.5 h-3.5" />;
    default: return <Users className="w-3.5 h-3.5" />;
  }
}

function getRoleColor(role: string) {
  switch (role) {
    case "artist": return "bg-primary/20 text-primary";
    case "writer": return "bg-blue-500/20 text-blue-400";
    case "producer": return "bg-purple-500/20 text-purple-400";
    default: return "bg-muted text-muted-foreground";
  }
}

/** Guess a company domain from a publisher or label name */
function guessDomain(company: string): string | null {
  if (!company) return null;
  const clean = company
    .toLowerCase()
    .replace(/\s*(music|publishing|entertainment|records|group|inc|llc|ltd|co)\s*/gi, '')
    .trim()
    .replace(/\s+/g, '');
  if (!clean || clean.length < 2) return null;
  return `${clean}.com`;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function getConfidenceBadge(confidence: number) {
  if (confidence >= 80) return <Badge className="text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">High confidence</Badge>;
  if (confidence >= 50) return <Badge className="text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/30">Medium</Badge>;
  return <Badge className="text-[9px] bg-red-500/20 text-red-400 border-red-500/30">Low</Badge>;
}

export const OutreachPanel = memo(({ artist, credits, recordLabel }: OutreachPanelProps) => {
  const [emailResults, setEmailResults] = useState<Record<string, EmailResult | "loading" | "error">>({});

  const targets = useMemo<ContactTarget[]>(() => {
    const result: ContactTarget[] = [];
    const seen = new Set<string>();

    result.push({ name: artist, role: "artist" });
    seen.add(artist.toLowerCase());

    const writers = credits.filter(c => c.role === "writer").slice(0, 5);
    writers.forEach(w => {
      if (!seen.has(w.name.toLowerCase())) {
        result.push({ name: w.name, role: "writer", publisher: w.publisher, pro: w.pro });
        seen.add(w.name.toLowerCase());
      }
    });

    const producers = credits.filter(c => c.role === "producer").slice(0, 3);
    producers.forEach(p => {
      if (!seen.has(p.name.toLowerCase())) {
        result.push({ name: p.name, role: "producer", publisher: p.publisher, pro: p.pro });
        seen.add(p.name.toLowerCase());
      }
    });

    return result;
  }, [artist, credits]);

  const lookupEmail = useCallback(async (target: ContactTarget) => {
    const key = target.name.toLowerCase();
    if (emailResults[key] && emailResults[key] !== "error") return;

    setEmailResults(prev => ({ ...prev, [key]: "loading" }));

    try {
      const { firstName, lastName } = splitName(target.name);
      const domain = guessDomain(target.publisher || recordLabel || "");

      const { data, error } = await supabase.functions.invoke("hunter-lookup", {
        body: { firstName, lastName, domain, company: target.publisher || recordLabel },
      });

      if (error) throw error;
      setEmailResults(prev => ({ ...prev, [key]: data as EmailResult }));
    } catch (err) {
      console.error("Email lookup failed:", err);
      setEmailResults(prev => ({ ...prev, [key]: "error" }));
    }
  }, [emailResults, recordLabel]);

  const lookupLabelEmail = useCallback(async () => {
    if (!recordLabel) return;
    const key = `label:${recordLabel.toLowerCase()}`;
    if (emailResults[key] && emailResults[key] !== "error") return;

    setEmailResults(prev => ({ ...prev, [key]: "loading" }));

    try {
      const domain = guessDomain(recordLabel);
      const { data, error } = await supabase.functions.invoke("hunter-lookup", {
        body: { firstName: "A&R", lastName: "Department", domain, company: recordLabel },
      });

      if (error) throw error;
      setEmailResults(prev => ({ ...prev, [key]: data as EmailResult }));
    } catch (err) {
      console.error("Label email lookup failed:", err);
      setEmailResults(prev => ({ ...prev, [key]: "error" }));
    }
  }, [emailResults, recordLabel]);

  if (credits.length === 0) return null;

  const renderEmailState = (key: string) => {
    const state = emailResults[key];
    if (!state) return null;
    if (state === "loading") return <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />;
    if (state === "error") return <span className="text-[10px] text-destructive">Lookup failed</span>;

    // Direct email found
    if (state.email) {
      return (
        <div className="flex items-center gap-1.5 mt-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          <a href={`mailto:${state.email}`} className="text-[11px] text-primary hover:underline truncate">
            {state.email}
          </a>
          {state.confidence != null && getConfidenceBadge(state.confidence)}
        </div>
      );
    }

    // Domain search returned multiple emails
    if (state.emails && state.emails.length > 0) {
      return (
        <div className="mt-1 space-y-0.5">
          <p className="text-[10px] text-muted-foreground">Related emails at {(state as any).domain}:</p>
          {state.emails.slice(0, 3).map((e) => (
            <div key={e.email} className="flex items-center gap-1.5">
              <Mail className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
              <a href={`mailto:${e.email}`} className="text-[11px] text-primary hover:underline truncate">
                {e.email}
              </a>
              {e.confidence != null && getConfidenceBadge(e.confidence)}
              {e.position && <span className="text-[9px] text-muted-foreground truncate">({e.position})</span>}
            </div>
          ))}
        </div>
      );
    }

    // Not found
    return (
      <div className="flex items-center gap-1 mt-1">
        <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-[10px] text-muted-foreground">{state.message || "No email found"}</span>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="glass rounded-xl p-4 sm:p-5 space-y-4 animate-fade-up">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Contacts
          </h3>
          <Badge variant="outline" className="text-[10px]">
            {targets.length} people
          </Badge>
        </div>

        <div className="space-y-2">
          {targets.map((target, idx) => {
            const key = target.name.toLowerCase();
            const hasResult = emailResults[key] && emailResults[key] !== "loading";

            return (
              <div
                key={`${target.name}-${idx}`}
                className="rounded-lg border border-border/50 bg-card/50 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${getRoleColor(target.role)}`}>
                      {getRoleIcon(target.role)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{target.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize truncate">
                        {target.role}
                        {target.publisher && ` • ${target.publisher}`}
                        {target.pro && ` • ${target.pro}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7"
                          onClick={() => lookupEmail(target)}
                          disabled={emailResults[key] === "loading"}
                        >
                          {emailResults[key] === "loading"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Mail className="w-3.5 h-3.5" />
                          }
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top"><p className="text-xs">Find email via Hunter.io</p></TooltipContent>
                    </Tooltip>
                    <Button variant="ghost" size="icon" className="w-7 h-7" asChild>
                      <a href={buildLinkedInUrl(target.name, target.role)} target="_blank" rel="noopener noreferrer" title="Find on LinkedIn">
                        <Linkedin className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7" asChild>
                      <a href={buildInstagramUrl(target.name)} target="_blank" rel="noopener noreferrer" title="Find on Instagram">
                        <Instagram className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7" asChild>
                      <a href={buildGoogleUrl(target.name, target.role)} target="_blank" rel="noopener noreferrer" title="Search Google">
                        <Search className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
                {renderEmailState(key)}
              </div>
            );
          })}
        </div>

        {recordLabel && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center bg-emerald-500/20 text-emerald-400">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{recordLabel}</p>
                  <p className="text-[10px] text-muted-foreground">Record Label</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={lookupLabelEmail}
                      disabled={emailResults[`label:${recordLabel.toLowerCase()}`] === "loading"}
                    >
                      {emailResults[`label:${recordLabel.toLowerCase()}`] === "loading"
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Mail className="w-3.5 h-3.5" />
                      }
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p className="text-xs">Find label emails</p></TooltipContent>
                </Tooltip>
                <Button variant="ghost" size="icon" className="w-7 h-7" asChild>
                  <a
                    href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(recordLabel)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Find on LinkedIn"
                  >
                    <Linkedin className="w-3.5 h-3.5" />
                  </a>
                </Button>
              </div>
            </div>
            {renderEmailState(`label:${recordLabel.toLowerCase()}`)}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
});

OutreachPanel.displayName = "OutreachPanel";
