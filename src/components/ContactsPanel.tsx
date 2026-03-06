import { memo, useMemo } from "react";
import { User, Building2, ExternalLink, Search, Mail, Linkedin, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Credit } from "./CreditsSection";

interface ContactsPanelProps {
  artist: string;
  credits: Credit[];
  recordLabel?: string;
}

function buildManagerSearchUrl(artist: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`"${artist}" manager OR "A&R" contact site:linkedin.com OR site:imdbpro.com OR site:allmusic.com`)}`;
}

function buildContactSearchUrl(name: string, company: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`"${name}" "${company}" A&R manager contact email`)}`;
}

function buildPublisherAdminSearchUrl(publisher: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`"${publisher}" publishing A&R catalog manager contact`)}`;
}

function buildLabelARSearchUrl(label: string, artist: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`"${label}" A&R "${artist}" contact site:linkedin.com OR site:allmusic.com`)}`;
}

interface ContactCardProps {
  title: string;
  name?: string;
  company?: string;
  role?: string;
  searchUrl: string;
  icon: React.ReactNode;
}

const ContactCard = ({ title, name, company, role, searchUrl, icon }: ContactCardProps) => (
  <div className="glass rounded-xl p-4 space-y-2">
    <div className="flex items-center gap-2">
      {icon}
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
    </div>
    {name ? (
      <div className="space-y-1">
        <p className="text-sm text-foreground font-medium">{name}</p>
        {company && <p className="text-xs text-muted-foreground">{company}</p>}
        {role && <p className="text-xs text-primary">{role}</p>}
        <Badge variant="outline" className="text-[10px] bg-muted/50">Public data</Badge>
      </div>
    ) : (
      <p className="text-xs text-muted-foreground italic">No public contact found</p>
    )}
    <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 h-7" asChild>
      <a href={searchUrl} target="_blank" rel="noopener noreferrer">
        <Search className="w-3 h-3" /> Search Google
      </a>
    </Button>
  </div>
);

export const ContactsPanel = memo(({ artist, credits, recordLabel }: ContactsPanelProps) => {
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
      <div className="border-l-4 border-primary pl-4">
        <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          Contacts — Manager & A&R
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Find the artist's manager, label A&R, or publisher contact
        </p>
      </div>

      {/* Primary CTA */}
      <Button variant="default" size="sm" className="gap-2" asChild>
        <a href={buildManagerSearchUrl(artist)} target="_blank" rel="noopener noreferrer">
          <Linkedin className="w-4 h-4" /> Find Artist Manager / A&R Contact
        </a>
      </Button>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <ContactCard
          title="Artist Manager"
          name={management || undefined}
          company={management ? "Management" : undefined}
          searchUrl={buildManagerSearchUrl(artist)}
          icon={<User className="w-4 h-4 text-primary" />}
        />

        {recordLabel && (
          <ContactCard
            title="Label A&R"
            company={recordLabel}
            role="A&R Representative"
            searchUrl={buildLabelARSearchUrl(recordLabel, artist)}
            icon={<Building2 className="w-4 h-4 text-primary" />}
          />
        )}

        {topPublishers.map(pub => (
          <ContactCard
            key={pub}
            title="Publisher Contact"
            company={pub}
            role="Publishing A&R / Catalog Manager"
            searchUrl={buildPublisherAdminSearchUrl(pub)}
            icon={<Globe className="w-4 h-4 text-primary" />}
          />
        ))}
      </div>
    </div>
  );
});

ContactsPanel.displayName = "ContactsPanel";
