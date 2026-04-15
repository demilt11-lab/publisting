import { useState, useMemo } from "react";
import { AppShell, NavSection } from "@/components/layout/AppShell";
import { Mail, Copy, Check, Search, FileText, Users, Handshake, RefreshCw, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";

interface EmailTemplate {
  id: string;
  name: string;
  category: "initial" | "followup" | "deal" | "intro";
  subject: string;
  body: string;
  tags: string[];
  mergeFields: string[];
}

const TEMPLATES: EmailTemplate[] = [
  {
    id: "initial-writer",
    name: "Initial Outreach — Writer/Producer",
    category: "initial",
    subject: "Publishing opportunity for {{artist_name}}",
    body: `Hi {{contact_name}},

I hope this finds you well. I came across {{song_title}} by {{artist_name}} and was really impressed by the writing and production quality.

I'm reaching out from {{your_company}} — we're actively looking to sign talented writers and producers, and your work stood out to us.

Would you be open to a brief call this week to discuss how we might work together? We'd love to learn more about your catalog and creative goals.

Best regards,
{{your_name}}
{{your_company}}`,
    tags: ["writer", "producer", "cold outreach"],
    mergeFields: ["contact_name", "song_title", "artist_name", "your_name", "your_company"],
  },
  {
    id: "initial-artist",
    name: "Initial Outreach — Artist",
    category: "initial",
    subject: "Let's talk about your music, {{artist_name}}",
    body: `Hi {{contact_name}},

I've been following {{artist_name}}'s recent releases and I'm a big fan of the direction — {{song_title}} in particular caught our attention.

I work with {{your_company}}, and we specialize in helping artists maximize their publishing revenue and sync opportunities. We think there's a lot of untapped potential in your catalog.

Would you or your team be interested in a quick conversation? No pressure — just want to introduce ourselves and see if there's a fit.

Cheers,
{{your_name}}
{{your_company}}`,
    tags: ["artist", "cold outreach"],
    mergeFields: ["contact_name", "artist_name", "song_title", "your_name", "your_company"],
  },
  {
    id: "followup-1",
    name: "Follow-up — 1 Week",
    category: "followup",
    subject: "Re: Publishing opportunity for {{artist_name}}",
    body: `Hi {{contact_name}},

Just wanted to follow up on my previous email about {{artist_name}}'s catalog. I know things get busy, so I wanted to make sure my message didn't get lost.

We've been doing some analysis on {{song_title}} and see strong potential — especially on the sync licensing side. Happy to share our findings if you're interested.

Would a 15-minute call work this week?

Best,
{{your_name}}`,
    tags: ["follow-up", "reminder"],
    mergeFields: ["contact_name", "artist_name", "song_title", "your_name"],
  },
  {
    id: "followup-final",
    name: "Final Follow-up",
    category: "followup",
    subject: "Last note — {{artist_name}} publishing",
    body: `Hi {{contact_name}},

I wanted to reach out one last time regarding {{artist_name}}'s publishing catalog. I completely understand if the timing isn't right.

If you'd ever like to revisit this conversation in the future, please don't hesitate to reach out. We're always happy to chat.

Wishing you and {{artist_name}} continued success.

Best regards,
{{your_name}}
{{your_company}}`,
    tags: ["follow-up", "final"],
    mergeFields: ["contact_name", "artist_name", "your_name", "your_company"],
  },
  {
    id: "deal-interest",
    name: "Deal Discussion — Expression of Interest",
    category: "deal",
    subject: "Expression of interest — {{artist_name}} catalog",
    body: `Dear {{contact_name}},

Thank you for taking the time to speak with us about {{artist_name}}'s publishing catalog.

Following our conversation, I'm pleased to confirm {{your_company}}'s interest in exploring a publishing agreement. Based on our initial analysis:

• Catalog: {{song_count}} works
• Estimated annual revenue: {{annual_revenue}}
• Proposed deal structure: {{deal_type}}

We believe there's significant growth potential, particularly in sync licensing and international collection. We'd like to schedule a follow-up meeting to discuss terms in more detail.

Would {{meeting_date}} work for your team?

Best regards,
{{your_name}}
{{your_company}}`,
    tags: ["deal", "formal", "expression of interest"],
    mergeFields: ["contact_name", "artist_name", "your_name", "your_company", "song_count", "annual_revenue", "deal_type", "meeting_date"],
  },
  {
    id: "deal-confirmation",
    name: "Deal Confirmation & Next Steps",
    category: "deal",
    subject: "Next steps — {{artist_name}} publishing agreement",
    body: `Hi {{contact_name}},

Great news — we're excited to move forward with the {{deal_type}} for {{artist_name}}'s catalog.

Here are the next steps:
1. Our legal team will prepare the draft agreement by {{draft_date}}
2. We'll schedule a walkthrough call to review terms together
3. Target close date: {{close_date}}

In the meantime, please send over any additional catalog information or documentation you'd like us to review.

Looking forward to this partnership.

Best,
{{your_name}}
{{your_company}}`,
    tags: ["deal", "confirmation", "next steps"],
    mergeFields: ["contact_name", "artist_name", "deal_type", "draft_date", "close_date", "your_name", "your_company"],
  },
  {
    id: "intro-manager",
    name: "Introduction via Manager/Label",
    category: "intro",
    subject: "Introduction — {{your_company}} × {{artist_name}}",
    body: `Hi {{contact_name}},

{{referrer_name}} suggested I reach out to you regarding {{artist_name}}'s publishing situation.

I'm {{your_name}} from {{your_company}}. We work with a roster of {{roster_description}}, and we'd love to explore how we might add value to {{artist_name}}'s catalog.

Our approach focuses on:
• Maximizing sync placement opportunities
• Improving international collection rates
• Providing transparent, data-driven reporting

Would you be available for a brief introductory call? I'm flexible on timing.

Best regards,
{{your_name}}
{{your_company}}`,
    tags: ["introduction", "referral", "warm outreach"],
    mergeFields: ["contact_name", "referrer_name", "artist_name", "your_name", "your_company", "roster_description"],
  },
  {
    id: "intro-cosong",
    name: "Co-writer Introduction",
    category: "intro",
    subject: "Co-writing opportunity with {{artist_name}}",
    body: `Hi {{contact_name}},

I noticed your credits on {{song_title}} — incredible work. We represent {{artist_name}} and think there could be a great creative fit for future collaborations.

{{artist_name}} is currently working on new material and looking for co-writers with your style and range. Would you be interested in a writing session?

Let me know if you'd like to connect — happy to set something up.

Best,
{{your_name}}
{{your_company}}`,
    tags: ["co-writing", "collaboration", "creative"],
    mergeFields: ["contact_name", "song_title", "artist_name", "your_name", "your_company"],
  },
];

const CATEGORY_META: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  initial: { label: "Initial Outreach", icon: Mail, color: "text-primary" },
  followup: { label: "Follow-up", icon: RefreshCw, color: "text-amber-400" },
  deal: { label: "Deal Discussion", icon: Handshake, color: "text-emerald-400" },
  intro: { label: "Introduction", icon: Users, color: "text-blue-400" },
};

