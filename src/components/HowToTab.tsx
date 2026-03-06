import { useState, useRef, useEffect, useMemo } from "react";
import {
  HelpCircle, Search, Music, BarChart3, FileText, Keyboard, Database, BookOpen,
  ChevronRight, Star, Users, Heart, Clock, Layers, ArrowRightLeft, Upload,
  Copy, TrendingUp, Shield, DollarSign, X, ExternalLink
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useIsMobile } from "@/hooks/use-mobile";

const sections = [
  { id: "getting-started", label: "Getting Started", icon: Star },
  { id: "song-card", label: "Song Card", icon: Music },
  { id: "credits", label: "Understanding Credits", icon: Users },
  { id: "publishing", label: "Understanding Publishing", icon: FileText },
  { id: "catalog-score", label: "Catalog Score", icon: BarChart3 },
  { id: "features", label: "Features Guide", icon: Layers },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
  { id: "data-sources", label: "Data Sources", icon: Database },
  { id: "glossary", label: "Glossary A–Z", icon: BookOpen },
];

const Tip = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground flex gap-2 my-3">
    <span className="text-primary font-bold shrink-0">💡</span>
    <span>{children}</span>
  </div>
);

const Warn = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-foreground flex gap-2 my-3">
    <span className="font-bold shrink-0">⚠️</span>
    <span>{children}</span>
  </div>
);

const Def = ({ term, children }: { term: string; children: React.ReactNode }) => (
  <div className="py-2">
    <span className="font-semibold text-primary">{term}</span>
    <span className="text-muted-foreground"> — {children}</span>
  </div>
);

const SectionHeading = ({ id, icon: Icon, children }: { id: string; icon: React.ElementType; children: React.ReactNode }) => (
  <h3 id={id} className="scroll-mt-20 text-xl font-bold text-foreground flex items-center gap-2 border-l-4 border-primary pl-3 mt-8 mb-4">
    <Icon className="w-5 h-5 text-primary shrink-0" />
    {children}
  </h3>
);

const SubHeading = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-base font-semibold text-foreground mt-5 mb-2">{children}</h4>
);

const shortcuts = [
  { keys: "/", action: "Focus search bar" },
  { keys: "Esc", action: "Clear / close panels" },
  { keys: "⌘K", action: "Open command palette" },
  { keys: "⌘Enter", action: "Execute search" },
  { keys: "?", action: "Toggle keyboard shortcuts panel" },
  { keys: "H", action: "Toggle History panel" },
  { keys: "F", action: "Toggle Favorites" },
  { keys: "D", action: "Toggle dark/light theme" },
];

const glossary: { term: string; def: string }[] = [
  { term: "A&R", def: "Artists & Repertoire — the division of a label or publisher responsible for scouting talent and songs." },
  { term: "ASCAP", def: "American Society of Composers, Authors and Publishers — a US PRO." },
  { term: "Blanket License", def: "A license granting the right to use any work in a catalog for a set fee." },
  { term: "BMI", def: "Broadcast Music, Inc. — a US PRO." },
  { term: "Clearance", def: "The process of obtaining permission to use a copyrighted work." },
  { term: "Co-Publishing", def: "A deal where the songwriter retains a share of the publishing copyright." },
  { term: "Composition", def: "The underlying musical work — melody and lyrics — as distinct from the sound recording." },
  { term: "Copyright", def: "Legal protection granting exclusive rights to the creator of an original work." },
  { term: "Cover Song", def: "A new recording of a previously released song by a different artist." },
  { term: "Digital Distribution", def: "Delivering music to streaming platforms and download stores." },
  { term: "IPI", def: "Interested Parties Information — a unique identifier for songwriters and publishers." },
  { term: "ISRC", def: "International Standard Recording Code — a unique identifier for a specific sound recording." },
  { term: "Label", def: "A company that releases and markets sound recordings (master rights)." },
  { term: "Master Rights", def: "Rights to the specific sound recording, typically held by the label or artist." },
  { term: "MLC", def: "Mechanical Licensing Collective — US org licensing and paying mechanical royalties for digital streaming." },
  { term: "Mechanical License", def: "Permission to reproduce a composition in a recording (stream, download, CD)." },
  { term: "Performing Rights", def: "Royalties collected when a composition is publicly performed or broadcast." },
  { term: "PRO", def: "Performing Rights Organization — collects and distributes performance royalties (ASCAP, BMI, SESAC, etc.)." },
  { term: "Publisher", def: "A company or individual that owns or administers the copyright in a musical composition." },
  { term: "Royalty", def: "Payment made to the rights holder each time their work is used." },
  { term: "SESAC", def: "A US PRO (originally Society of European Stage Authors and Composers)." },
  { term: "Split Sheet", def: "A document specifying each contributor's ownership percentage of a song." },
  { term: "Sub-Publishing", def: "Licensing a composition's rights to a publisher in another territory." },
  { term: "Sync License", def: "Permission to pair a composition with visual media (film, TV, ads, games)." },
  { term: "Sync Score", def: "PubCheck's proprietary 0-100 score indicating how easy a song is to license for sync." },
  { term: "Work Registration", def: "The act of registering a composition with a PRO to collect royalties." },
];

