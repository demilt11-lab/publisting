import { supabase } from "@/integrations/supabase/client";

export type EntityType = "artist" | "track" | "album" | "creator";

export interface ExternalIdInput {
  platform: string;
  external_id: string;
  url?: string | null;
  confidence?: number;
  source?: string;
}

export interface ResolveEntityInput {
  entity_type: EntityType;
  name?: string;
  title?: string;
  primary_artist_name?: string;
  isrc?: string;
  upc?: string;
  release_date?: string;
  cover_url?: string;
  duration_ms?: number;
  language?: string;
  country?: string;
  primary_genre?: string;
  image_url?: string;
  label?: string;
  /** Creator-only: writer | producer | composer | mixed */
  primary_role?: string;
  /** Creator-only: known aliases */
  aliases?: string[];
  /** Creator-only */
  ipi?: string;
  pro?: string;
  metadata?: Record<string, unknown>;
  external_ids?: ExternalIdInput[];
  provenance?: Array<{
    field_name: string;
    field_value?: string | null;
    source: string;
    confidence?: number;
  }>;
}

export interface ResolveResult {
  entity_type: EntityType;
  pub_id: string | null;
  uuid: string | null;
  created: boolean;
  error?: string;
}

export async function resolveEntities(
  entities: ResolveEntityInput[],
): Promise<ResolveResult[]> {
  if (!entities.length) return [];
  try {
    const { data, error } = await supabase.functions.invoke("entity-resolver", {
      body: { entities },
    });
    if (error) {
      console.warn("entity-resolver error", error);
      return [];
    }
    return (data?.results ?? []) as ResolveResult[];
  } catch (e) {
    console.warn("entity-resolver exception", e);
    return [];
  }
}

/** Convenience: resolve one entity, return its pub_id (or null on failure). */
export async function resolveOne(
  input: ResolveEntityInput,
): Promise<{ pub_id: string | null; uuid: string | null }> {
  const [r] = await resolveEntities([input]);
  return { pub_id: r?.pub_id ?? null, uuid: r?.uuid ?? null };
}
