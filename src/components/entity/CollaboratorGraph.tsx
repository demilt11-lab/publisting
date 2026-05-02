import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

/**
 * Collaborator graph for a creator (writer/producer).
 * Renders: center = the focal creator, ring = tracks they worked on,
 * outer ring = other creators on those tracks.
 */
export function CollaboratorGraph({ creatorUuid, creatorName }: {
  creatorUuid: string;
  creatorName: string;
}) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [stats, setStats] = useState<{ tracks: number; collaborators: number; repeated: number }>({
    tracks: 0, collaborators: 0, repeated: 0,
  });

  // Resize listener for responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.max(280, Math.floor(e.contentRect.width)));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // 1) Tracks the focal creator is on
        const { data: focalCredits } = await supabase
          .from("track_credits")
          .select("track_id, role, share")
          .eq("creator_id", creatorUuid)
          .limit(80);
        const trackIds = Array.from(new Set((focalCredits ?? []).map((r: any) => r.track_id))).filter(Boolean);

        if (trackIds.length === 0) {
          if (alive) { setGraph({ nodes: [], links: [] }); setStats({ tracks: 0, collaborators: 0, repeated: 0 }); }
          return;
        }

        // 2) Track metadata
        const { data: trackRows } = await supabase
          .from("tracks")
          .select("id, pub_track_id, title, primary_artist_name")
          .in("id", trackIds);
        const trackMap = new Map<string, any>();
        (trackRows ?? []).forEach((t: any) => trackMap.set(t.id, t));

        // 3) All credits on those tracks (other creators)
        const { data: allCredits } = await supabase
          .from("track_credits")
          .select("track_id, creator_id, role")
          .in("track_id", trackIds);

        const otherCreatorIds = Array.from(new Set(
          (allCredits ?? []).map((c: any) => c.creator_id).filter((id: string) => id && id !== creatorUuid),
        ));

        const { data: creatorRows } = otherCreatorIds.length
          ? await supabase.from("creators")
              .select("id, pub_creator_id, name, primary_role")
              .in("id", otherCreatorIds)
          : { data: [] as any[] };
        const creatorMap = new Map<string, any>();
        (creatorRows ?? []).forEach((c: any) => creatorMap.set(c.id, c));

        // Build nodes/links
        const nodes: any[] = [
          { id: `c:${creatorUuid}`, label: creatorName, kind: "focal", color: "hsl(var(--primary))", val: 12 },
        ];
        const collabFreq = new Map<string, number>();

        for (const tid of trackIds) {
          const t = trackMap.get(tid);
          if (!t) continue;
          nodes.push({
            id: `t:${tid}`, label: t.title, kind: "track",
            pub_id: t.pub_track_id, color: "hsl(var(--muted-foreground))", val: 4,
            subtitle: t.primary_artist_name,
          });
        }
        for (const cid of otherCreatorIds) {
          const c = creatorMap.get(cid);
          if (!c) continue;
          nodes.push({
            id: `c:${cid}`, label: c.name, kind: "creator",
            pub_id: c.pub_creator_id, role: c.primary_role,
            color: c.primary_role === "producer" ? "hsl(190 80% 55%)" : "hsl(160 70% 50%)",
            val: 6,
          });
        }

        const links: any[] = [];
        for (const c of (allCredits ?? [])) {
          if (!c.track_id || !c.creator_id) continue;
          if (!trackMap.has(c.track_id)) continue;
          if (c.creator_id !== creatorUuid && !creatorMap.has(c.creator_id)) continue;
          links.push({
            source: `c:${c.creator_id}`,
            target: `t:${c.track_id}`,
            role: c.role,
          });
          if (c.creator_id !== creatorUuid) {
            collabFreq.set(c.creator_id, (collabFreq.get(c.creator_id) ?? 0) + 1);
          }
        }

        // bump node size by collab frequency
        for (const n of nodes) {
          if (n.kind === "creator") {
            const id = n.id.replace(/^c:/, "");
            const f = collabFreq.get(id) ?? 1;
            n.val = 4 + Math.min(14, f * 2);
            n.frequency = f;
          }
        }

        const repeated = Array.from(collabFreq.values()).filter((v) => v >= 2).length;
        if (alive) {
          setGraph({ nodes, links });
          setStats({ tracks: trackIds.length, collaborators: otherCreatorIds.length, repeated });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [creatorUuid, creatorName]);

  const empty = !loading && graph.nodes.length <= 1;

  // Top repeat collaborators list
  const repeatList = useMemo(() => {
    return graph.nodes
      .filter((n: any) => n.kind === "creator" && (n.frequency ?? 0) >= 2)
      .sort((a: any, b: any) => (b.frequency ?? 0) - (a.frequency ?? 0))
      .slice(0, 8);
  }, [graph.nodes]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Collaborator graph
          <Badge variant="outline" className="text-[10px]">{stats.tracks} tracks</Badge>
          <Badge variant="outline" className="text-[10px]">{stats.collaborators} collaborators</Badge>
          {stats.repeated > 0 && (
            <Badge variant="outline" className="text-[10px]">{stats.repeated} repeated</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="w-full">
          {loading ? (
            <div className="h-[360px] flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Building graph…
            </div>
          ) : empty ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground text-center px-4">
              No collaborator data yet. As tracks accumulate writer/producer credits in
              <code className="mx-1">track_credits</code>, this graph will populate automatically.
            </div>
          ) : (
            <div className="rounded-md border border-border/50 overflow-hidden bg-muted/10">
              <ForceGraph2D
                graphData={graph}
                width={width}
                height={420}
                backgroundColor="transparent"
                nodeRelSize={4}
                linkColor={() => "hsl(var(--border))"}
                linkWidth={0.6}
                cooldownTicks={80}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                  const r = Math.sqrt(node.val ?? 4) * 2.5;
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
                  ctx.fillStyle = node.color || "hsl(var(--muted-foreground))";
                  ctx.fill();
                  if (node.kind === "focal" || globalScale > 1.2) {
                    const label = String(node.label ?? "");
                    const fontSize = Math.max(8, 11 / Math.max(0.8, globalScale * 0.9));
                    ctx.font = `${fontSize}px Inter, sans-serif`;
                    ctx.fillStyle = "hsl(var(--foreground))";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillText(label.length > 28 ? label.slice(0, 27) + "…" : label, node.x, node.y + r + 2);
                  }
                }}
                onNodeClick={(node: any) => {
                  if (node.kind === "track" && node.pub_id) navigate(`/track/${node.pub_id}`);
                  if (node.kind === "creator" && node.pub_id) {
                    const role = node.role === "producer" ? "producer" : "writer";
                    navigate(`/${role}/${node.pub_id}`);
                  }
                }}
              />
            </div>
          )}
        </div>

        {repeatList.length > 0 && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
              Repeat collaborators
            </div>
            <div className="flex flex-wrap gap-1.5">
              {repeatList.map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => {
                    const role = n.role === "producer" ? "producer" : "writer";
                    if (n.pub_id) navigate(`/${role}/${n.pub_id}`);
                  }}
                  className="inline-flex items-center gap-1.5 border border-border/50 rounded px-2 py-1 hover:bg-muted/40 text-xs"
                >
                  <span className="truncate max-w-[140px]">{n.label}</span>
                  <Badge variant="outline" className="text-[9px]">×{n.frequency}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}