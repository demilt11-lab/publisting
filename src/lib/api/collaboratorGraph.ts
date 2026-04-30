import { supabase } from "@/integrations/supabase/client";

export interface CollabEdge {
  id: string;
  source_name: string;
  target_name: string;
  edge_type: string;
  track_count: number;
  weight: number;
  last_seen_at: string;
}

function norm(s: string): string {
  return (s || "").trim();
}

/**
 * Persist co-writer / co-producer / shared-publisher edges from a single
 * track's credits. Idempotent via unique (source_name, target_name, edge_type).
 */
export async function recordTrackCollaborators(args: {
  writers: string[];
  producers: string[];
  publishers: string[];
}): Promise<number> {
  const w = args.writers.map(norm).filter(Boolean);
  const p = args.producers.map(norm).filter(Boolean);
  const pubs = args.publishers.map(norm).filter(Boolean);

  const rows: Array<Pick<CollabEdge, "source_name" | "target_name" | "edge_type">> = [];
  const pair = (a: string[], type: string) => {
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const [s, t] = [a[i], a[j]].sort();
      rows.push({ source_name: s, target_name: t, edge_type: type });
    }
  };
  pair(w, "co_writer");
  pair(p, "co_producer");
  // Cross writers↔publishers (signed-to)
  for (const writer of w) for (const pub of pubs) {
    const [s, t] = [writer, pub].sort();
    rows.push({ source_name: s, target_name: t, edge_type: "shared_publisher" });
  }
  if (!rows.length) return 0;

  // Upsert via fetch-then-insert/update because postgres-js doesn't increment counters easily
  let written = 0;
  for (const r of rows) {
    const { data: existing } = await supabase.from("collaborator_edges")
      .select("id, track_count, weight")
      .eq("source_name", r.source_name).eq("target_name", r.target_name).eq("edge_type", r.edge_type)
      .maybeSingle();
    if (existing) {
      await supabase.from("collaborator_edges").update({
        track_count: (existing.track_count || 0) + 1,
        weight: Math.min(20, (existing.weight || 1) + 0.5),
        last_seen_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("collaborator_edges").insert({ ...r });
    }
    written++;
  }
  return written;
}

export async function fetchCollaboratorsForName(name: string, limit = 60): Promise<CollabEdge[]> {
  const n = norm(name);
  if (!n) return [];
  const { data, error } = await supabase
    .from("collaborator_edges")
    .select("id, source_name, target_name, edge_type, track_count, weight, last_seen_at")
    .or(`source_name.eq.${n},target_name.eq.${n}`)
    .order("track_count", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []) as CollabEdge[];
}