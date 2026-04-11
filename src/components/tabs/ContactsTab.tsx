import { memo, useMemo, useState, useEffect, useCallback } from "react";
import { User, Building2, Mail, Phone, Info, RefreshCw, Search, Shield, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Credit } from "@/components/CreditsSection";
import { supabase } from "@/integrations/supabase/client";
import { ReportIssueModal } from "@/components/ReportIssueModal";

interface ContactsTabProps {
  artist: string;
  songTitle: string;
  credits: Credit[];
  recordLabel?: string;
}

interface ContactResult {
  personName: string;
  contactType: "email" | "phone";
  value: string;
  contactFor: string;
  foundAt: string;
  confidence?: number;
}

export const ContactsTab = memo(({ artist, songTitle, credits, recordLabel }: ContactsTabProps) => {
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const management = useMemo(() => {
    return credits.find(c => c.role === "artist" && c.management)?.management || undefined;
  }, [credits]);

  const topPublishers = useMemo(() => {
    const pubs = new Set<string>();
    credits.forEach(c => { if (c.publisher) pubs.add(c.publisher); });
    return [...pubs].slice(0, 3);
  }, [credits]);

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("contact-discovery", {
        body: {
          artistName: artist,
          recordLabel,
          publishers: topPublishers,
          management,
        },
      });

      if (!error && data?.success) {
        setContacts(data.contacts || []);
      }
    } catch (e) {
      console.error("Contact discovery failed:", e);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [artist, recordLabel, topPublishers, management]);

  useEffect(() => {
    setContacts([]);
    setHasLoaded(false);
    fetchContacts();
  }, [fetchContacts]);

  const emails = useMemo(() => contacts.filter(c => c.contactType === "email"), [contacts]);
  const phones = useMemo(() => contacts.filter(c => c.contactType === "phone"), [contacts]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Report issue */}
      <div className="flex justify-end">
        <ReportIssueModal songTitle={songTitle} songArtist={artist} module="contacts" />
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Direct Contacts — {artist}
            </h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[280px]">
                Contact information sourced from public profiles, social media bios, label/publisher websites, and industry databases. Social media links are available in the artist dropdown menu in Full Credits.
              </TooltipContent>
            </Tooltip>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={fetchContacts}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                Refresh
              </>
            )}
          </Button>
        </div>

        {isLoading && !hasLoaded && (
          <div className="flex items-center justify-center py-8 gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Searching public sources for contact info...</span>
          </div>
        )}

        {hasLoaded && contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No direct contact info found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                No publicly available emails or phone numbers were found for {artist} or their team. Try checking their social media bios or official website directly.
              </p>
            </div>
          </div>
        )}

        {/* Email contacts */}
        {emails.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> Email Addresses ({emails.length})
            </h4>
            <div className="space-y-2">
              {emails.map((contact, i) => (
                <div
                  key={`email-${i}`}
                  className="rounded-lg border border-border/50 bg-secondary/30 p-3.5 hover:border-primary/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{contact.personName}</span>
                        <Badge variant="outline" className="text-[10px]">{contact.contactFor}</Badge>
                      </div>
                      <a
                        href={`mailto:${contact.value}`}
                        className="text-sm text-primary hover:underline break-all"
                      >
                        {contact.value}
                      </a>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Shield className="w-2.5 h-2.5" />
                        Found at: {contact.foundAt}
                        {contact.confidence != null && (
                          <span className="text-muted-foreground/70">
                            · {contact.confidence}% confidence
                          </span>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 shrink-0" asChild>
                      <a href={`mailto:${contact.value}`}>
                        <Mail className="w-3 h-3" /> Email
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phone contacts */}
        {phones.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> Phone Numbers ({phones.length})
            </h4>
            <div className="space-y-2">
              {phones.map((contact, i) => (
                <div
                  key={`phone-${i}`}
                  className="rounded-lg border border-border/50 bg-secondary/30 p-3.5 hover:border-primary/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{contact.personName}</span>
                        <Badge variant="outline" className="text-[10px]">{contact.contactFor}</Badge>
                      </div>
                      <a
                        href={`tel:${contact.value}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {contact.value}
                      </a>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Shield className="w-2.5 h-2.5" />
                        Found at: {contact.foundAt}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 shrink-0" asChild>
                      <a href={`tel:${contact.value}`}>
                        <Phone className="w-3 h-3" /> Call
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Key Contacts — management, label, publisher cards (no social links) */}
      {(management || recordLabel || topPublishers.length > 0) && (
        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Industry Contacts</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[260px]">
                Key decision-makers derived from track credits and label/publisher metadata.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {management && (
              <div className="rounded-lg border border-border/50 bg-secondary/30 p-4 space-y-2 hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Artist Manager</span>
                </div>
                <p className="text-sm font-medium text-foreground">{management}</p>
                <Badge variant="outline" className="text-[10px]">Management</Badge>
              </div>
            )}

            {recordLabel && (
              <div className="rounded-lg border border-border/50 bg-secondary/30 p-4 space-y-2 hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Record Label</span>
                </div>
                <p className="text-sm font-medium text-foreground">{recordLabel}</p>
                <Badge variant="outline" className="text-[10px]">A&R Representative</Badge>
              </div>
            )}

            {topPublishers.map(pub => (
              <div key={pub} className="rounded-lg border border-border/50 bg-secondary/30 p-4 space-y-2 hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Publisher</span>
                </div>
                <p className="text-sm font-medium text-foreground">{pub}</p>
                <Badge variant="outline" className="text-[10px]">Publishing A&R</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

ContactsTab.displayName = "ContactsTab";