export const HowToTab = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("getting-started");
  const contentRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const filteredGlossary = useMemo(
    () => glossary.filter(g => !search || g.term.toLowerCase().includes(search.toLowerCase()) || g.def.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Intersection observer for TOC active state
  useEffect(() => {
    if (!open) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );
    const timeout = setTimeout(() => {
      sections.forEach(s => {
        const el = document.getElementById(s.id);
        if (el) observer.observe(el);
      });
    }, 300);
    return () => { clearTimeout(timeout); observer.disconnect(); };
  }, [open]);

  const contentBlock = (
    <div ref={contentRef}>
      {/* SECTION 1 */}
      <SectionHeading id="getting-started" icon={Star}>Getting Started</SectionHeading>
      <SubHeading>What is PubCheck?</SubHeading>
      <p className="text-muted-foreground text-sm leading-relaxed">
        PubCheck is a deep song credits & publishing intelligence tool built for A&R reps, catalog evaluators, managers, and music professionals.
        Paste any streaming link or type a song name to instantly see full writer/producer credits, publishing splits, label ownership, and catalog value.
      </p>

      <SubHeading>How to Search</SubHeading>
      <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1.5 ml-2">
        <li>Paste a <span className="text-foreground font-medium">streaming URL</span> (Spotify, Apple Music, Tidal, etc.) into the search bar</li>
        <li>OR type <span className="text-foreground font-medium">"Song Name Artist Name"</span> (e.g., "APT. ROSÉ Bruno Mars")</li>
        <li>Click <span className="text-foreground font-medium">Search</span> or press <kbd className="px-1 py-0.5 rounded border border-border text-[10px] font-mono">Enter</kbd></li>
        <li>View credits, publishers, sync score, and streaming stats</li>
      </ol>

      <SubHeading>Supported Platforms</SubHeading>
      <div className="flex flex-wrap gap-2 my-2">
        {["Spotify", "Apple Music", "Tidal", "Deezer", "YouTube Music", "Amazon Music", "MusicBrainz"].map(p => (
          <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
        ))}
      </div>
      <Tip>For best results, paste a direct streaming URL rather than typing the song name.</Tip>

      {/* SECTION 2 */}
      <SectionHeading id="song-card" icon={Music}>Understanding Search Results — Song Card</SectionHeading>
      <p className="text-muted-foreground text-sm mb-3">Every element on the Song Card explained:</p>
      <Def term="Song Title & Artist">The track name and performing artist(s).</Def>
      <Def term="Cover Art">Album artwork pulled from the streaming platform.</Def>
      <Def term="Record Label Badge">The label that released the recording (e.g., Atlantic, Universal). Note: label ≠ publisher.</Def>
      <Def term="Catalog Score Badge">Color-coded score (0–100) based on streaming, charts, publisher coverage, and deal complexity:</Def>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-2 ml-4">
        <div className="flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full bg-green-500" /> <span className="text-foreground font-medium">Excellent (75–100):</span> <span className="text-muted-foreground">Few rights holders, clear publisher</span></div>
        <div className="flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full bg-yellow-500" /> <span className="text-foreground font-medium">Good (50–74):</span> <span className="text-muted-foreground">Moderate complexity</span></div>
        <div className="flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full bg-orange-500" /> <span className="text-foreground font-medium">Fair (25–49):</span> <span className="text-muted-foreground">Multiple publishers</span></div>
        <div className="flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full bg-red-500" /> <span className="text-foreground font-medium">Complex (0–24):</span> <span className="text-muted-foreground">Many rights holders, difficult to clear</span></div>
      </div>
      <Def term="Credits Count Badge">Total number of credited individuals (songwriters + producers + artists).</Def>
      <Def term="MusicBrainz Badge">Indicates data was sourced from MusicBrainz open music database.</Def>
      <Def term="Release Date">Original release date of the track.</Def>
      <Def term="Streaming Stats">YouTube views, Genius views, Spotify streams (exact or estimated).</Def>
      <Def term="Chart Placements">Billboard, Spotify, Apple, Shazam chart positions.</Def>
      <Def term="+ Deal Button">Add this song to your deals pipeline.</Def>
      <Def term="Compare Button">Add to side-by-side comparison (up to 3 songs).</Def>
      <Def term="Copy All Button">Copy full publishing info to clipboard for deal memos.</Def>
      <Def term="Show Full Credits & Details">Expand to see all credits, publishing splits, and similar songs.</Def>

      {/* SECTION 3 */}
      <SectionHeading id="credits" icon={Users}>Understanding Credits</SectionHeading>
      <Def term="Songwriter / Writer">The person(s) who composed the music and/or wrote the lyrics. Songwriters own the composition copyright and collect publishing royalties.</Def>
      <Def term="Producer">The person who oversaw the recording and sound design. Producers may also hold publishing rights if they co-wrote the track.</Def>
      <Def term="Artist / Performer">The featured recording artist(s). They own the master recording, not necessarily the composition.</Def>
      <Def term="Arranger">A person who adapted or rearranged an existing composition.</Def>
      <Def term="Featured Artist">A credited guest performer on the track.</Def>
      <Def term="IPI Number">Interested Parties Information number. A unique 9–11 digit identifier assigned to each songwriter/publisher by their PRO. Used globally to track royalty payments. Click any IPI to copy it.</Def>
      <Def term="PRO Affiliation">Performing Rights Organization. Collects and distributes performance royalties on behalf of songwriters and publishers. Major US PROs: ASCAP, BMI, SESAC. Others: SOCAN (Canada), PRS (UK), APRA (Australia).</Def>
      <Def term="Hide Duplicates Toggle">Some people appear in multiple roles (e.g., Bruno Mars as Artist AND Producer AND Writer). Toggle this to simplify the view.</Def>
      <Def term="Role Filter Tabs">Filter credits by All / Artists / Writers / Producers.</Def>
      <Tip>Click any IPI number to instantly copy it to your clipboard — useful for PRO registration lookups.</Tip>

      {/* SECTION 4 */}
      <SectionHeading id="publishing" icon={FileText}>Understanding Publishing</SectionHeading>
      <Def term="Music Publisher">A company or individual that owns or administers the copyright in a musical composition (not the recording). They pitch songs for sync, collect publishing royalties, and manage licensing.</Def>
      <Def term="Publishing Split / Share %">The percentage of the publishing rights owned by each publisher for a given song. All shares must add up to 100%. Shown in the Publishing Split donut chart.</Def>
      <Def term="Publisher Administration">A publisher admin handles licensing and collections without owning the copyright.</Def>
      <Def term="MLC (Mechanical Licensing Collective)">US organization that licenses and pays mechanical royalties for digital streaming and downloads.</Def>
      <Def term="Mechanical Royalties">Royalties paid when a composition is reproduced (streamed, downloaded, pressed to CD).</Def>
      <Def term="Sync License">Permission granted by the publisher/songwriter to use a composition in visual media (film, TV, ads, games, social media). Requires clearance from BOTH the master rights holder (label) and the composition rights holder (publisher).</Def>
      <Def term="Master Rights">Rights to the specific sound recording. Owned by the label or the artist (if self-released).</Def>
      <Def term="Composition Rights">Rights to the underlying song (melody + lyrics). Owned by the songwriter/publisher.</Def>
      <Def term="Signed vs. Unsigned">Signed = at least one publisher is identified. Unsigned/Unknown = no publisher identified, may be self-published or unregistered.</Def>
      <Def term="Rights Status Summary">The card above credits showing X/Y signed and the top publishers. Green = easy to contact, Yellow = some unknowns, Red = complex.</Def>
      <Warn>Always verify critical rights information directly with the publisher before entering a deal. PubCheck data is sourced from public registries and may not be 100% complete.</Warn>

      {/* SECTION 5 */}
      <SectionHeading id="catalog-score" icon={BarChart3}>Catalog Score — Explained</SectionHeading>
      <p className="text-muted-foreground text-sm mb-3">PubCheck's 0–100 catalog score breaks down into four weighted categories:</p>
      <div className="space-y-3 my-4">
        {[
          { label: "Streams Score", pts: "0–40 pts", desc: "Based on Spotify stream count or YouTube views. Higher streams = more proven commercial appeal." },
          { label: "Chart Placements", pts: "0–25 pts", desc: "Based on Billboard, Spotify, Apple, Shazam chart positions. Chart success = stronger negotiating leverage." },
          { label: "Rights Cleared", pts: "0–20 pts", desc: "Based on the % of credits with identified publishers. More identified = less research needed to clear." },
          { label: "Publisher Simplicity", pts: "0–15 pts", desc: "Based on number of unique publishers. Fewer publishers = simpler negotiation." },
        ].map(item => (
          <div key={item.label} className="glass rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
              <Badge variant="outline" className="text-xs">{item.pts}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
      <Tip>A higher score indicates stronger catalog value and deal potential. A "Complex" score doesn't mean the song is bad — it just means more diligence is needed.</Tip>

      {/* SECTION 6 */}
      <SectionHeading id="features" icon={Layers}>Features Guide</SectionHeading>

      <SubHeading>🔍 Search & Filters</SubHeading>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
        <li>Use <span className="text-foreground font-medium">Advanced Filters</span> to filter by Genre, Year Range, Chart, and Sync Score</li>
        <li>Autocomplete suggestions show recent searches and popular queries as you type</li>
        <li>Press <kbd className="px-1 py-0.5 rounded border border-border text-[10px] font-mono">/</kbd> to focus the search bar instantly</li>
        <li>Use the Region filter to specify which country's PRO databases to search</li>
      </ul>

      <SubHeading>📋 Deals Tracker</SubHeading>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
        <li>A lightweight CRM for tracking sync licensing negotiations</li>
        <li>Click <span className="text-foreground font-medium">+ Deal</span> on any song card to add it</li>
        <li>Deal statuses: Researching → Outreach → Negotiating → Signed → Passed</li>
        <li>Toggle between <span className="text-foreground font-medium">List view</span> and <span className="text-foreground font-medium">Kanban Board</span> view</li>
        <li>Set priority levels: <span className="text-red-500">High</span>, <span className="text-yellow-500">Medium</span>, <span className="text-muted-foreground">Low</span></li>
        <li>Add deal value (sync fee amount) and set follow-up dates</li>
        <li><span className="text-foreground font-medium">Due Soon</span> and <span className="text-foreground font-medium">Overdue</span> badges appear automatically</li>
        <li>Use <span className="text-foreground font-medium">Deal Templates</span> (TV Sync, Film Sync, Ad Sync, etc.) to auto-fill professional memo text</li>
        <li>Export deals as CSV</li>
      </ul>

      <SubHeading>⚖️ Compare Tool</SubHeading>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
        <li>Side-by-side comparison of up to 3 songs</li>
        <li>Click <span className="text-foreground font-medium">Compare</span> on song cards to add</li>
        <li>Compares: Writers, Producers, Publisher, PRO, Signed %, Deal Score</li>
        <li>Export comparison as PDF</li>
      </ul>

      <SubHeading>📦 Batch Search</SubHeading>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
        <li>Search up to 20 songs at once</li>
        <li>Paste multiple links or type "Song Artist" on separate lines</li>
        <li>Retry failed searches individually</li>
        <li>Export batch results as CSV</li>
      </ul>

      <SubHeading>❤️ Favorites</SubHeading>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
        <li>Click the heart icon on any credit card to favorite a songwriter or producer</li>
        <li>Stale favorites trigger notification bell alerts when data is 24h+ old</li>
        <li>Export favorites as CSV or Excel</li>
      </ul>

      <SubHeading>🕐 History</SubHeading>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
        <li>Stores your last 50 searches automatically</li>
        <li>Re-search, favorite, or add a deal from history</li>
        <li>Filter and sort history entries</li>
      </ul>

      <SubHeading>📊 Catalog Sheet</SubHeading>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
        <li>Spreadsheet-style enriched view of all credits for a song</li>
        <li>Shows streaming stats, revenue estimates, chart data per credit</li>
        <li>Export as Excel</li>
      </ul>

      <SubHeading>👥 Teams</SubHeading>
      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-2">
        <li>Share searches with teammates</li>
        <li>Collaborative deal tracking</li>
        <li>Requires sign-in</li>
      </ul>

      {/* SECTION 7 */}
      <SectionHeading id="shortcuts" icon={Keyboard}>Keyboard Shortcuts</SectionHeading>
      <div className="rounded-lg border border-border overflow-hidden my-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-2.5 font-medium text-foreground">Shortcut</th>
              <th className="text-left p-2.5 font-medium text-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map(s => (
              <tr key={s.keys} className="border-b border-border/50 last:border-0">
                <td className="p-2.5"><kbd className="px-2 py-0.5 rounded border border-border bg-secondary font-mono text-xs">{s.keys}</kbd></td>
                <td className="p-2.5 text-muted-foreground">{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SECTION 8 */}
      <SectionHeading id="data-sources" icon={Database}>Data Sources</SectionHeading>
      <Def term="MusicBrainz">Open-source music encyclopedia. Provides song metadata, ISRC codes, credits, and release info.</Def>
      <Def term="ASCAP, BMI, SESAC Registries">PRO databases searched to find publisher and writer registration info.</Def>
      <Def term="Spotify API / Pathfinder GraphQL">Used to fetch stream counts and popularity data.</Def>
      <Def term="YouTube Data">View counts from YouTube.</Def>
      <Def term="Genius">Song view counts from Genius lyrics platform.</Def>
      <Def term="Shazam / Apple Charts">Chart position data.</Def>
      <Def term="MLC (Mechanical Licensing Collective)">US publishing share data.</Def>
      <Warn>Data is sourced from public registries and may not always be 100% complete. Always verify critical rights information directly with the publisher before entering a deal.</Warn>

      {/* SECTION 9 */}
      <SectionHeading id="glossary" icon={BookOpen}>Glossary of Terms (A–Z)</SectionHeading>
      {search && (
        <p className="text-xs text-muted-foreground mb-2">Showing {filteredGlossary.length} of {glossary.length} terms</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3">
        {filteredGlossary.map(g => (
          <div key={g.term} className="glass rounded-lg p-3">
            <span className="text-sm font-semibold text-primary">{g.term}</span>
            <p className="text-xs text-muted-foreground mt-0.5">{g.def}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // Mobile: use accordion-based sections inside the sheet
  const mobileContent = (
    <div>
      <Accordion type="multiple" defaultValue={["getting-started"]}>
        {sections.map(s => (
          <AccordionItem key={s.id} value={s.id}>
            <AccordionTrigger className="text-sm font-semibold">
              <span className="flex items-center gap-2">
                <s.icon className="w-4 h-4 text-primary" />
                {s.label}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {/* Render a simplified version per section */}
              <div id={s.id} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-4xl p-0 flex flex-col">
        <SheetHeader className="p-4 pb-2 border-b border-border/50 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <HelpCircle className="w-5 h-5 text-primary" />
            PubCheck Guide
          </SheetTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search the guide..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7" onClick={() => setSearch("")}>
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Desktop TOC sidebar */}
          {!isMobile && (
            <nav className="w-52 shrink-0 border-r border-border/50 p-3 overflow-y-auto hidden sm:block">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Contents</p>
              <div className="space-y-0.5">
                {sections.map(s => (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                      activeSection === s.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <s.icon className="w-3.5 h-3.5 shrink-0" />
                    {s.label}
                  </button>
                ))}
              </div>
            </nav>
          )}

          {/* Main scrollable content */}
          <ScrollArea className="flex-1 p-4 sm:p-6">
            {contentBlock}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};
