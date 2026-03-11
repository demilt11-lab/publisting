import { memo } from "react";
import {
  Search, Music, Users, FileText, BarChart3, Mail, Kanban, Eye, SlidersHorizontal, Clock,
  ArrowLeft, Pen, SlidersVertical, Mic, Radio, ListMusic, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HowToPageProps {
  onClose: () => void;
}

const Section = ({
  icon: Icon, title, children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="space-y-3">
    <h2 className="flex items-center gap-2.5 text-base font-semibold text-foreground border-l-[3px] border-primary pl-3">
      <Icon className="w-4.5 h-4.5 text-primary shrink-0" />
      {title}
    </h2>
    <div className="pl-6 space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
  </section>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2">
    <ChevronRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
    <span>{children}</span>
  </li>
);

const Tip = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm flex gap-2">
    <span className="text-primary font-bold shrink-0">💡</span>
    <span className="text-foreground/80">{children}</span>
  </div>
);

export const HowToPage = memo(({ onClose }: HowToPageProps) => {
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -ml-2" onClick={onClose}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
        <h1 className="text-2xl font-bold text-foreground">How to Use Music Deal Finder</h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Music Deal Finder helps you quickly see who wrote and produced a song, whether they're signed to publishers and labels,
          and how the track is performing across charts, playlists, and radio. It's built for A&R and publishing teams who want
          to scout writers and producers more efficiently.
        </p>
      </div>

      {/* 1. Searching */}
      <Section icon={Search} title="Searching for a Song">
        <p>Use the main search bar at the top of the center column. You can:</p>
        <ul className="space-y-1.5">
          <Bullet>Paste a <span className="text-foreground font-medium">Spotify or Apple Music link</span> for the most accurate results.</Bullet>
          <Bullet>Type a <span className="text-foreground font-medium">song title and artist</span> (e.g., "Snooze SZA").</Bullet>
        </ul>
        <p>After searching, the Song Detail view opens in the center panel with all credits and data organized into tabs.</p>
        <Tip>Paste full streaming links for best accuracy. If you can't find a song, try combining the artist name and title together.</Tip>
      </Section>

      {/* 2. Song Detail view */}
      <Section icon={Music} title="Understanding the Song Detail View">
        <p>When a song is loaded, you'll see a consistent header showing:</p>
        <ul className="space-y-1.5">
          <Bullet><span className="text-foreground font-medium">Cover art</span> — album artwork from the streaming platform.</Bullet>
          <Bullet><span className="text-foreground font-medium">Song title</span> (large, bold) and <span className="text-foreground font-medium">artist name</span> below it.</Bullet>
          <Bullet><span className="text-foreground font-medium">Signing status chips</span> — a quick overview of how many writers are signed vs unsigned.</Bullet>
        </ul>
        <p>Below the header, five tabs organize all information: <Badge variant="secondary" className="text-[11px]">Summary</Badge> <Badge variant="secondary" className="text-[11px]">Full Credits</Badge> <Badge variant="secondary" className="text-[11px]">Exposure</Badge> <Badge variant="secondary" className="text-[11px]">Contacts</Badge> <Badge variant="secondary" className="text-[11px]">Watchlist / Pipeline</Badge></p>
      </Section>

      {/* 3. Summary */}
      <Section icon={BarChart3} title="Summary Tab — Quick Overview">
        <p>A dashboard view with two main cards:</p>
        <ul className="space-y-1.5">
          <Bullet><span className="text-foreground font-medium">Key People</span> — lists writers, producers, and artists with their signing status chips (Pub: Signed/Unsigned/Unknown, Label: Signed/Unsigned/Unknown). Scan this to instantly see who's available.</Bullet>
          <Bullet><span className="text-foreground font-medium">Exposure Snapshot</span> — high-level metrics like best chart position, total editorial playlists, and radio markets, with small sparklines showing trends.</Bullet>
        </ul>
        <Tip>Use this tab to get a fast sense of who is involved and whether the song is already moving.</Tip>
      </Section>

      {/* 4. Full Credits */}
      <Section icon={Users} title="Full Credits Tab — Detailed Roles, Splits & Links">
        <p>A full-width table showing everyone credited on the track:</p>
        <ul className="space-y-1.5">
          <Bullet><span className="text-foreground font-medium">Name</span> and <span className="text-foreground font-medium">Role(s)</span> — writer <Pen className="w-3 h-3 inline text-muted-foreground" />, producer <SlidersVertical className="w-3 h-3 inline text-muted-foreground" />, artist <Mic className="w-3 h-3 inline text-muted-foreground" />.</Bullet>
          <Bullet><span className="text-foreground font-medium">Signing Status</span> — chips showing Pub: Signed/Unsigned and Label: Signed/Unsigned.</Bullet>
          <Bullet><span className="text-foreground font-medium">Publisher, Label, PRO</span> — the companies and organizations associated with each person.</Bullet>
          <Bullet><span className="text-foreground font-medium">Splits</span> — publishing ownership percentages where available.</Bullet>
          <Bullet><span className="text-foreground font-medium">Actions</span> — links to Genius credits, streaming profiles, and social accounts.</Bullet>
        </ul>
        <p>This is also where you can click <span className="text-foreground font-medium">"Add to watchlist"</span> for any person. It's the best place to compare writers on the same song and see who is signed vs unsigned.</p>
      </Section>

      {/* 5. Exposure */}
      <Section icon={ListMusic} title="Exposure Tab — Charts, Playlists & Radio">
        <p>Three analytics modules showing how the song is performing:</p>
        <ul className="space-y-1.5">
          <Bullet><span className="text-foreground font-medium">Charts</span> — which charts (Billboard, Spotify, Apple) the song appears on, peak position, weeks on chart, and a trend sparkline.</Bullet>
          <Bullet><span className="text-foreground font-medium">Playlists</span> — major editorial and curated DSP playlists, with follower counts and dates added.</Bullet>
          <Bullet><span className="text-foreground font-medium">Radio</span> — stations and regions with airplay data: first spin, latest spin, and total spins.</Bullet>
        </ul>
        <Tip>Use this to identify songs (and writers) with real momentum — chart activity and playlist placement signal commercial viability.</Tip>
      </Section>

      {/* 6. Contacts */}
      <Section icon={Mail} title="Contacts Tab — Managers, A&Rs & Outreach">
        <p>A mini-CRM for managing outreach:</p>
        <ul className="space-y-1.5">
          <Bullet><span className="text-foreground font-medium">Key Contacts</span> — cards for managers, A&R reps, publisher contacts, and label contacts with email, social links, and quick actions like "Copy email".</Bullet>
          <Bullet><span className="text-foreground font-medium">Interaction History</span> — log of past or planned outreach: date, channel (email/call/DM), notes, and status.</Bullet>
        </ul>
        <p>Pipeline statuses (<Badge variant="outline" className="text-[10px]">Not contacted</Badge> <Badge variant="outline" className="text-[10px]">Reached out</Badge> <Badge variant="outline" className="text-[10px]">In talks</Badge> <Badge variant="outline" className="text-[10px]">Signed</Badge> <Badge variant="outline" className="text-[10px]">Passed</Badge>) are reused here to track each relationship.</p>
      </Section>

      {/* 7. Pipeline */}
      <Section icon={Kanban} title="Watchlist & Pipeline Tab — Tracking Talent">
        <p>A Kanban board with five columns representing pipeline stages:</p>
        <div className="flex flex-wrap gap-1.5 my-1">
          <Badge variant="outline" className="text-[10px] border-muted-foreground/30">Not contacted</Badge>
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Reached out</Badge>
          <Badge variant="outline" className="text-[10px] border-yellow-500/40 text-yellow-500">In talks</Badge>
          <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-500">Signed</Badge>
          <Badge variant="outline" className="text-[10px] border-red-500/40 text-red-500">Passed</Badge>
        </div>
        <ul className="space-y-1.5">
          <Bullet>Add people from <span className="text-foreground font-medium">Full Credits</span> — they appear as cards showing name, role, signing status, a key song, and exposure stats.</Bullet>
          <Bullet><span className="text-foreground font-medium">Drag and drop</span> cards between columns to update their pipeline stage.</Bullet>
        </ul>
      </Section>

      {/* 8. Watchlist drawer */}
      <Section icon={Eye} title="Watchlist Drawer — Quick Access">
        <p>A slide-in panel on the right side of the screen, toggled via the floating <Eye className="w-3.5 h-3.5 inline text-primary" /> button in the bottom-right corner.</p>
        <ul className="space-y-1.5">
          <Bullet>Shows a simplified list of your watchlist entries — see new additions instantly without leaving the current song.</Bullet>
          <Bullet>When you add someone from any tab, they appear with a brief highlight so you know it worked.</Bullet>
          <Bullet>The drawer is for quick reference; the Pipeline tab is for full Kanban management.</Bullet>
        </ul>
      </Section>

      {/* 9. Filters */}
      <Section icon={SlidersHorizontal} title="Filters & Signing Status">
        <ul className="space-y-1.5">
          <Bullet>Filter credits by publishing status, label status, roles, and exposure levels.</Bullet>
          <Bullet>The app stays <span className="text-foreground font-medium">neutral</span> — it shows signed vs unsigned and lets you decide how to filter.</Bullet>
          <Bullet>Filters are <span className="text-foreground font-medium">remembered per account</span> so your preferred view persists across sessions.</Bullet>
          <Bullet>Use the <span className="text-foreground font-medium">Reset</span> button to return all filters to "All."</Bullet>
        </ul>
      </Section>

      {/* 10. History */}
      <Section icon={Clock} title="History — Songs You've Checked">
        <ul className="space-y-1.5">
          <Bullet>Access from the <span className="text-foreground font-medium">History</span> item in the left sidebar.</Bullet>
          <Bullet>Shows all songs you've previously looked up, with signing status and date.</Bullet>
          <Bullet>Click any entry to reopen the song and resume scouting instantly.</Bullet>
        </ul>
      </Section>

      {/* Footer */}
      <div className="border-t border-border/50 pt-6 pb-4 text-center">
        <p className="text-xs text-muted-foreground">
          Questions or feedback? Reach out to the team or check back — we're always adding new data sources and features.
        </p>
      </div>
    </div>
  );
});

HowToPage.displayName = "HowToPage";
