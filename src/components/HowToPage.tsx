import { memo } from "react";
import {
  Search, Music, Users, FileText, BarChart3, Mail, Kanban, Eye, SlidersHorizontal, Clock,
  ArrowLeft, Pen, SlidersVertical, Mic, Radio, ListMusic, ChevronRight, Brain, Shield,
  Lightbulb, Target, DollarSign, GitCompareArrows, Youtube, TrendingUp
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
    <div className="pl-4 sm:pl-6 space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
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

const UseCaseCard = ({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) => (
  <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
    </div>
    <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
  </div>
);

export const HowToPage = memo(({ onClose }: HowToPageProps) => {
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in pb-8">
      {/* Header */}
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -ml-2" onClick={onClose}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">How to Use Publisting</h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Publisting helps you quickly see who wrote and produced a song, whether they're signed to publishers and labels,
          and how the track is performing across charts, playlists, and radio. It's built for A&R and publishing teams who want
          to scout writers and producers more efficiently.
        </p>
      </div>

      {/* Use Cases */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Target className="w-4.5 h-4.5 text-primary" /> What Can You Do?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <UseCaseCard
            icon={Search}
            title="Find Unsigned Talent"
            description="Search any hit song to see which writers and producers are unsigned. Filter by 'Unsigned' to instantly spot signing opportunities."
          />
          <UseCaseCard
            icon={DollarSign}
            title="Research Publishing Deals"
            description="See who owns the publishing rights, check split percentages, and compare similar catalogs to estimate deal value."
          />
          <UseCaseCard
            icon={BarChart3}
            title="Value Catalogs"
            description="Use Catalog Analysis to estimate a writer's catalog value based on streaming revenue, chart performance, and market multiples."
          />
        </div>
      </div>

      {/* 1. Searching */}
      <Section icon={Search} title="Searching for a Song">
        <p>Use the main search bar at the top of the center column. You can:</p>
        <ul className="space-y-1.5">
          <Bullet>Paste a <span className="text-foreground font-medium">Spotify or Apple Music link</span> for the most accurate results.</Bullet>
          <Bullet>Type a <span className="text-foreground font-medium">song title and artist</span> (e.g., "Snooze SZA").</Bullet>
          <Bullet>Paste an <span className="text-foreground font-medium">album or playlist link</span> to browse all tracks.</Bullet>
        </ul>
        <Tip>Try searching "Espresso by Sabrina Carpenter" — it's a great example with clear credits and chart data.</Tip>
      </Section>

      {/* 2. Song Detail */}
      <Section icon={Music} title="Understanding the Song Detail View">
        <p>When a song is loaded, you'll see a header with cover art, title, artist, and signing status. Below, five tabs organize all information:</p>
        <div className="flex flex-wrap gap-1.5 my-1">
          <Badge variant="secondary" className="text-[11px]">Summary</Badge>
          <Badge variant="secondary" className="text-[11px]">Full Credits</Badge>
          <Badge variant="secondary" className="text-[11px]">Exposure</Badge>
          <Badge variant="secondary" className="text-[11px]">Contacts</Badge>
          <Badge variant="secondary" className="text-[11px]">Pipeline</Badge>
        </div>
      </Section>

      {/* 3. Credits */}
      <Section icon={Users} title="Full Credits — Who Wrote & Produced It">
        <p>See every credited person with their role, publisher, PRO affiliation, IPI number, and signing status. Use this to:</p>
        <ul className="space-y-1.5">
          <Bullet>Identify <span className="text-foreground font-medium">unsigned writers</span> — potential signing targets.</Bullet>
          <Bullet>See <span className="text-foreground font-medium">publishing splits</span> — who owns what percentage.</Bullet>
          <Bullet>Check <span className="text-foreground font-medium">PRO registration</span> (ASCAP, BMI, SESAC, GMR).</Bullet>
        </ul>
        <Tip>Click any IPI number to copy it — useful for PRO database cross-referencing.</Tip>
      </Section>

      {/* 4. Exposure */}
      <Section icon={ListMusic} title="Exposure — Charts, Playlists & Radio">
        <p>Three modules show how the song is performing commercially:</p>
        <ul className="space-y-1.5">
          <Bullet><span className="text-foreground font-medium">Charts</span> — Billboard, Spotify, Apple, Shazam positions with trend sparklines.</Bullet>
          <Bullet><span className="text-foreground font-medium">Playlists</span> — editorial/curated playlist appearances with follower counts.</Bullet>
          <Bullet><span className="text-foreground font-medium">Radio</span> — station airplay data with spin counts across markets.</Bullet>
        </ul>
      </Section>

      {/* 5. Contacts */}
      <Section icon={Mail} title="Contacts — Find Decision Makers">
        <p>Contact intelligence for managers, A&R reps, and publisher contacts with email discovery and outreach tracking.</p>
      </Section>

      {/* 6. Watchlist & Pipeline */}
      <Section icon={Kanban} title="Watchlist & Pipeline — Track Your Targets">
        <p>Add any writer/producer to your watchlist from the credits tab. The pipeline uses five stages:</p>
        <div className="flex flex-wrap gap-1.5 my-1">
          <Badge variant="outline" className="text-[10px]">Not contacted</Badge>
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Reached out</Badge>
          <Badge variant="outline" className="text-[10px] border-yellow-500/40 text-yellow-500">In talks</Badge>
          <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-500">Signed</Badge>
          <Badge variant="outline" className="text-[10px] border-red-500/40 text-red-500">Passed</Badge>
        </div>
      </Section>

      {/* 7. Advanced Features — simplified explanations */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2 border-l-[3px] border-primary pl-3">
          <Lightbulb className="w-4.5 h-4.5 text-primary" /> Advanced Features Explained Simply
        </h2>

        <div className="pl-4 sm:pl-6 space-y-4">
          <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">AI Recommendations</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Publisting learns from your search history and watchlist to suggest songs with <span className="text-foreground font-medium">unsigned talent</span> that match your taste. 
              The more you search and save, the smarter the recommendations become. Think of it like Spotify's "Discover Weekly" but for finding unsigned writers and producers.
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Data Conflict Resolution</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When different sources disagree (e.g., ASCAP says one publisher but MLC says another), Publisting flags the conflict and shows you both versions with confidence scores. 
              You can review and choose which value is correct, ensuring your deal research is based on <span className="text-foreground font-medium">verified data</span>.
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Catalog Valuation</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Estimates what a songwriter's catalog is worth by analyzing their streaming revenue, applying industry-standard multiples (typically 10–30x annual revenue), 
              and comparing to recent catalog sales. Includes <span className="text-foreground font-medium">best/worst/likely scenarios</span> so you can set realistic offer ranges.
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Youtube className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">YouTube Content ID</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Shows how many YouTube videos use a song, total views across all uses, and estimated sync revenue. 
              Viral YouTube usage is a strong <span className="text-foreground font-medium">breakout signal</span> for A&R scouting.
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Sync Score (0–100)</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A composite score measuring how "deal-ready" a song is for sync licensing. Higher scores mean fewer rights holders, clearer ownership, 
              and stronger commercial performance — making the song <span className="text-foreground font-medium">easier and faster to clear</span>.
            </p>
          </div>
        </div>
      </div>

      {/* 8. Filters */}
      <Section icon={SlidersHorizontal} title="Filters & Shortcuts">
        <ul className="space-y-1.5">
          <Bullet>Filter credits by publishing status, label status, roles, and exposure levels.</Bullet>
          <Bullet>Press <kbd className="px-1 py-0.5 rounded border border-border text-[10px] font-mono">/</kbd> to focus search, <kbd className="px-1 py-0.5 rounded border border-border text-[10px] font-mono">⌘K</kbd> for command palette.</Bullet>
          <Bullet>Filters are <span className="text-foreground font-medium">remembered per account</span> across sessions.</Bullet>
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
