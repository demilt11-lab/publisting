// Shared helpers for provider-specific sync workers.
// Each worker resolves an entity, fetches from a provider, upserts external_ids,
// records field_provenance, logs the refresh attempt, and refreshes search_documents.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { resolveEntity, type EntityType, type ResolvedEntity } from "./entityLookup.ts";

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
    onConflict: "entity_type,entity_id,platform,external_id",
  });
  if (error) console.warn(`[${source}] external_ids upsert`, error.message);
  return rows.length;
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
  const { error } = await client.from("field_provenance").insert(rows);
  if (error) console.warn(`[${source}] field_provenance insert`, error.message);
  return rows.length;
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
  try {
    const out = await fetcher({ client, entity, source });
    const links = await upsertExternalLinks(client, entity, source, out.links);
    const fields = await recordFields(client, entity, source, out.fields);
    await bumpRefreshedAt(client, entity);
    await refreshSearchDoc(client, entity);
    const status: "ok" | "partial" = (links + fields) > 0 ? "ok" : "partial";
    await endRefreshLog(client, log_id, status, { ...(out.metadata ?? {}), links, fields });
    return { source, entity_type, pub_entity_id, links_upserted: links, fields_recorded: fields, status, metadata: out.metadata };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await endRefreshLog(client, log_id, "error", {}, msg);
    return { source, entity_type, pub_entity_id, links_upserted: 0, fields_recorded: 0, status: "error", error: msg };
  }
}