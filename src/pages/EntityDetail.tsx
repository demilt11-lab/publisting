import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { fetchFieldProvenance, fetchChartHistory, fetchPlaylistHistory } from "@/lib/api/chartTimeSeries";
import { EntityTrendChart } from "@/components/entity/EntityTrendChart";
import { useAuth } from "@/hooks/useAuth";
import { useTeamContext } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";

type Kind = "artist" | "track" | "writer" | "producer";

interface Loaded {
  uuid: string;
  pub_id: string;
  display_name: string;
  subtitle?: string | null;
  image_url?: string | null;
  meta?: Record<string, any>;
  entity_table_type: "artist" | "track" | "creator";
}

const KIND_TITLE: Record<Kind, string> = {
  artist: "Artist",
  track: "Track",
  writer: "Writer",
  producer: "Producer",
};

export default function EntityDetail({ kind }: { kind: Kind }) {
  const { pubId } = useParams<{ pubId: string }>();
  const { user } = useAuth();
  const { activeTeam } = useTeamContext();
  const { toast } = useToast();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [provenance, setProvenance] = useState<any[]>([]);
  const [externals, setExternals] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [chartCount, setChartCount] = useState(0);
  const [playlistCount, setPlaylistCount] = useState(0);
  const [notes, setNotes] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const tableType = useMemo<Loaded["entity_table_type"]>(() => {
    if (kind === "artist") return "artist";
    if (kind === "track") return "track";
    return "creator";
  }, [kind]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pubId) return;
      setLoading(true);
      try {
        let row: Loaded | null = null;
        if (kind === "artist") {
          const { data } = await supabase.from("artists")
            .select("id, pub_artist_id, name, country, image_url, primary_genre, metadata")
            .eq("pub_artist_id", pubId).maybeSingle();
          if (data) row = {
            uuid: data.id, pub_id: data.pub_artist_id, display_name: data.name,
            subtitle: [data.primary_genre, data.country].filter(Boolean).join(" · "),
            image_url: data.image_url, meta: data.metadata as any, entity_table_type: "artist",
          };
        } else if (kind === "track") {
          const { data } = await supabase.from("tracks")
            .select("id, pub_track_id, title, primary_artist_name, isrc, cover_url, release_date, language, metadata")
            .eq("pub_track_id", pubId).maybeSingle();
          if (data) row = {
            uuid: data.id, pub_id: data.pub_track_id, display_name: data.title,
            subtitle: data.primary_artist_name,
            image_url: data.cover_url,
            meta: { isrc: data.isrc, release_date: data.release_date, language: data.language, ...(data.metadata as any || {}) },
            entity_table_type: "track",
          };
        } else {
          const { data } = await supabase.from("creators")
            .select("id, pub_creator_id, name, primary_role, country, image_url, ipi, pro, aliases, metadata")
            .eq("pub_creator_id", pubId).maybeSingle();
          if (data) row = {
            uuid: data.id, pub_id: data.pub_creator_id, display_name: data.name,
            subtitle: [data.primary_role, data.country].filter(Boolean).join(" · "),
            image_url: data.image_url,
            meta: { ipi: data.ipi, pro: data.pro, aliases: data.aliases, ...(data.metadata as any || {}) },
            entity_table_type: "creator",
          };
        }
        if (!alive) return;
        setLoaded(row);

        if (row) {
          const [prov, exts, hist, pls] = await Promise.all([
            fetchFieldProvenance(row.entity_table_type as any, row.uuid),
            supabase.from("external_ids")
              .select("platform, external_id, url, source, confidence")
              .eq("entity_type", row.entity_table_type).eq("entity_id", row.uuid),
            fetchChartHistory(row.entity_table_type as any, row.uuid, 365),
            fetchPlaylistHistory(row.entity_table_type as any, row.uuid, 365),
          ]);
          if (!alive) return;
          setProvenance(prov as any[]);
          setExternals((exts.data as any[]) ?? []);
          setChartCount(hist.length);
          setPlaylistCount(pls.length);

          // credits: tracks for a creator, or creators for a track
          if (row.entity_table_type === "creator") {
            const { data: tc } = await supabase.from("track_credits")
              .select("role, share, confidence, source, tracks:track_id(pub_track_id, title, primary_artist_name, cover_url)")
              .eq("creator_id", row.uuid).limit(50);
            setCredits((tc as any[]) ?? []);
          } else if (row.entity_table_type === "track") {
            const { data: tc } = await supabase.from("track_credits")
              .select("role, share, confidence, source, creators:creator_id(pub_creator_id, name, primary_role)")
              .eq("track_id", row.uuid).limit(50);
            setCredits((tc as any[]) ?? []);
          }

          // notes (team-scoped)
          if (activeTeam?.id) {
            const { data: ns } = await (supabase as any).from("entity_notes")
              .select("*").eq("entity_type", row.entity_table_type)
              .eq("entity_id", row.uuid).eq("team_id", activeTeam.id)
              .order("created_at", { ascending: false });
            setNotes((ns as any[]) ?? []);
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [pubId, kind, activeTeam?.id]);

  const addNote = async () => {
    if (!loaded || !user || !activeTeam?.id || !draft.trim()) return;
    setBusy(true);
    const { error, data } = await (supabase as any).from("entity_notes").insert({
      team_id: activeTeam.id,
      entity_type: loaded.entity_table_type,
      entity_id: loaded.uuid,
      pub_id: loaded.pub_id,
      author_id: user.id,
      body: draft.trim(),
    }).select().single();
    setBusy(false);
    if (error) {
      toast({ title: "Could not save note", description: error.message, variant: "destructive" });
      return;
    }
    setNotes((prev) => [data as any, ...prev]);
    setDraft("");
  };

  if (!pubId) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <Link to="/entity-hub" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Entity Hub
        </Link>

        {loading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Loading {KIND_TITLE[kind]}…</div>
        ) : !loaded ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            We couldn't find a {KIND_TITLE[kind].toLowerCase()} with that canonical ID.
          </CardContent></Card>
        ) : (
          <>
            {/* Header */}
            <Card>
              <CardContent className="p-5 flex items-start gap-4">
                {loaded.image_url ? (
                  <img src={loaded.image_url} alt={loaded.display_name}
                    className="h-20 w-20 rounded-md object-cover border border-border" />
                ) : (
                  <div className="h-20 w-20 rounded-md bg-muted/40 border border-border" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{KIND_TITLE[kind]}</Badge>
                    {kind === "writer" || kind === "producer" ? (
                      <Badge variant="outline" className="text-[10px] capitalize">creator</Badge>
                    ) : null}
                  </div>
                  <h1 className="text-xl font-semibold truncate">{loaded.display_name}</h1>
                  {loaded.subtitle && (
                    <div className="text-sm text-muted-foreground truncate">{loaded.subtitle}</div>
                  )}
                  <div className="text-[11px] font-mono text-muted-foreground mt-1">{loaded.pub_id}</div>
                </div>
              </CardContent>
            </Card>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="External IDs" value={externals.length} />
              <StatTile label="Chart points" value={chartCount} />
              <StatTile label="Playlist points" value={playlistCount} />
              <StatTile label="Credit links" value={credits.length} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Linked entities / credits */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {loaded.entity_table_type === "creator" ? "Songs they've worked on" :
                     loaded.entity_table_type === "track" ? "Writers & producers on this track" :
                     "Linked entities"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {credits.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      {loaded.entity_table_type === "artist"
                        ? "Credits for artists are surfaced through their tracks. Open a track to see writers/producers."
                        : "No credit links recorded yet — they'll appear here as the lookup pipeline confirms them."}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {credits.slice(0, 25).map((c: any, i: number) => {
                        const tr = c.tracks; const cr = c.creators;
                        if (tr?.pub_track_id) {
                          return (
                            <Link key={i} to={`/track/${tr.pub_track_id}`}
                              className="flex items-center justify-between border border-border/50 rounded px-2 py-1.5 hover:bg-muted/30">
                              <div className="min-w-0">
                                <div className="text-sm truncate">{tr.title}</div>
                                <div className="text-xs text-muted-foreground truncate">{tr.primary_artist_name}</div>
                              </div>
                              <Badge variant="outline" className="text-[10px] capitalize ml-2">{c.role}</Badge>
                            </Link>
                          );
                        }
                        if (cr?.pub_creator_id) {
                          const role = (cr.primary_role || c.role) as string;
                          const linkKind = role === "writer" ? "writer" : role === "producer" ? "producer" : "writer";
                          return (
                            <Link key={i} to={`/${linkKind}/${cr.pub_creator_id}`}
                              className="flex items-center justify-between border border-border/50 rounded px-2 py-1.5 hover:bg-muted/30">
                              <div className="text-sm truncate">{cr.name}</div>
                              <Badge variant="outline" className="text-[10px] capitalize ml-2">{c.role}</Badge>
                            </Link>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Source provenance + external IDs */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Source coverage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {externals.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {externals.map((x: any, i: number) =>
                        x.url ? (
                          <a key={i} href={x.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {x.platform} <ExternalLink className="h-2.5 w-2.5 ml-1" />
                            </Badge>
                          </a>
                        ) : (
                          <Badge key={i} variant="outline" className="text-[10px]">{x.platform}</Badge>
                        )
                      )}
                    </div>
                  )}
                  {provenance.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      No source provenance recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-1 text-xs max-h-64 overflow-auto">
                      {provenance.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between border-b border-border/50 py-1">
                          <div className="min-w-0">
                            <span className="font-medium">{p.field_name}</span>
                            {p.field_value && <span className="text-muted-foreground ml-2 truncate">{p.field_value}</span>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-[10px]">{p.source}</Badge>
                            <span className="text-muted-foreground">{Math.round(Number(p.confidence) * 100)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Trend */}
            {(chartCount > 0 || playlistCount > 0) && (
              <EntityTrendChart entityType={loaded.entity_table_type as any} entityId={loaded.uuid} />
            )}

            {/* Notes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Team notes
                  {activeTeam ? <Badge variant="outline" className="text-[10px]">{activeTeam.name}</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!user || !activeTeam ? (
                  <div className="text-xs text-muted-foreground">
                    Sign in and select a team to leave notes on this entity.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Add an internal note (visible to your team)…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" disabled={busy || !draft.trim()} onClick={addNote}>
                        {busy ? "Saving…" : "Add note"}
                      </Button>
                    </div>
                  </div>
                )}
                {notes.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No team notes yet.</div>
                ) : (
                  <div className="space-y-2">
                    {notes.map((n: any) => (
                      <div key={n.id} className="border border-border/50 rounded p-2">
                        <div className="text-sm whitespace-pre-wrap">{n.body}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {new Date(n.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}