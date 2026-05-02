/**
 * Publisting typed API client.
 * Wraps Phase 7 edge functions with typed helpers + canonical detail-path routing.
 * Use these everywhere instead of raw `supabase.functions.invoke()` calls.
 */
import { supabase } from "@/integrations/supabase/client";

export type EntityType = "artist" | "track" | "album" | "creator";

export interface SearchResult {
  entity_type: EntityType;
  pub_entity_id: string;
  display_name: string;
  subtitle?: string | null;
  matched_on: string;
  confidence: number;
  trust_score: number;
  source_count: number;
  externals: Record<string, string>;
  detail_path: string;
}

export interface SearchResponse {
  query: string;
  query_type: "text" | "url" | "isrc" | "upc";
  results: SearchResult[];
  total: number;
}

async function callFn<T>(name: string, body?: Record<string, unknown>, opts?: { method?: "GET" | "POST" }): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    body: body ?? {},
    method: opts?.method ?? "POST",
  });
  if (error) throw error;
  return data as T;
}

/* ------------------------------ Search ------------------------------ */

export function searchEntities(input: {
  q: string;
  type?: EntityType;
  platform?: string;
  region?: string;
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  return callFn<SearchResponse>("search-entities", input as any);
}

export interface SuggestResult {
  entity_type: EntityType;
  pub_entity_id: string;
  display_name: string;
  subtitle?: string | null;
  detail_path: string;
}

export async function suggestEntities(q: string, opts?: { type?: EntityType; limit?: number }): Promise<SuggestResult[]> {
  if (!q.trim()) return [];
  const u = new URLSearchParams({ q, ...(opts?.type ? { type: opts.type } : {}), ...(opts?.limit ? { limit: String(opts.limit) } : {}) });
  const { data, error } = await supabase.functions.invoke(`suggest-entities?${u.toString()}`, { method: "GET" });
  if (error) throw error;
  return ((data as any)?.results ?? []) as SuggestResult[];
}

export interface ResolvedUrlPayload {
  resolved: boolean;
  parsed?: { platform: string; external_id: string; canonical_url: string; entity_hint?: string };
  entity_type?: EntityType | null;
  pub_entity_id?: string | null;
  display_name?: string | null;
  detail_path?: string | null;
  reason?: string;
}

export function resolveUrl(url: string): Promise<ResolvedUrlPayload> {
  return callFn<ResolvedUrlPayload>("resolve-url", { url });
}

/* ----------------------- Entity detail endpoints ----------------------- */

const entityCall = <T,>(name: string) => (entity_type: EntityType, pub_entity_id: string) =>
  callFn<T>(name, { entity_type, pub_entity_id });

export interface EntityOverview {
  entity_type: EntityType;
  pub_entity_id: string;
  name: string;
  subtitle?: string | null;
  stats: Record<string, number>;
  externals: Array<{ platform: string; external_id: string; url?: string; source?: string; confidence: number }>;
  trust: { confidence: number; coverage_score: number; conflict_state: "low" | "medium" | "high"; source_count: number };
  raw?: Record<string, unknown>;
}
export const getEntityOverview = entityCall<EntityOverview>("entity-overview");

export interface EntityCredit {
  pub_creator_id?: string;
  pub_track_id?: string;
  name?: string;
  track_title?: string;
  track_artist?: string;
  role: string;
  share?: number | null;
  confidence: number;
  source_count?: number;
  sources: string[];
}
export interface EntityCreditsPayload { pub_entity_id: string; entity_type: EntityType; credits: EntityCredit[] }
export const getEntityCredits = entityCall<EntityCreditsPayload>("entity-credits");

export interface RelatedNode { pub_entity_id: string; entity_type: EntityType; relationship_type: string; weight: number }
export const getEntityRelated = entityCall<{ pub_entity_id: string; entity_type: EntityType; related: RelatedNode[] }>("entity-related");

export const getEntityCharts = entityCall<{
  pub_entity_id: string; entity_type: EntityType;
  history: Array<{ platform: string; chart_type: string; country: string | null; rank: number; date: string }>;
  peaks: any[];
}>("entity-charts");

export const getEntityPlaylists = entityCall<{
  pub_entity_id: string; entity_type: EntityType;
  placements: Array<{ platform: string; playlist_id: string; playlist_name: string | null; position: number | null; followers: number | null; date: string }>;
  summary: { total: number; unique_playlists: number };
}>("entity-playlists");

export const getEntityAirplay = entityCall<{
  pub_entity_id: string; entity_type: EntityType;
  airplay: Array<{ territory: string | null; station: string | null; spins: number; captured_at: string }>;
  summary: { total_spins: number; stations: number };
}>("entity-airplay");

export const getEntityProvenance = entityCall<{
  pub_entity_id: string; entity_type: EntityType;
  fields: Array<{ field: string; sources: string[]; conflict_state: "low" | "medium" | "high"; records: any[] }>;
}>("entity-provenance");

export const getEntityNetwork = entityCall<{
  pub_entity_id: string; entity_type: EntityType;
  nodes: Array<{ id: string; label: string; type: EntityType; weight?: number; root?: boolean }>;
  edges: Array<{ source: string; target: string; weight: number; role?: string }>;
  summary: { top_collaborators: number; repeat_collaborators: number };
}>("entity-network");

export const getEntityOpportunities = entityCall<{
  pub_entity_id: string; entity_type: EntityType;
  opportunities: Array<{ kind: string; reason: string; weight: number }>;
}>("entity-opportunities");

/* ----------------------- Refresh & saved queries ----------------------- */

export const refreshEntity = entityCall<{ refreshed: boolean; error: string | null }>("refresh-entity");

export interface SavedQuery {
  id: string;
  user_id: string;
  name: string;
  query_json: Record<string, unknown>;
  query_hash: string;
  is_subscribed: boolean;
  created_at: string;
  updated_at: string;
}

function hashQueryJson(q: Record<string, unknown>): string {
  const ordered = JSON.stringify(q, Object.keys(q).sort());
  let h = 0;
  for (let i = 0; i < ordered.length; i++) h = (Math.imul(31, h) + ordered.charCodeAt(i)) | 0;
  return `q_${(h >>> 0).toString(16)}`;
}

export async function createSavedQuery(input: { name: string; query_json: Record<string, unknown> }): Promise<SavedQuery | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase.from("saved_queries").insert({
    user_id: u.user.id,
    name: input.name,
    query_json: input.query_json as any,
    query_hash: hashQueryJson(input.query_json),
  } as any).select().single();
  if (error) { console.warn("createSavedQuery", error); return null; }
  return data as SavedQuery;
}

