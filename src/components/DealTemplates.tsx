import { FileText, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface DealTemplatesProps {
  onApplyTemplate: (text: string) => void;
}

const TEMPLATES = [
  {
    name: "TV Sync",
    icon: "📺",
    text: `DEAL MEMO — TV SYNC LICENSE

Song: [SONG TITLE]
Artist: [ARTIST]
Publisher: [PUBLISHER]
Usage: Background/Featured in [SHOW NAME], Season [X], Episode [X]
Territory: [WORLDWIDE / US ONLY]
Term: [IN PERPETUITY / 5 YEARS]
Fee: $[AMOUNT]
Media: Television, VOD, Streaming platforms

Notes:
- Master + Publishing clearance required
- MFN (Most Favored Nations) clause: [YES/NO]
- Pre-clear for trailers/promos: [YES/NO]`,
  },
  {
    name: "Film Sync",
    icon: "🎬",
    text: `DEAL MEMO — FILM SYNC LICENSE

Song: [SONG TITLE]
Artist: [ARTIST]
Publisher: [PUBLISHER]
Usage: Featured in [FILM TITLE] — [SCENE DESCRIPTION]
Territory: Worldwide
Term: In Perpetuity
Fee: $[AMOUNT]
Media: Theatrical, Home Video, VOD, Streaming, Airlines

Notes:
- Festival rights included: [YES/NO]
- Trailer usage: [SEPARATE FEE / INCLUDED]
- Credit: [END CREDITS / ON-SCREEN]`,
  },
  {
    name: "Ad Sync",
    icon: "📢",
    text: `DEAL MEMO — ADVERTISING SYNC LICENSE

Song: [SONG TITLE]
Artist: [ARTIST]
Publisher: [PUBLISHER]
Brand: [BRAND NAME]
Campaign: [CAMPAIGN NAME]
Territory: [TERRITORIES]
Term: [12 MONTHS / 6 MONTHS]
Fee: $[AMOUNT]
Media: TV, Digital, Social, Radio

Notes:
- Exclusivity: [CATEGORY EXCLUSIVE / NON-EXCLUSIVE]
- Option to extend: [YES, at $X for additional Y months]
- Social media cutdowns: [INCLUDED / SEPARATE]`,
  },
  {
    name: "Video Game",
    icon: "🎮",
    text: `DEAL MEMO — VIDEO GAME SYNC LICENSE

Song: [SONG TITLE]
Artist: [ARTIST]
Publisher: [PUBLISHER]
Game: [GAME TITLE]
Platform: [ALL / PC / CONSOLE / MOBILE]
Territory: Worldwide
Term: Life of Game
Fee: $[AMOUNT]
Usage: [IN-GAME SOUNDTRACK / TRAILER / MENU]

Notes:
- Sequel options: [YES/NO]
- Interactive/adaptive music: [YES/NO]
- DLC inclusion: [INCLUDED / SEPARATE]`,
  },
  {
    name: "Social Media",
    icon: "📱",
    text: `DEAL MEMO — SOCIAL MEDIA LICENSE

Song: [SONG TITLE]
Artist: [ARTIST]
Publisher: [PUBLISHER]
Platform: [TIKTOK / INSTAGRAM / YOUTUBE / ALL]
Brand: [BRAND NAME]
Territory: Worldwide
Term: [6 MONTHS / 1 YEAR]
Fee: $[AMOUNT]
Usage: [UGC / BRANDED CONTENT / INFLUENCER]

Notes:
- Number of posts: [UNLIMITED / X POSTS]
- Paid media boost: [INCLUDED / SEPARATE FEE]
- Creator usage: [YES/NO]`,
  },
];

export const DealTemplates = ({ onApplyTemplate }: DealTemplatesProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleSelect = (template: typeof TEMPLATES[0]) => {
    onApplyTemplate(template.text);
    setOpen(false);
    toast({ title: `${template.name} template applied`, description: "Edit the [PLACEHOLDERS] with your deal details." });
  };

  const handleCopy = (text: string, name: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${name} template copied!` });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" aria-label="Deal templates">
          <FileText className="w-3 h-3" /> Templates
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" /> Deal Memo Templates
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {TEMPLATES.map(t => (
            <div key={t.name} className="rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">
                  {t.icon} {t.name}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => handleCopy(t.text, t.name)} aria-label={`Copy ${t.name} template`}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="secondary" size="sm" className="h-7 text-xs" onClick={() => handleSelect(t)}>
                    Use
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 font-mono">{t.text.split("\n").slice(0, 2).join(" | ")}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
