import { supabase } from "@/integrations/supabase/client";

interface ConflictInput {
  songTitle: string;
  songArtist: string;
  fieldName: string;
  source1: string;
  value1: string;
  confidence1: number;
  source2: string;
  value2: string;
  confidence2: number;
}

/**
 * Detect and log a data conflict when two sources disagree on a field value.
 * Only logs if the values are meaningfully different (case-insensitive).
 */
export async function detectConflict(input: ConflictInput): Promise<boolean> {
  const v1 = input.value1.trim().toLowerCase();
  const v2 = input.value2.trim().toLowerCase();

  // Skip if values match
  if (v1 === v2) return false;

  // Skip trivial differences (one is substring of other)
  if (v1.includes(v2) || v2.includes(v1)) return false;

  try {
    // Check if this conflict already exists
    const { data: existing } = await supabase
      .from("data_conflicts")
      .select("id")
      .eq("song_title", input.songTitle)
      .eq("song_artist", input.songArtist)
      .eq("field_name", input.fieldName)
      .eq("status", "unresolved")
      .limit(1);

    if (existing && existing.length > 0) return false;

    await supabase.from("data_conflicts").insert({
      song_title: input.songTitle,
      song_artist: input.songArtist,
      field_name: input.fieldName,
      source_1: input.source1,
      value_1: input.value1,
      confidence_1: input.confidence1,
      source_2: input.source2,
      value_2: input.value2,
      confidence_2: input.confidence2,
      status: "unresolved",
    });

    return true;
  } catch (e) {
    console.warn("Failed to log conflict:", e);
    return false;
  }
}

/**
 * Check how many unresolved conflicts exist for a given credit name + song.
 */
export async function getConflictCount(
  songTitle: string,
  songArtist: string,
  fieldName?: string
): Promise<number> {
  try {
    let query = supabase
      .from("data_conflicts")
      .select("id", { count: "exact", head: true })
      .eq("song_title", songTitle)
      .eq("song_artist", songArtist)
      .eq("status", "unresolved");

    if (fieldName) query = query.eq("field_name", fieldName);

    const { count } = await query;
    return count || 0;
  } catch {
    return 0;
  }
}