export async function listSavedQueries(): Promise<SavedQuery[]> {
  const { data, error } = await supabase.from("saved_queries").select("*")
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as SavedQuery[];
}

export interface SavedQueryRunResult { result_count: number; added: number; removed: number }
export function runSavedQuery(saved_query_id: string): Promise<SavedQueryRunResult> {
  return callFn<SavedQueryRunResult>("run-saved-query", { saved_query_id });
}

/* ----------------------- API auth ----------------------- */

export interface AccessToken { access_token: string; token_type: "bearer"; expires_in: number; scope: string }
export function exchangeApiToken(refresh_token: string): Promise<AccessToken> {
  return callFn<AccessToken>("api-token-exchange", { refresh_token });
}
export function revokeApiRefreshToken(refresh_token: string): Promise<{ revoked: boolean }> {
  return callFn<{ revoked: boolean }>("api-revoke-refresh-token", { refresh_token });
}

/* ----------------------- Telemetry ----------------------- */

/** Log a search event (best-effort, never throws). */
export async function logSearchEvent(input: {
  query: string;
  query_type?: string;
  entity_type?: EntityType | null;
  pub_entity_id?: string | null;
  clicked_rank?: number | null;
  matched_on?: string | null;
  result_count?: number | null;
}): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("search_events").insert({
      user_id: u.user?.id ?? null,
      query: input.query,
      query_type: input.query_type ?? "text",
      entity_type: input.entity_type ?? null,
      pub_entity_id: input.pub_entity_id ?? null,
      clicked_rank: input.clicked_rank ?? null,
      matched_on: input.matched_on ?? null,
      result_count: input.result_count ?? null,
    } as any);
  } catch { /* swallow */ }
}