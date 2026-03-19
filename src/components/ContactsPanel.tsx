import { memo, useMemo, useState } from "react";
import { User, Building2, Search, Linkedin, Globe, Instagram, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Credit } from "./CreditsSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getCompanySocialProfiles } from "@/lib/externalLinks";

interface ContactsPanelProps {
  artist: string;
  credits: Credit[];
  recordLabel?: string;
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
  const companyName = company && company !== "Management" ? company : null;
  const companyProfiles = companyName ? getCompanySocialProfiles(companyName) : [];

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      {name ? (
        <div className="space-y-1">
          <p className="text-sm text-foreground font-medium">{name}</p>
          {role && <p className="text-xs text-primary">{role}</p>}
          <Badge variant="outline" className="text-[10px] bg-muted/50">Public data</Badge>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No public contact found</p>
      )}

      {companyProfiles.length > 0 && (
        <div className="space-y-2">
          {companyProfiles.map((profile) => (
            <div key={`${title}-${profile.name}`} className="space-y-1.5">
              {companyProfiles.length > 1 && (
                <p className="text-[10px] text-muted-foreground">{profile.name}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {profile.linkedinUrl && (
                  <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7" asChild>
                    <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer">
                      <Linkedin className="w-3 h-3" /> LinkedIn
                    </a>
                  </Button>
                )}
                {profile.instagramUrl && (
                  <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7" asChild>
                    <a href={profile.instagramUrl} target="_blank" rel="noopener noreferrer">
                      <Instagram className="w-3 h-3" /> Instagram
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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

  const labelProfiles = useMemo(() => recordLabel ? getCompanySocialProfiles(recordLabel) : [], [recordLabel]);

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
          {labelProfiles.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {labelProfiles.map((profile) => (
                <div key={`label-profile-${profile.name}`} className="flex flex-wrap gap-2">
                  {profile.linkedinUrl && (
                    <Button variant="default" size="sm" className="gap-2" asChild>
                      <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer">
                        <Linkedin className="w-4 h-4" /> {profile.name} on LinkedIn
                      </a>
                    </Button>
                  )}
                  {profile.instagramUrl && (
                    <Button variant="outline" size="sm" className="gap-2" asChild>
                      <a href={profile.instagramUrl} target="_blank" rel="noopener noreferrer">
                        <Instagram className="w-4 h-4" /> {profile.name} on Instagram
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

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
