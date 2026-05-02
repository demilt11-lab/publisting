import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { detailPathFor } from "@/lib/entityRoutes";

interface Opportunity {
  pub_id: string;
  type: "artist" | "track" | "creator";
  primary_role?: string | null;
  name: string;
  subtitle?: string | null;
  source_count: number;
  reason: string;
}

/**
 * "Opportunities" — surfaces canonical entities with strong source coverage
 * that the team hasn't yet pinned/subscribed/added to outreach. Pure presentation
 * of existing data — no schema changes.
 */
export function OpportunityCard() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [creatorsRes, tracksRes] = await Promise.all([
          supabase.from("creators")
            .select("id, pub_creator_id, name, primary_role, country").limit(40),
          supabase.from("tracks")
            .select("id, pub_track_id, title, primary_artist_name").limit(40),
        ]);

        const creatorIds = (creatorsRes.data ?? []).map((c: any) => c.id);
        const trackIds = (tracksRes.data ?? []).map((t: any) => t.id);

        // Source coverage (external_ids) per entity
        const counts = new Map<string, number>();
        if (creatorIds.length) {
          const { data } = await supabase.from("external_ids")
            .select("entity_id").eq("entity_type", "creator").in("entity_id", creatorIds);
          for (const r of (data ?? []) as any[]) counts.set(`creator:${r.entity_id}`, (counts.get(`creator:${r.entity_id}`) ?? 0) + 1);
        }
        if (trackIds.length) {
          const { data } = await supabase.from("external_ids")
            .select("entity_id").eq("entity_type", "track").in("entity_id", trackIds);
          for (const r of (data ?? []) as any[]) counts.set(`track:${r.entity_id}`, (counts.get(`track:${r.entity_id}`) ?? 0) + 1);
        }

        // Already-pinned set (subscribed entities) — exclude
        const pinned = new Set<string>();
        const { data: subs } = await supabase.from("pub_alert_subscriptions").select("entity_type, entity_id");
        for (const s of (subs ?? []) as any[]) pinned.add(`${s.entity_type}:${s.entity_id}`);

        const out: Opportunity[] = [];
        for (const c of (creatorsRes.data ?? []) as any[]) {
          const sc = counts.get(`creator:${c.id}`) ?? 0;
          if (sc < 2 || pinned.has(`creator:${c.id}`)) continue;
          out.push({
            pub_id: c.pub_creator_id, type: "creator", primary_role: c.primary_role,
            name: c.name, subtitle: [c.primary_role, c.country].filter(Boolean).join(" · "),
            source_count: sc, reason: `${sc} verified sources, no one tracking yet`,
          });
        }
        for (const t of (tracksRes.data ?? []) as any[]) {
          const sc = counts.get(`track:${t.id}`) ?? 0;
          if (sc < 2 || pinned.has(`track:${t.id}`)) continue;
          out.push({
            pub_id: t.pub_track_id, type: "track", name: t.title,
            subtitle: t.primary_artist_name, source_count: sc,
            reason: `${sc} platform IDs confirmed, untracked`,
          });
        }

        out.sort((a, b) => b.source_count - a.source_count);
        if (alive) setItems(out.slice(0, 5));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Opportunities to scout
          <Badge variant="outline" className="text-[10px]">canonical · untracked</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Scoring entities…</div>
        ) : (
          <div className="space-y-1.5">
            {items.map((o) => {
              const href = detailPathFor({
                entity_type: o.type,
                pub_id: o.pub_id,
                primary_role: o.primary_role ?? undefined,
              }) ?? "#";
              return (
                <Link key={`${o.type}:${o.pub_id}`} to={href}
                  className="flex items-center justify-between border border-border/40 rounded px-2 py-2 hover:bg-muted/30 group">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] capitalize">{o.type}</Badge>
                      <span className="text-sm truncate">{o.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{o.subtitle}</div>
                    <div className="text-[10px] text-primary/80 mt-0.5">{o.reason}</div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground shrink-0 ml-2" />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}