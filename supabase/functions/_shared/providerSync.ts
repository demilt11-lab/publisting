// Shared helpers for provider-specific sync workers.
// Each worker resolves an entity, fetches from a provider, upserts external_ids,
// records field_provenance, logs the refresh attempt, and refreshes search_documents.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { resolveEntity, type EntityType, type ResolvedEntity } from "./entityLookup.ts";
import {
  validateTrackMetadata,
  validateArtistMetadata,
  confidenceFromSources,
} from "./metadataValidation.ts";

export type SB = ReturnType<typeof createClient>;

export function sb(): SB {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  );
}

export interface SyncContext {
  client: SB;
  entity: ResolvedEntity;
  source: string;
  /** Push raw candidate matches into the debug log for this run. */
  recordMatch: (input: MatchDebug) => void;
}

export interface SyncReport {
  source: string;
  entity_type: EntityType;
  pub_entity_id: string;
  links_upserted: number;
  fields_recorded: number;
  status: "ok" | "partial" | "error";
  error?: string | null;
  metadata?: Record<string, unknown>;
  match_run_id?: string | null;
}

export interface MatchCandidate {
  external_id?: string | null;
  display_name?: string | null;
  score?: number | null;
  reason?: string | null;
  raw?: Record<string, unknown>;
}

export interface MatchDebug {
  query_used?: string | null;
  candidates: MatchCandidate[];
  chosen?: MatchCandidate | null;
  rejected?: MatchCandidate[];
  score_breakdown?: Record<string, number>;
  conflict_reasons?: string[];
  confidence_contribution?: number | null;
}

export async function startRefreshLog(
  client: SB, source: string, entity: ResolvedEntity, reason = "manual",
): Promise<string | null> {
  const { data } = await client.from("entity_refresh_log").insert({
    entity_type: entity.entity_type,
    pub_entity_id: entity.pub_entity_id,
    refresh_reason: reason,
    source,
    status: "running",
    started_at: new Date().toISOString(),
  }).select("id").maybeSingle();
  return (data as any)?.id ?? null;
}

export async function endRefreshLog(
  client: SB, id: string | null, status: "ok" | "partial" | "error",
  metadata?: Record<string, unknown>, error_text?: string | null,
) {
  if (!id) return;
  await client.from("entity_refresh_log").update({
    status, completed_at: new Date().toISOString(),
    metadata: metadata ?? {}, error_text: error_text ?? null,
  }).eq("id", id);
}

export async function upsertExternalLinks(
  client: SB, entity: ResolvedEntity, source: string,
  links: Array<{ platform: string; external_id: string; url?: string; confidence?: number }>,
): Promise<number> {
  if (!links.length) return 0;
  const rows = links
    .filter((l) => l.platform && l.external_id)
    .map((l) => ({
      entity_type: entity.entity_type,
      entity_id: entity.uuid,
      platform: l.platform,
      external_id: l.external_id,
      url: l.url ?? null,
      source,
      confidence: l.confidence ?? 0.85,
    }));
  if (!rows.length) return 0;
  const { error } = await client.from("external_ids").upsert(rows, {
    onConflict: "entity_type,platform,external_id",
  });
  if (error) console.warn(`[${source}] external_ids upsert`, error.message);
  return error ? 0 : rows.length;
}

export async function recordFields(
  client: SB, entity: ResolvedEntity, source: string,
  fields: Array<{ field: string; value: string | null; confidence?: number }>,
): Promise<number> {
  if (!fields.length) return 0;
  const rows = fields
    .filter((f) => f.value !== null && f.value !== undefined && String(f.value).trim() !== "")
    .map((f) => ({
      entity_type: entity.entity_type,
      entity_id: entity.uuid,
      pub_entity_id: entity.pub_entity_id,
      field_name: f.field,
      field_value: String(f.value),
      normalized_value: String(f.value).toLowerCase().trim(),
      source_value: String(f.value),
      source,
      confidence: f.confidence ?? 0.85,
      conflict_state: "low",
    }));
  if (!rows.length) return 0;
  const { error } = await client.from("field_provenance").upsert(rows, {
    onConflict: "entity_type,entity_id,field_name,source",
  });
  if (error) console.warn(`[${source}] field_provenance insert`, error.message);
  return error ? 0 : rows.length;
}

