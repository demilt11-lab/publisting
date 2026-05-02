import { supabase } from "@/integrations/supabase/client";
import type { EntityType } from "./entityResolver";

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
