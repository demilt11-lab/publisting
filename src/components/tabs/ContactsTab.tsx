import { memo, useMemo } from "react";
import { User, Building2, Instagram, Globe, Linkedin, Info, ExternalLink, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Credit } from "@/components/CreditsSection";
import { getInstagramCompanyUrl, getLinkedInCompanyUrl } from "@/lib/externalLinks";

interface ContactsTabProps {
  artist: string;
  songTitle: string;
  credits: Credit[];
  recordLabel?: string;
}

/** Get the best verified social links from artist credits */
function getArtistSocialLinks(credits: Credit[], artist: string): Record<string, string> {
  const artistCredit = credits.find(
    c => c.role === "artist" && c.socialLinks && Object.keys(c.socialLinks).length > 0
  );
  if (artistCredit?.socialLinks) return artistCredit.socialLinks;

  const anyCreditWithSocial = credits.find(c => c.socialLinks && Object.keys(c.socialLinks).length > 0);
  return anyCreditWithSocial?.socialLinks || {};
}

type SocialPlatform = {
  key: string;
  label: string;
  icon: typeof Instagram;
  getUrl: (name: string) => string;
};

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    key: "instagram",
    label: "Instagram",
    icon: Instagram,
    getUrl: (name) => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(name)}`,
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    icon: Globe,
    getUrl: (name) => `https://x.com/search?q=${encodeURIComponent(name)}&src=typed_query&f=user`,
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: Globe,
    getUrl: (name) => `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}&sp=EgIQAg%253D%253D`,
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: Globe,
    getUrl: (name) => `https://www.tiktok.com/search/user?q=${encodeURIComponent(name)}`,
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: Globe,
    getUrl: (name) => `https://www.facebook.com/search/people/?q=${encodeURIComponent(name)}`,
  },
];

export const ContactsTab = memo(({ artist, songTitle, credits, recordLabel }: ContactsTabProps) => {
  const management = useMemo(() => {
    return credits.find(c => c.role === "artist" && c.management)?.management || null;
  }, [credits]);

  const topPublishers = useMemo(() => {
    const pubs = new Set<string>();
    credits.forEach(c => { if (c.publisher) pubs.add(c.publisher); });
    return [...pubs].slice(0, 3);
  }, [credits]);

  const artistSocial = useMemo(() => getArtistSocialLinks(credits, artist), [credits, artist]);

  const socialButtons = useMemo(() => {
    return SOCIAL_PLATFORMS.map(platform => {
      const verifiedUrl = artistSocial[platform.key] || (platform.key === "twitter" ? artistSocial["x"] : undefined);
      return {
        ...platform,
        url: verifiedUrl || platform.getUrl(artist),
        verified: !!verifiedUrl,
      };
    });
  }, [artistSocial, artist]);

  // Only build cards that have actual data
  const contactCards = useMemo(() => {
    const cards: { title: string; name?: string; company?: string; role?: string; type: "person" | "company" }[] = [];
    if (management) {
      cards.push({ title: "Artist Manager", name: management, company: "Management", type: "person" });
    }
    if (recordLabel) {
      cards.push({ title: "Label A&R", company: recordLabel, role: "A&R Representative", type: "company" });
    }
    topPublishers.forEach(pub => cards.push({ title: "Publisher Contact", company: pub, role: "Publishing A&R", type: "company" }));
    return cards;
  }, [management, recordLabel, topPublishers]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Artist Social Media — Direct Links */}
      <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Artist Social Media</h3>
          {Object.keys(artistSocial).length > 0 && (
            <Badge variant="outline" className="text-[9px] bg-success/10 text-success border-success/30">
              <Check className="w-2.5 h-2.5 mr-0.5" /> Verified links found
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {socialButtons.map(btn => (
            <Button key={btn.key} variant="outline" size="sm" className="text-[11px] gap-1.5 h-8" asChild>
              <a href={btn.url} target="_blank" rel="noopener noreferrer">
                <btn.icon className="w-3.5 h-3.5" />
                {btn.label}
                {btn.verified ? (
                  <Check className="w-3 h-3 text-success" />
                ) : (
                  <span className="text-[9px] text-muted-foreground">(search)</span>
                )}
              </a>
            </Button>
          ))}
          {artistSocial.website && (
            <Button variant="outline" size="sm" className="text-[11px] gap-1.5 h-8" asChild>
              <a href={artistSocial.website} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5" />
                Official Site
                <Check className="w-3 h-3 text-success" />
              </a>
            </Button>
          )}
          {artistSocial.soundcloud && (
            <Button variant="outline" size="sm" className="text-[11px] gap-1.5 h-8" asChild>
              <a href={artistSocial.soundcloud} target="_blank" rel="noopener noreferrer">
                <Globe className="w-3.5 h-3.5" />
                SoundCloud
                <Check className="w-3 h-3 text-success" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Key Contacts Cards — only show if there are contacts with data */}
      {contactCards.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Key Contacts</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-[260px]">Contact data is derived from track credits, label metadata, and public profiles.</TooltipContent>
            </Tooltip>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contactCards.map((card, i) => {
              // For all contact cards, LinkedIn goes to the company page
              const companyForLinkedIn = card.company && card.company !== "Management" ? card.company : recordLabel;
              const linkedInUrl = companyForLinkedIn
                ? getLinkedInCompanyUrl(companyForLinkedIn)
                : `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(artist + ' music')}`;

              return (
                <div key={i} className="rounded-lg border border-border/50 bg-secondary/30 p-4 space-y-3 hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-2">
                    {card.type === "person" ? <User className="w-4 h-4 text-primary" /> : <Building2 className="w-4 h-4 text-primary" />}
                    <span className="text-xs font-semibold text-foreground">{card.title}</span>
                  </div>
                  {card.name ? (
                    <p className="text-sm font-medium text-foreground">{card.name}</p>
                  ) : card.company ? (
                    <p className="text-sm font-medium text-foreground">{card.company}</p>
                  ) : null}
                  {card.role && <Badge variant="outline" className="text-[10px]">{card.role}</Badge>}
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm" className="text-[10px] gap-1 h-7 flex-1" asChild>
                      <a href={linkedInUrl} target="_blank" rel="noopener noreferrer">
                        <Linkedin className="w-3 h-3" /> LinkedIn
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" className="text-[10px] gap-1 h-7 flex-1" asChild>
                      <a href={`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(card.name || card.company || artist)}`} target="_blank" rel="noopener noreferrer">
                        <Instagram className="w-3 h-3" /> Instagram
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

ContactsTab.displayName = "ContactsTab";
