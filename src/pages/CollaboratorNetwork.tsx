import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Network, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchCollaboratorsForName, CollabEdge } from "@/lib/api/collaboratorGraph";

const EDGE_COLORS: Record<string, string> = {
  co_writer: "hsl(190 80% 60%)",
  co_producer: "hsl(48 90% 60%)",
  shared_publisher: "hsl(280 70% 65%)",
  shared_label: "hsl(0 70% 65%)",
};

export default function CollaboratorNetwork() {
  const { name = "" } = useParams();
  const decoded = decodeURIComponent(name);
  const [edges, setEdges] = useState<CollabEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchCollaboratorsForName(decoded, 80).then((list) => {
      setEdges(list); setLoading(false);
    });
  }, [decoded]);

  // Build nodes: center + neighbors. Position neighbors on a circle.
  const layout = useMemo(() => {
    const center = { name: decoded, x: 250, y: 220, weight: 1 };
    const others = new Map<string, { weight: number; types: Set<string> }>();
    for (const e of edges) {
      const n = e.source_name === decoded ? e.target_name : e.source_name;
      const cur = others.get(n) || { weight: 0, types: new Set<string>() };
      cur.weight += e.weight || 1;
      cur.types.add(e.edge_type);
      others.set(n, cur);
    }
    const ordered = Array.from(others.entries()).sort((a, b) => b[1].weight - a[1].weight).slice(0, 30);
    const nodes = ordered.map(([n, info], i) => {
      const angle = (2 * Math.PI * i) / Math.max(ordered.length, 1);
      // Outer radius scales with count
      const ringR = 60 + Math.min(160, ordered.length * 4);
      return { name: n, x: 250 + Math.cos(angle) * ringR, y: 220 + Math.sin(angle) * ringR, weight: info.weight, types: Array.from(info.types) };
    });
    return { center, nodes };
  }, [edges, decoded]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button></Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Network className="w-5 h-5 text-primary" />
                {decoded} — Network
              </h1>
              <p className="text-xs text-muted-foreground">Collaborators, co-producers, and shared publishers across observed catalog</p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 text-xs"><Users className="w-3 h-3" /> {layout.nodes.length} collaborators</Badge>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Graph */}
          <div className="glass rounded-xl p-4 lg:col-span-2">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-sm text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading network…
              </div>
            ) : layout.nodes.length === 0 ? (
              <div className="text-sm text-muted-foreground italic py-10 text-center">
                No collaborator edges recorded yet for {decoded}. Edges populate automatically as Lookup Intelligence resolves tracks they appear on.
              </div>
            ) : (
              <svg viewBox="0 0 500 440" className="w-full h-[440px]">
                {/* edges */}
                {layout.nodes.map((n) => (
                  <line
                    key={`e-${n.name}`}
                    x1={layout.center.x} y1={layout.center.y} x2={n.x} y2={n.y}
                    stroke={EDGE_COLORS[n.types[0]] || "hsl(var(--border))"}
                    strokeWidth={Math.max(0.5, Math.min(3, n.weight / 3))}
                    strokeOpacity={0.5}
                  />
                ))}
                {/* center */}
                <circle cx={layout.center.x} cy={layout.center.y} r={26} fill="hsl(var(--primary))" opacity={0.85} />
                <text x={layout.center.x} y={layout.center.y + 4} textAnchor="middle" fontSize={11} fill="hsl(var(--primary-foreground))" fontWeight={600}>
                  {decoded.length > 14 ? decoded.slice(0, 12) + "…" : decoded}
                </text>
                {/* nodes */}
                {layout.nodes.map((n) => (
                  <g key={`n-${n.name}`} className="cursor-pointer">
                    <Link to={`/network/${encodeURIComponent(n.name)}`} target="_self">
                      <circle cx={n.x} cy={n.y} r={Math.max(8, Math.min(18, 6 + n.weight))}
                        fill="hsl(var(--card))" stroke={EDGE_COLORS[n.types[0]] || "hsl(var(--border))"} strokeWidth={1.5} />
                      <text x={n.x} y={n.y - Math.max(12, Math.min(22, 10 + n.weight))} textAnchor="middle" fontSize={10}
                        fill="hsl(var(--foreground))">
                        {n.name.length > 18 ? n.name.slice(0, 16) + "…" : n.name}
                      </text>
                    </Link>
                  </g>
                ))}
              </svg>
            )}
          </div>

          {/* Edge list */}
          <div className="glass rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Edges</h3>
            <div className="space-y-1 max-h-[440px] overflow-y-auto pr-1">
              {edges.map((e) => {
                const other = e.source_name === decoded ? e.target_name : e.source_name;
                return (
                  <Link key={e.id} to={`/network/${encodeURIComponent(other)}`}
                    className="block text-xs py-1.5 px-2 rounded bg-background/40 border border-border/30 hover:border-primary/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground font-medium truncate">{other}</span>
                      <Badge variant="outline" className="text-[9px]" style={{ color: EDGE_COLORS[e.edge_type], borderColor: EDGE_COLORS[e.edge_type] }}>
                        {e.edge_type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{e.track_count} tracks · weight {e.weight.toFixed(1)}</p>
                  </Link>
                );
              })}
              {!loading && edges.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No edges yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="text-[10px] text-muted-foreground italic">
          Legend: <span style={{ color: EDGE_COLORS.co_writer }}>co-writer</span> ·
          <span style={{ color: EDGE_COLORS.co_producer }}> co-producer</span> ·
          <span style={{ color: EDGE_COLORS.shared_publisher }}> shared publisher</span>
        </div>
      </div>
    </div>
  );
}