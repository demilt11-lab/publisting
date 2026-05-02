import { supabase } from "@/integrations/supabase/client";
import type { EntityType } from "./entityResolver";
import { searchEntities as phase7Search } from "./publisting";

export interface EntityMatch {
  entity_type: EntityType;
  id: string;
  pub_id: string;
  name: string;
  title?: string;
  primary_artist_name?: string;
  isrc?: string | null;
  upc?: string | null;
  cover_url?: string | null;
  image_url?: string | null;
  release_date?: string | null;
  country?: string | null;
  primary_genre?: string | null;
  score: number;
  reason: string;
  external_ids?: Array<{ platform: string; external_id: string; url?: string | null; source?: string }>;
  source_coverage?: number;
}

export interface EntitySearchResult {
  success: boolean;
  query: string;
  parsed_kind: "url" | "isrc" | "upc" | "text";
  best_match: EntityMatch | null;
  alternates: EntityMatch[];
  confidence: number;
  types_searched: EntityType[];
  error?: string;
}

export async function searchEntities(
  query: string,
  opts: { types?: EntityType[]; platforms?: string[]; limit?: number } = {},
): Promise<EntitySearchResult> {
  try {
    // Prefer the Phase 7 canonical ranking endpoint. It returns ranked
    // search_documents rows which we map back into the EntityMatch shape
    // already consumed by EntityResultCard / EntityHub.
    const single = opts.types?.length === 1 ? opts.types[0] : undefined;
    const phase7 = await phase7Search({
      q: query,
      type: single,
      platform: opts.platforms?.[0],
      limit: opts.limit ?? 10,
    }).catch(() => null);

    if (phase7 && phase7.results && phase7.results.length > 0) {
      const matches: EntityMatch[] = phase7.results.map((r) => ({
        entity_type: r.entity_type as EntityType,
        id: r.pub_entity_id, // we don't expose UUIDs in Phase 7; pub_id doubles as id
        pub_id: r.pub_entity_id,
        name: r.display_name,
        title: r.entity_type === "track" || r.entity_type === "album" ? r.display_name : undefined,
        primary_artist_name: r.subtitle ?? undefined,
        score: r.confidence,
        reason: r.matched_on,
        external_ids: Object.entries(r.externals ?? {}).map(([platform, external_id]) => ({
          platform, external_id: String(external_id),
        })),
        source_coverage: r.source_count,
      }));
      const [best, ...rest] = matches;
      return {
        success: true,
        query,
        parsed_kind: phase7.query_type,
        best_match: best ?? null,
        alternates: rest,
        confidence: best?.score ?? 0,
        types_searched: opts.types ?? ["artist", "track", "album", "creator"],
      };
    }

    // Fallback to the legacy aggregator (lookups external sources when our
    // canonical index has no hit yet).
    const { data, error } = await supabase.functions.invoke("entity-search", {
      body: { query, ...opts },
    });
    if (error) {
      return {
        success: false, query, parsed_kind: "text",
        best_match: null, alternates: [], confidence: 0,
        types_searched: opts.types ?? ["artist", "track", "album"],
        error: error.message,
      };
    }
    return data as EntitySearchResult;
  } catch (e) {
    return {
      success: false, query, parsed_kind: "text",
      best_match: null, alternates: [], confidence: 0,
      types_searched: opts.types ?? ["artist", "track", "album"],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
