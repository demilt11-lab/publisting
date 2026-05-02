import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, SlidersHorizontal } from "lucide-react";

type Kind = "all" | "artist" | "track" | "creator";
type RoleFilter = "any" | "writer" | "producer" | "composer";

interface Row {
  entity_type: "artist" | "track" | "creator";
  uuid: string;
  pub_id: string;
  display: string;
  subtitle?: string | null;
  role?: string | null;
  source_coverage: number;
}

/**
 * Discovery: filter canonical entities by attributes — country, role, source coverage,
 * has-credits, etc. Built on top of the canonical artists/tracks/creators tables.
 */
export function EntityDiscoveryPanel() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>("creator");
  const [role, setRole] = useState<RoleFilter>("any");
  const [country, setCountry] = useState("");
  const [text, setText] = useState("");
  const [minCoverage, setMinCoverage] = useState(0);
  const [hasCredits, setHasCredits] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const run = async () => {
    setLoading(true);
    try {
      const collected: Row[] = [];
      const norm = text.trim().toLowerCase();

      const wantArtists = kind === "all" || kind === "artist";
      const wantTracks = kind === "all" || kind === "track";
      const wantCreators = kind === "all" || kind === "creator";

      if (wantArtists) {
        let q = supabase.from("artists").select("id, pub_artist_id, name, country, primary_genre").limit(40);
        if (country) q = q.ilike("country", `%${country}%`);
        if (norm) q = q.ilike("normalized_name", `%${norm}%`);
        const { data } = await q;
        for (const r of (data ?? [])) {
          collected.push({
            entity_type: "artist", uuid: r.id, pub_id: r.pub_artist_id,
            display: r.name, subtitle: [r.primary_genre, r.country].filter(Boolean).join(" · ") || null,
            source_coverage: 0,
          });
        }
      }
      if (wantTracks) {
        let q = supabase.from("tracks").select("id, pub_track_id, title, primary_artist_name, language").limit(40);
        if (norm) q = q.ilike("normalized_title", `%${norm}%`);
        const { data } = await q;
        for (const r of (data ?? [])) {
          collected.push({
            entity_type: "track", uuid: r.id, pub_id: r.pub_track_id,
            display: r.title, subtitle: r.primary_artist_name, source_coverage: 0,
          });
        }
      }
      if (wantCreators) {
        let q = supabase.from("creators")
          .select("id, pub_creator_id, name, primary_role, country").limit(40);
        if (role !== "any") q = q.eq("primary_role", role);
        if (country) q = q.ilike("country", `%${country}%`);
        if (norm) q = q.ilike("normalized_name", `%${norm}%`);
        const { data } = await q;
        for (const r of (data ?? [])) {
          collected.push({
            entity_type: "creator", uuid: r.id, pub_id: r.pub_creator_id,
            display: r.name, subtitle: [r.primary_role, r.country].filter(Boolean).join(" · ") || null,
            role: r.primary_role, source_coverage: 0,
          });
        }
      }

      // Source coverage: count platforms in external_ids per entity
      if (collected.length) {
        const groups: Record<string, string[]> = {};
        for (const r of collected) {
          const k = r.entity_type;
          (groups[k] = groups[k] || []).push(r.uuid);
        }
        for (const [t, ids] of Object.entries(groups)) {
          const { data } = await supabase.from("external_ids")
            .select("entity_id, platform").eq("entity_type", t as any).in("entity_id", ids);
          const counts = new Map<string, Set<string>>();
          for (const x of (data ?? [])) {
            if (!counts.has(x.entity_id)) counts.set(x.entity_id, new Set());
            counts.get(x.entity_id)!.add(x.platform);
          }
          for (const r of collected) {
            if (r.entity_type === t) r.source_coverage = counts.get(r.uuid)?.size ?? 0;
          }
        }
      }

      // hasCredits filter (creators / tracks only)
      let filtered = collected.filter((r) => r.source_coverage >= minCoverage);
      if (hasCredits) {
        const targetIds = filtered
          .filter((r) => r.entity_type === "creator" || r.entity_type === "track")
          .map((r) => ({ type: r.entity_type, id: r.uuid }));
        if (targetIds.length) {
          const creatorIds = targetIds.filter((x) => x.type === "creator").map((x) => x.id);
          const trackIds = targetIds.filter((x) => x.type === "track").map((x) => x.id);
          const has = new Set<string>();
          if (creatorIds.length) {
            const { data } = await supabase.from("track_credits")
              .select("creator_id").in("creator_id", creatorIds);
            (data ?? []).forEach((x: any) => has.add(`creator:${x.creator_id}`));
          }
          if (trackIds.length) {
            const { data } = await supabase.from("track_credits")
              .select("track_id").in("track_id", trackIds);
            (data ?? []).forEach((x: any) => has.add(`track:${x.track_id}`));
          }
          filtered = filtered.filter((r) =>
            r.entity_type === "artist" ? true : has.has(`${r.entity_type}:${r.uuid}`),
          );
        }
      }

      filtered.sort((a, b) => b.source_coverage - a.source_coverage);
      setRows(filtered.slice(0, 60));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); /* initial */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const detailFor = (r: Row) => {
    if (r.entity_type === "artist") return `/artist/${r.pub_id}`;
    if (r.entity_type === "track") return `/track/${r.pub_id}`;
    return `${r.role === "producer" ? "/producer/" : "/writer/"}${r.pub_id}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" /> Discovery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="creator">Creators</SelectItem>
              <SelectItem value="artist">Artists</SelectItem>
              <SelectItem value="track">Tracks</SelectItem>
            </SelectContent>
          </Select>
          <Select value={role} onValueChange={(v) => setRole(v as RoleFilter)} disabled={kind !== "creator" && kind !== "all"}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any role</SelectItem>
              <SelectItem value="writer">Writer</SelectItem>
              <SelectItem value="producer">Producer</SelectItem>
              <SelectItem value="composer">Composer</SelectItem>
            </SelectContent>
          </Select>
          <Input className="h-8 text-xs" placeholder="Country (e.g. US)"
            value={country} onChange={(e) => setCountry(e.target.value)} />
          <Input className="h-8 text-xs" placeholder="Name contains…"
            value={text} onChange={(e) => setText(e.target.value)} />
          <Select value={String(minCoverage)} onValueChange={(v) => setMinCoverage(Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any sources</SelectItem>
              <SelectItem value="1">1+ source</SelectItem>
              <SelectItem value="2">2+ sources</SelectItem>
              <SelectItem value="3">3+ sources</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant={hasCredits ? "default" : "outline"}
            onClick={() => setHasCredits((v) => !v)} className="h-8 text-xs">
            Has credits
          </Button>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
            Apply filters
          </Button>
        </div>

        <div className="border-t border-border/50 pt-2">
          {rows.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">
              No matches. Loosen filters or seed more entities via the entity-resolver.
            </div>
          ) : (
            <div className="space-y-1 max-h-[420px] overflow-auto pr-1">
              {rows.map((r) => (
                <button
                  key={`${r.entity_type}:${r.uuid}`}
                  onClick={() => navigate(detailFor(r))}
                  className="w-full text-left flex items-center justify-between border border-border/40 rounded px-2 py-1.5 hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] capitalize">{r.entity_type}</Badge>
                      <span className="text-sm truncate">{r.display}</span>
                    </div>
                    {r.subtitle && (
                      <div className="text-xs text-muted-foreground truncate">{r.subtitle}</div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] ml-2 shrink-0">
                    {r.source_coverage} src
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}