import { memo, useMemo } from "react";
import { User, Building2, Linkedin, Instagram, Mail, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Credit } from "@/components/CreditsSection";
import { OutreachPanel } from "@/components/OutreachPanel";

interface ContactsTabProps {
  artist: string;
  songTitle: string;
  credits: Credit[];
  recordLabel?: string;
}

function buildLinkedInUrl(name: string, role?: string): string {
  const query = role ? `${name} ${role} music` : `${name} music`;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

function buildInstagramUrl(name: string): string {
  const handle = name.replace(/\s+/g, "").toLowerCase();
  return `https://www.instagram.com/${handle}`;
}

export const ContactsTab = memo(({ artist, songTitle, credits, recordLabel }: ContactsTabProps) => {
  const management = useMemo(() => {
    return credits.find(c => c.role === "artist" && c.management)?.management || null;
  }, [credits]);

  const topPublishers = useMemo(() => {
    const pubs = new Set<string>();
    credits.forEach(c => { if (c.publisher) pubs.add(c.publisher); });
    return [...pubs].slice(0, 3);
  }, [credits]);

  const contactCards = useMemo(() => {
    const cards: { title: string; name?: string; company?: string; role?: string; type: "person" | "company" }[] = [];
    cards.push({ title: "Artist Manager", name: management || undefined, company: management ? "Management" : undefined, type: "person" });
    if (recordLabel) cards.push({ title: "Label A&R", company: recordLabel, role: "A&R Representative", type: "company" });
    topPublishers.forEach(pub => cards.push({ title: "Publisher Contact", company: pub, role: "Publishing A&R", type: "company" }));
    return cards;
  }, [management, recordLabel, topPublishers]);

  const hasContacts = contactCards.some(c => c.name || c.company);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Key Contacts Cards */}
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Key Contacts</h3>

        {!hasContacts ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <UserX className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No public contacts found</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                Contact information isn't publicly available for this track's team. Try searching for the artist or publisher on LinkedIn.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contactCards.map((card, i) => (
              <div key={i} className="rounded-lg border border-border/50 bg-secondary/30 p-4 space-y-3 hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-2">
                  {card.type === "person" ? <User className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-primary" />}
                  <span className="text-xs font-semibold text-foreground">{card.title}</span>
                </div>
                {card.name ? (
                  <p className="text-sm font-medium text-foreground">{card.name}</p>
                ) : card.company ? (
                  <p className="text-sm font-medium text-foreground">{card.company}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Not available</p>
                )}
                {card.role && <Badge variant="outline" className="text-[10px]">{card.role}</Badge>}
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="text-[10px] gap-1 h-7 flex-1" asChild>
                    <a href={buildLinkedInUrl(card.name || artist, card.role)} target="_blank" rel="noopener noreferrer">
                      <Linkedin className="w-3 h-3" /> LinkedIn
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="text-[10px] gap-1 h-7 flex-1" asChild>
                    <a href={buildInstagramUrl(card.name || artist)} target="_blank" rel="noopener noreferrer">
                      <Instagram className="w-3 h-3" /> IG
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outreach / Email Lookup */}
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Outreach & Email Finder</h3>
        </div>
        <OutreachPanel artist={artist} songTitle={songTitle} credits={credits} recordLabel={recordLabel} />
      </div>
    </div>
  );
});

ContactsTab.displayName = "ContactsTab";
