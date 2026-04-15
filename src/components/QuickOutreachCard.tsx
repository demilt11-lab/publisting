import { memo, useState } from "react";
import { Mail, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface QuickOutreachCardProps {
  artistName: string;
  songTitle: string;
  contactEmail?: string;
  contactName?: string;
}

function generateQuickEmail(artistName: string, songTitle: string, contactName?: string) {
  const name = contactName || "there";
  return {
    subject: `Publishing opportunity for ${artistName}`,
    body: `Hi ${name},

I came across "${songTitle}" by ${artistName} and was really impressed by the writing and production quality.

I'm reaching out to discuss potential publishing opportunities. Would you be open to a brief call this week?

Best regards,
[Your Name]
[Your Company]`,
  };
}

export const QuickOutreachCard = memo(({ artistName, songTitle, contactEmail, contactName }: QuickOutreachCardProps) => {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const email = generateQuickEmail(artistName, songTitle, contactName);

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Quick Outreach</h3>
        </div>
        <div className="flex items-center gap-2">
          {contactEmail && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" asChild>
              <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}>
                <Mail className="w-3 h-3" /> Open in Email
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Less" : "Preview"}
          </Button>
        </div>
      </div>

      {!expanded && (
        <p className="text-xs text-muted-foreground">
          Ready-to-use outreach email for {artistName} — click Preview to see and copy.
        </p>
      )}

      {expanded && (
        <div className="space-y-3 animate-fade-in">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Subject</span>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1" onClick={() => copyText(email.subject, "subject")}>
                {copiedField === "subject" ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                {copiedField === "subject" ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="rounded-lg bg-secondary/50 p-2 text-xs text-foreground font-mono">{email.subject}</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Body</span>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1" onClick={() => copyText(email.body, "body")}>
                {copiedField === "body" ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                {copiedField === "body" ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="rounded-lg bg-secondary/50 p-3 text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-[200px] overflow-y-auto">
              {email.body}
            </pre>
          </div>

          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">Customize before sending</Badge>
            <Badge variant="outline" className="text-[10px]">Replace [Your Name]</Badge>
          </div>
        </div>
      )}
    </div>
  );
});

QuickOutreachCard.displayName = "QuickOutreachCard";
