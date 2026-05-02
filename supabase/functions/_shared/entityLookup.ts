import { createClient } from "npm:@supabase/supabase-js@2.45.0";

export type EntityType = "artist" | "track" | "album" | "creator";

export interface ResolvedEntity {
  uuid: string;
  pub_entity_id: string;
  entity_type: EntityType;
  display_name: string;
  subtitle?: string | null;
  primary_role?: string | null;
  raw: Record<string, unknown>;
}

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  );
}

export async function resolveEntity(
  sb: ReturnType<typeof getServiceClient>,
  entity_type: EntityType,
  pub_entity_id: string,
): Promise<ResolvedEntity | null> {
  if (entity_type === "artist") {
    const { data } = await sb.from("artists").select("*").eq("pub_artist_id", pub_entity_id).maybeSingle();
    if (!data) return null;
    return {
      uuid: (data as any).id, pub_entity_id, entity_type, display_name: (data as any).name,
      subtitle: [(data as any).primary_genre, (data as any).country].filter(Boolean).join(" · "),
      raw: data as any,
    };
  }
  if (entity_type === "track") {
    const { data } = await sb.from("tracks").select("*").eq("pub_track_id", pub_entity_id).maybeSingle();
    if (!data) return null;
    return {
      uuid: (data as any).id, pub_entity_id, entity_type, display_name: (data as any).title,
      subtitle: (data as any).primary_artist_name,
      raw: data as any,
    };
  }
  if (entity_type === "album") {
    const { data } = await sb.from("albums").select("*").eq("pub_album_id", pub_entity_id).maybeSingle();
    if (!data) return null;
    return {
      uuid: (data as any).id, pub_entity_id, entity_type, display_name: (data as any).title,
      subtitle: (data as any).primary_artist_name,
      raw: data as any,
    };
  }
  const { data } = await sb.from("creators").select("*").eq("pub_creator_id", pub_entity_id).maybeSingle();
  if (!data) return null;
  return {
    uuid: (data as any).id, pub_entity_id, entity_type, display_name: (data as any).name,
    subtitle: [(data as any).primary_role, (data as any).country].filter(Boolean).join(" · "),
    primary_role: (data as any).primary_role,
    raw: data as any,
  };
}

/** Parse `{ entity_type, pub_entity_id }` from POST body or query string. */
export async function parseEntityRequest(req: Request): Promise<{ entity_type: EntityType; pub_entity_id: string } | null> {
  let entity_type: string | null = null;
  let pub_entity_id: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      entity_type = body.entity_type ?? null;
      pub_entity_id = body.pub_entity_id ?? null;
    } catch { /* fallthrough to query */ }
  }
  if (!entity_type || !pub_entity_id) {
    const u = new URL(req.url);
    entity_type = entity_type ?? u.searchParams.get("entity_type");
    pub_entity_id = pub_entity_id ?? u.searchParams.get("pub_entity_id");
  }
  if (!entity_type || !pub_entity_id) return null;
  if (!["artist", "track", "album", "creator"].includes(entity_type)) return null;
  return { entity_type: entity_type as EntityType, pub_entity_id };
}

export function summarizeTrust(externals: any[], conflicts: number, coverage: number) {
  const sourceCount = new Set((externals ?? []).map((e: any) => e.platform)).size;
  const confidence = Math.min(1, sourceCount / 4);
  const conflict_state = conflicts > 1 ? "high" : conflicts === 1 ? "medium" : "low";
  return { confidence: Number(confidence.toFixed(2)), coverage_score: Number(Math.min(1, coverage).toFixed(2)), conflict_state, source_count: sourceCount };
}