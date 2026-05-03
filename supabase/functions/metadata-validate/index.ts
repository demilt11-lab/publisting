// Validates Spotify/Soundcharts/Genius API responses and persists scoring
// to public.search_result_quality. Called by other edge functions after
// they fetch external data, or directly by the client for ad-hoc checks.
import { createClient } from "npm:@supabase/supabase-js@2";
import { validateTrackMetadata, validateArtistMetadata, confidenceFromSources, ValidationResult } from "../_shared/metadataValidation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  entity_type: "track" | "artist" | "creator" | "album";
  entity_id: string;
  data?: Record<string, any>;
  source?: string;
  // Optional pre-aggregated breakdown { spotify: {...}, soundcharts: {...}, genius: {...} }
  sources?: Record<string, any>;
  persist?: boolean; // default true
}

function staleAfterDays(updatedAt?: string | null): boolean {
  if (!updatedAt) return false;
  const ms = Date.now() - new Date(updatedAt).getTime();
  return ms > 30 * 24 * 60 * 60 * 1000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body?.entity_type || !body?.entity_id) {
      return new Response(JSON.stringify({ error: "entity_type and entity_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sources = body.sources ?? (body.data && body.source ? { [body.source]: body.data } : {});
    const sourceKeys = Object.keys(sources);
    const validator = body.entity_type === "track" || body.entity_type === "album"
      ? validateTrackMetadata : validateArtistMetadata;

    // Validate each source; merge flags/missing/warnings
    const perSource: Record<string, ValidationResult> = {};
    let mergedMissing = new Set<string>();
    let mergedWarnings: string[] = [];
    let mergedFlags = new Set<string>();
    let bestCompleteness = 0;

    if (sourceKeys.length === 0 && body.data) {
      const r = validator(body.data);
      perSource["unknown"] = r;
      r.missing_fields.forEach((m) => mergedMissing.add(m));
      r.flags.forEach((f) => mergedFlags.add(f));
      mergedWarnings.push(...r.warnings);
      bestCompleteness = r.completeness_score;
    } else {
      for (const key of sourceKeys) {
        const r = validator(sources[key]);
        perSource[key] = r;
        r.missing_fields.forEach((m) => mergedMissing.add(m));
        r.flags.forEach((f) => mergedFlags.add(f));
        mergedWarnings.push(...r.warnings.map((w) => `[${key}] ${w}`));
        if (r.completeness_score > bestCompleteness) bestCompleteness = r.completeness_score;
      }
    }

    // Confidence weighted by source reliability + agreement
    const confidence = confidenceFromSources(sourceKeys.length ? sourceKeys : ["unknown"]);

    // Stale check via existing record
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (body.persist !== false) {
      const { data: existing } = await sb.from("search_result_quality")
        .select("last_validated_at").eq("entity_type", body.entity_type).eq("entity_id", body.entity_id).maybeSingle();
      if (existing && staleAfterDays(existing.last_validated_at)) mergedFlags.add("stale_data");

      await sb.from("search_result_quality").upsert({
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        completeness_score: bestCompleteness,
        confidence_score: confidence,
        validation_flags: Array.from(mergedFlags),
        missing_fields: Array.from(mergedMissing),
        warnings: mergedWarnings.slice(0, 50),
        source_breakdown: Object.fromEntries(
          Object.entries(perSource).map(([k, v]) => [k, { is_valid: v.is_valid, completeness_score: v.completeness_score, flags: v.flags }]),
        ),
        last_validated_at: new Date().toISOString(),
      }, { onConflict: "entity_type,entity_id" });
    }

    return new Response(JSON.stringify({
      ok: true,
      is_valid: mergedMissing.size === 0,
      missing_fields: Array.from(mergedMissing),
      warnings: mergedWarnings,
      flags: Array.from(mergedFlags),
      completeness_score: bestCompleteness,
      confidence_score: confidence,
      per_source: perSource,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});