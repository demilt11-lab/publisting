import type { EntityType } from "@/lib/api/entityResolver";

/**
 * Single source of truth for canonical detail-page URLs.
 * Returns null if there is no pub_* ID — callers should fall back to the legacy text flow.
 */
export function detailPathFor(input: {
  entity_type?: EntityType | "writer" | "producer" | string | null;
  pub_id?: string | null;
  pub_artist_id?: string | null;
  pub_track_id?: string | null;
  pub_creator_id?: string | null;
  primary_role?: string | null;
}): string | null {
  const t = input.entity_type;
  const pubId = input.pub_id ?? input.pub_artist_id ?? input.pub_track_id ?? input.pub_creator_id ?? null;
  if (!pubId) return null;
  if (t === "artist" || (input.pub_artist_id && !input.pub_track_id && !input.pub_creator_id)) {
    return `/artist/${pubId}`;
  }
  if (t === "track" || (input.pub_track_id && !input.pub_creator_id)) {
    return `/track/${pubId}`;
  }
  if (t === "writer") return `/writer/${pubId}`;
  if (t === "producer") return `/producer/${pubId}`;
  if (t === "creator" || input.pub_creator_id) {
    return (input.primary_role === "producer") ? `/producer/${pubId}` : `/writer/${pubId}`;
  }
  return null;
}