export async function bumpRefreshedAt(client: SB, entity: ResolvedEntity) {
  const table = entity.entity_type === "artist" ? "artists"
    : entity.entity_type === "track" ? "tracks"
    : entity.entity_type === "album" ? "albums" : "creators";
  const id_col = entity.entity_type === "artist" ? "pub_artist_id"
    : entity.entity_type === "track" ? "pub_track_id"
    : entity.entity_type === "album" ? "pub_album_id" : "pub_creator_id";
  await client.from(table).update({ last_refreshed_at: new Date().toISOString() })
    .eq(id_col, entity.pub_entity_id);
}

export async function refreshSearchDoc(client: SB, entity: ResolvedEntity) {
  await client.rpc("pub_refresh_search_document", {
    _entity_type: entity.entity_type,
    _pub_entity_id: entity.pub_entity_id,
  });
}

/**
 * Validate the data we just pulled from a provider and upsert a row in
 * public.search_result_quality. Merges this provider's per-source breakdown
 * with any existing breakdown so confidence reflects all known sources.
 */
export async function recordQuality(
  client: SB,
  entity: ResolvedEntity,
  source: string,
  data: Record<string, any>,
): Promise<void> {
  try {
    const validator = entity.entity_type === "track" || entity.entity_type === "album"
      ? validateTrackMetadata
      : validateArtistMetadata;
    const result = validator(data);

    const { data: existing } = await client.from("search_result_quality")
      .select("source_breakdown, validation_flags, missing_fields, warnings, last_validated_at, completeness_score")
      .eq("entity_type", entity.entity_type)
      .eq("entity_id", entity.uuid)
      .maybeSingle();

    const breakdown: Record<string, any> = { ...((existing as any)?.source_breakdown ?? {}) };
    breakdown[source] = {
      is_valid: result.is_valid,
      completeness_score: result.completeness_score,
      flags: result.flags,
      validated_at: new Date().toISOString(),
    };

    const sources = Object.keys(breakdown);
    const confidence = confidenceFromSources(sources);
    const bestCompleteness = Math.max(
      result.completeness_score,
      ...sources.map((s) => Number(breakdown[s]?.completeness_score ?? 0)),
    );

    const flagSet = new Set<string>([
      ...(((existing as any)?.validation_flags ?? []) as string[]),
      ...result.flags,
    ]);
    // Stale check
    const lastVal = (existing as any)?.last_validated_at;
    if (lastVal && Date.now() - new Date(lastVal).getTime() > 30 * 24 * 60 * 60 * 1000) {
      flagSet.add("stale_data");
    } else {
      flagSet.delete("stale_data");
    }

    const missingSet = new Set<string>([
      ...(((existing as any)?.missing_fields ?? []) as string[]),
      ...result.missing_fields,
    ]);
    const warnings = [
      ...(((existing as any)?.warnings ?? []) as string[]),
      ...result.warnings.map((w) => `[${source}] ${w}`),
    ].slice(-50);

    await client.from("search_result_quality").upsert({
      entity_type: entity.entity_type,
      entity_id: entity.uuid,
      completeness_score: bestCompleteness,
      confidence_score: confidence,
      validation_flags: Array.from(flagSet),
      missing_fields: Array.from(missingSet),
      warnings,
      source_breakdown: breakdown,
      last_validated_at: new Date().toISOString(),
    }, { onConflict: "entity_type,entity_id" });
  } catch (e) {
    console.warn(`[${source}] recordQuality failed`, e instanceof Error ? e.message : e);
  }
}

export async function recordProviderMatchRun(
  client: SB, source: string, entity: ResolvedEntity,
  refresh_log_id: string | null, debug: MatchDebug | null,
  status: "ok" | "partial" | "error", error_text: string | null,
): Promise<string | null> {
  if (!debug) debug = { candidates: [], chosen: null, rejected: [] };
  const { data, error } = await client.from("provider_match_runs").insert({
    refresh_log_id,
    provider: source,
    entity_type: entity.entity_type,
    pub_entity_id: entity.pub_entity_id,
    query_used: debug.query_used ?? null,
    candidates: debug.candidates ?? [],
    chosen: debug.chosen ?? null,
    rejected: debug.rejected ?? [],
    score_breakdown: debug.score_breakdown ?? {},
    conflict_reasons: debug.conflict_reasons ?? [],
    confidence_contribution: debug.confidence_contribution ?? null,
    status,
    error_text,
  }).select("id").maybeSingle();
  if (error) console.warn(`[${source}] provider_match_runs insert`, error.message);
  return (data as any)?.id ?? null;
}

