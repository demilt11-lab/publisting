import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { SeoHead } from "@/components/seo/SeoHead";

type Kind = "playlist" | "publisher" | "label" | "work";

const CONFIG: Record<Kind, { table: string; pubCol: string; titleField: string; subtitleFields: string[] }> = {
  playlist:  { table: "playlists",  pubCol: "pub_playlist_id",  titleField: "name",  subtitleFields: ["curator", "platform", "followers"] },
  publisher: { table: "publishers", pubCol: "pub_publisher_id", titleField: "name",  subtitleFields: ["pro", "ipi", "classification"] },
  label:     { table: "labels",     pubCol: "pub_label_id",     titleField: "name",  subtitleFields: ["classification"] },
  work:      { table: "works",      pubCol: "pub_work_id",      titleField: "title", subtitleFields: ["iswc", "primary_writer_name"] },
};

export default function CanonicalEntityDetail({ kind }: { kind: Kind }) {
  const cfg = CONFIG[kind];
  const { pubId } = useParams<{ pubId: string }>();
  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pubId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from(cfg.table as any).select("*").eq(cfg.pubCol, pubId).maybeSingle();
      if (!cancelled) { setRow(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [pubId, cfg.table, cfg.pubCol]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">
        <SeoHead title={`${kind} profile`} description={`Publisting ${kind} profile with metadata, external IDs and rights intelligence.`} />
        Loading…
      </div>
    );
  }
  if (!row) {
    return (
      <div className="min-h-screen bg-background p-6">
        <SeoHead title={`${kind} not found`} description={`The requested ${kind} could not be found on Publisting.`} noindex />
        <Link to="/entity-hub"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link>
        <div className="mt-6 text-muted-foreground text-sm">Not found.</div>
      </div>
    );
  }

  const externals = (row.external_ids || row.metadata?.external_ids || {}) as Record<string, any>;

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title={`${row[cfg.titleField]} — ${kind}`}
        description={`${kind.charAt(0).toUpperCase() + kind.slice(1)} ${row[cfg.titleField]} on Publisting: metadata, external IDs and rights intelligence for music publishing scouting.`}
      />
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <Link to="/entity-hub"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Hub</Button></Link>
        <div>
          <Badge variant="outline" className="mb-2 capitalize">{kind}</Badge>
          <h1 className="text-3xl font-semibold">{row[cfg.titleField]}</h1>
          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-3">
            {cfg.subtitleFields.map((f) => row[f] != null && (
              <span key={f}><span className="opacity-60">{f}:</span> {String(row[f])}</span>
            ))}
            <code className="text-xs">{row[cfg.pubCol]}</code>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="bg-surface border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">External IDs</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {Object.keys(externals).length === 0 && <p className="text-xs text-muted-foreground">No external IDs.</p>}
              {Object.entries(externals).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-border/40 py-1">
                  <span className="text-muted-foreground">{k}</span>
                  <code className="text-xs">{String(v)}</code>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-surface border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Metadata</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap break-all">
                {JSON.stringify(row.metadata ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}