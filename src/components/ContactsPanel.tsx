import { memo, useMemo, useState } from "react";
import { User, Building2, Search, Linkedin, Globe, Instagram, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Credit } from "./CreditsSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getLinkedInCompanyUrl } from "@/lib/externalLinks";

interface ContactsPanelProps {
  artist: string;
  credits: Credit[];
  recordLabel?: string;
}

function buildInstagramSearchUrl(name: string): string {
  return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(name)}`;
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
  recordLabel?: string;
}

const ContactCard = ({ title, name, company, role, icon, artistName, recordLabel }: ContactCardProps) => {
  const displayName = name || artistName;

  // LinkedIn always goes to the company page
  const companyForLinkedIn = company && company !== "Management" ? company : recordLabel;
  const linkedInUrl = companyForLinkedIn
    ? getLinkedInCompanyUrl(companyForLinkedIn)
    : `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(artistName + ' music')}`;

  const instagramUrl = buildInstagramUrl(displayName);
  const companyLinkedIn = company && company !== "Management" ? getLinkedInCompanyUrl(company) : null;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      {name ? (
        <div className="space-y-1">
          <p className="text-sm text-foreground font-medium">{name}</p>
          {company && company !== "Management" && (
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

  // LinkedIn for the primary label
  const labelLinkedInUrl = recordLabel
    ? getLinkedInCompanyUrl(recordLabel)
    : `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(artist + ' music')}`;

  return (
    <div className="space-y-4 animate-fade-up">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between border-l-4 border-primary pl-4 pr-2 py-1 hover:bg-accent/30 rounded-r-lg transition-colors">
            <div className="text-left">
              <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
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
          {/* Primary CTA - goes directly to company LinkedIn */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="default" size="sm" className="gap-2" asChild>
              <a href={labelLinkedInUrl} target="_blank" rel="noopener noreferrer">
                <Linkedin className="w-4 h-4" /> {recordLabel || artist} on LinkedIn
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
              recordLabel={recordLabel}
            />

            {recordLabel && (
              <ContactCard
                title="Label A&R"
                company={recordLabel}
                role="A&R Representative"
                icon={<Building2 className="w-4 h-4 text-primary" />}
                artistName={artist}
                recordLabel={recordLabel}
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
                recordLabel={recordLabel}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

ContactsPanel.displayName = "ContactsPanel";