/** End-to-end runner used by every provider worker. */
export async function runProviderSync(
  source: string,
  req: Request,
  fetcher: (ctx: SyncContext) => Promise<{
    links: Array<{ platform: string; external_id: string; url?: string; confidence?: number }>;
    fields: Array<{ field: string; value: string | null; confidence?: number }>;
    metadata?: Record<string, unknown>;
  }>,
): Promise<SyncReport> {
  const client = sb();
  let entity_type: EntityType | null = null;
  let pub_entity_id: string | null = null;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    entity_type = (body.entity_type ?? url.searchParams.get("entity_type")) as EntityType | null;
    pub_entity_id = body.pub_entity_id ?? url.searchParams.get("pub_entity_id");
  } catch { /* ignore */ }

  if (!entity_type || !pub_entity_id) {
    return { source, entity_type: "artist", pub_entity_id: "", links_upserted: 0, fields_recorded: 0, status: "error", error: "missing entity_type or pub_entity_id" };
  }

  const entity = await resolveEntity(client, entity_type, pub_entity_id);
  if (!entity) {
    return { source, entity_type, pub_entity_id, links_upserted: 0, fields_recorded: 0, status: "error", error: "entity not found" };
  }

  const log_id = await startRefreshLog(client, source, entity, "provider_sync");
  let debug: MatchDebug = { candidates: [], chosen: null, rejected: [] };
  const recordMatch = (input: MatchDebug) => {
    debug = {
      query_used: input.query_used ?? debug.query_used,
      candidates: [...(debug.candidates ?? []), ...(input.candidates ?? [])],
      chosen: input.chosen ?? debug.chosen,
      rejected: [...(debug.rejected ?? []), ...(input.rejected ?? [])],
      score_breakdown: { ...(debug.score_breakdown ?? {}), ...(input.score_breakdown ?? {}) },
      conflict_reasons: [...(debug.conflict_reasons ?? []), ...(input.conflict_reasons ?? [])],
      confidence_contribution: input.confidence_contribution ?? debug.confidence_contribution ?? null,
    };
  };
  try {
    const out = await fetcher({ client, entity, source, recordMatch });
    const links = await upsertExternalLinks(client, entity, source, out.links);
    const fields = await recordFields(client, entity, source, out.fields);
    await bumpRefreshedAt(client, entity);
    await refreshSearchDoc(client, entity);
    // Auto-score this provider's response into search_result_quality.
    const fieldMap: Record<string, any> = {};
    for (const f of out.fields ?? []) {
      if (f.value != null) fieldMap[f.field] = f.value;
    }
    const externalIds: Record<string, string> = {};
    for (const l of out.links ?? []) {
      if (l.platform && l.external_id) externalIds[l.platform] = l.external_id;
    }
    const validationData = {
      ...(entity.raw as any ?? {}),
      ...fieldMap,
      ...(out.metadata ?? {}),
      external_ids: { ...externalIds, ...((entity.raw as any)?.external_ids ?? {}) },
    };
    await recordQuality(client, entity, source, validationData);
    const status: "ok" | "partial" = (links + fields) > 0 ? "ok" : "partial";
    const match_run_id = await recordProviderMatchRun(client, source, entity, log_id, debug, status, null);
    await endRefreshLog(client, log_id, status, { ...(out.metadata ?? {}), links, fields });
    return { source, entity_type, pub_entity_id, links_upserted: links, fields_recorded: fields, status, metadata: out.metadata, match_run_id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const match_run_id = await recordProviderMatchRun(client, source, entity, log_id, debug, "error", msg);
    await endRefreshLog(client, log_id, "error", {}, msg);
    return { source, entity_type, pub_entity_id, links_upserted: 0, fields_recorded: 0, status: "error", error: msg, match_run_id };
  }
}