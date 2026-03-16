import { memo, useMemo, useState } from "react";
import { User, Building2, Search, Mail, Linkedin, Globe, Instagram, ExternalLink, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Credit } from "./CreditsSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ContactsPanelProps {
  artist: string;
  credits: Credit[];
  recordLabel?: string;
}

function buildLinkedInUrl(name: string, role?: string): string {
  const query = role
    ? `${name} ${role}`
    : name;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

function buildInstagramUrl(name: string): string {
  const handle = name.replace(/\s+/g, '').toLowerCase();
  return `https://www.instagram.com/${handle}`;
}

function buildLinkedInCompanyUrl(company: string): string {
  // Try direct company page via slug (e.g., "Sony Music" → "sony-music")
  const slug = company
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return `https://www.linkedin.com/company/${slug}`;
}

function buildGoogleFallbackUrl(name: string, context: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`"${name}" ${context}`)}`;
}

interface ContactCardProps {
  title: string;
  name?: string;
  company?: string;
  role?: string;
  icon: React.ReactNode;
  artistName: string;
}

const ContactCard = ({ title, name, company, role, icon, artistName }: ContactCardProps) => {
  const displayName = name || artistName;
  const linkedInUrl = name
    ? buildLinkedInUrl(name, role)
    : buildLinkedInUrl(artistName, title === "Artist Manager" ? "manager music" : "A&R");
  const instagramUrl = buildInstagramUrl(displayName);
  const companyLinkedIn = company ? buildLinkedInCompanyUrl(company) : null;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      {name ? (
        <div className="space-y-1">
          <p className="text-sm text-foreground font-medium">{name}</p>
          {company && (
            <a
              href={companyLinkedIn || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
            >
              {company}
            </a>
          )}
          {role && <p className="text-xs text-primary">{role}</p>}
          <Badge variant="outline" className="text-[10px] bg-muted/50">Public data</Badge>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No public contact found</p>
      )}

      {/* Direct profile links */}
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7 flex-1" asChild>
          <a href={linkedInUrl} target="_blank" rel="noopener noreferrer">
            <Linkedin className="w-3 h-3" /> LinkedIn
          </a>
        </Button>
        <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7 flex-1" asChild>
          <a href={instagramUrl} target="_blank" rel="noopener noreferrer">
            <Instagram className="w-3 h-3" /> Instagram
          </a>
        </Button>
      </div>
      {!name && (
        <Button variant="ghost" size="sm" className="w-full text-xs gap-1.5 h-7 text-muted-foreground" asChild>
          <a
            href={buildGoogleFallbackUrl(artistName, `${title.toLowerCase()} contact`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Search className="w-3 h-3" /> Search Google
          </a>
        </Button>
      )}
    </div>
  );
};

export const ContactsPanel = memo(({ artist, credits, recordLabel }: ContactsPanelProps) => {
  const [isOpen, setIsOpen] = useState(true);

  const management = useMemo(() => {
    const artistCredit = credits.find(c => c.role === "artist" && c.management);
    return artistCredit?.management || null;
  }, [credits]);

  const topPublishers = useMemo(() => {
    const pubs = new Set<string>();
    credits.forEach(c => { if (c.publisher) pubs.add(c.publisher); });
    return [...pubs].slice(0, 3);
  }, [credits]);

  return (
    <div className="space-y-4 animate-fade-up">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between border-l-4 border-primary pl-4 pr-2 py-1 hover:bg-accent/30 rounded-r-lg transition-colors">
            <div className="text-left">
              <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                Contacts — Manager & A&R
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Direct links to artist manager, label A&R, and publisher contacts
              </p>
            </div>
            {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Primary CTA - goes directly to LinkedIn */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="default" size="sm" className="gap-2" asChild>
              <a href={buildLinkedInUrl(artist, "manager music")} target="_blank" rel="noopener noreferrer">
                <Linkedin className="w-4 h-4" /> Find Manager on LinkedIn
              </a>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={buildInstagramUrl(artist)} target="_blank" rel="noopener noreferrer">
                <Instagram className="w-4 h-4" /> Artist Instagram
              </a>
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ContactCard
              title="Artist Manager"
              name={management || undefined}
              company={management ? "Management" : undefined}
              icon={<User className="w-4 h-4 text-primary" />}
              artistName={artist}
            />

            {recordLabel && (
              <ContactCard
                title="Label A&R"
                company={recordLabel}
                role="A&R Representative"
                icon={<Building2 className="w-4 h-4 text-primary" />}
                artistName={artist}
              />
            )}

            {topPublishers.map(pub => (
              <ContactCard
                key={pub}
                title="Publisher Contact"
                company={pub}
                role="Publishing A&R / Catalog Manager"
                icon={<Globe className="w-4 h-4 text-primary" />}
                artistName={artist}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

ContactsPanel.displayName = "ContactsPanel";