export default function OutreachTemplates() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<NavSection>("outreach");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return TEMPLATES.filter(t => {
      if (selectedCategory && t.category !== selectedCategory) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.tags.some(tag => tag.includes(q)) || t.subject.toLowerCase().includes(q);
      }
      return true;
    });
  }, [searchQuery, selectedCategory]);

  const copyTemplate = (template: EmailTemplate, field: "subject" | "body") => {
    const text = field === "subject" ? template.subject : template.body;
    navigator.clipboard.writeText(text);
    setCopiedId(`${template.id}-${field}`);
    toast({ title: `${field === "subject" ? "Subject" : "Email body"} copied`, description: "Paste it into your email client" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSectionChange = (section: NavSection) => {
    if (section === "outreach") return;
    if (section === "catalog-analysis") navigate("/catalog-analysis");
    else navigate("/", { state: { section } });
  };

  return (
    <AppShell activeSection={activeSection} onSectionChange={handleSectionChange}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Outreach Templates</h1>
                <p className="text-sm text-muted-foreground">Pre-built email templates for publishing deals and artist outreach</p>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">How it works</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                <span>Browse templates below and click to expand</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                <span>Copy the subject line and body text</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                <span>Replace {`{{merge fields}}`} with real names and details</span>
              </div>
            </div>
          </div>

          {/* Search + filter */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSelectedCategory(null)}
              >
                All
              </Button>
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <Button
                  key={key}
                  variant={selectedCategory === key ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
                >
                  <meta.icon className="w-3 h-3" />
                  {meta.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Templates list */}
          <div className="space-y-3">
            {filtered.map((template) => {
              const meta = CATEGORY_META[template.category];
              const isExpanded = expandedId === template.id;

              return (
                <div
                  key={template.id}
                  className="rounded-xl border border-border/50 bg-card overflow-hidden hover:border-primary/20 transition-colors"
                >
                  <button
                    className="w-full text-left p-4 flex items-center justify-between gap-3"
                    onClick={() => setExpandedId(isExpanded ? null : template.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg bg-card flex items-center justify-center border border-border/50 shrink-0`}>
                        <meta.icon className={`w-4 h-4 ${meta.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{template.name}</p>
                        <p className="text-xs text-muted-foreground truncate">Subject: {template.subject}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {template.tags.slice(0, 2).map(tag => (
                        <Badge key={tag} variant="outline" className="text-[10px] hidden sm:inline-flex">{tag}</Badge>
                      ))}
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/50 p-4 space-y-4 animate-fade-in">
                      {/* Subject line */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject Line</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] gap-1"
                            onClick={() => copyTemplate(template, "subject")}
                          >
                            {copiedId === `${template.id}-subject` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedId === `${template.id}-subject` ? "Copied" : "Copy"}
                          </Button>
                        </div>
                        <div className="rounded-lg bg-secondary/50 p-3 text-sm text-foreground font-mono">
                          {template.subject}
                        </div>
                      </div>

                      {/* Body */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Body</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] gap-1"
                            onClick={() => copyTemplate(template, "body")}
                          >
                            {copiedId === `${template.id}-body` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedId === `${template.id}-body` ? "Copied" : "Copy"}
                          </Button>
                        </div>
                        <pre className="rounded-lg bg-secondary/50 p-4 text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-[400px] overflow-y-auto">
                          {template.body}
                        </pre>
                      </div>

                      {/* Merge fields */}
                      <div className="space-y-1.5">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Merge Fields</span>
                        <div className="flex flex-wrap gap-1.5">
                          {template.mergeFields.map(field => (
                            <Badge key={field} variant="secondary" className="text-[10px] font-mono">
                              {`{{${field}}}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                  <Search className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No templates match your search</p>
              </div>
            )}
          </div>

          {/* Future live sending note */}
          <div className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4 text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Live email sending coming soon</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              We're building direct email sending so you can reach out without leaving Publisting. For now, copy templates and paste into your email client.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
