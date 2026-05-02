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

/* ----------------------- Provider syncs ----------------------- */

export interface ProviderSyncReport {
  source: string;
  entity_type: EntityType;
  pub_entity_id: string;
  links_upserted: number;
  fields_recorded: number;
  status: "ok" | "partial" | "error";
  error?: string | null;
  metadata?: Record<string, unknown>;
}

export type ProviderName = "spotify" | "genius" | "pro" | "soundcharts";

const SYNC_FN: Record<ProviderName, string> = {
  spotify: "sync-spotify-entity",
  genius: "sync-genius-entity",
  pro: "sync-pro-entity",
  soundcharts: "sync-soundcharts-entity",
};

export function syncEntityFromProvider(
  provider: ProviderName,
  entity_type: EntityType,
  pub_entity_id: string,
): Promise<ProviderSyncReport> {
  return callFn<ProviderSyncReport>(SYNC_FN[provider], { entity_type, pub_entity_id });
}

export async function syncEntityFromAllProviders(
  entity_type: EntityType,
  pub_entity_id: string,
): Promise<ProviderSyncReport[]> {
  const providers: ProviderName[] = ["spotify", "genius", "pro", "soundcharts"];
  const results = await Promise.allSettled(
    providers.map((p) => syncEntityFromProvider(p, entity_type, pub_entity_id)),
  );
  return results.map((r, i) => r.status === "fulfilled" ? r.value : ({
    source: providers[i], entity_type, pub_entity_id,
    links_upserted: 0, fields_recorded: 0, status: "error" as const,
    error: r.reason instanceof Error ? r.reason.message : String(r.reason),
  }));
}

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
  fallback_used?: boolean;
  zero_result?: boolean;
  source_used?: string | null;
  suggestions_shown?: Array<{ entity_type: string; pub_entity_id: string; display_name: string }>;
  reformulated_from?: string | null;
  query_normalized?: string | null;
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
      fallback_used: !!input.fallback_used,
      zero_result: !!input.zero_result,
      source_used: input.source_used ?? null,
      suggestions_shown: input.suggestions_shown ?? [],
      reformulated_from: input.reformulated_from ?? null,
      query_normalized: input.query_normalized ?? input.query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    } as any);
  } catch { /* swallow */ }
}

/* ----------------------- Debug + retry helpers ----------------------- */

export interface RankedDebugRow {
  entity_type: EntityType; pub_entity_id: string; display_name: string; subtitle: string | null;
  matched_on: string;
  base_confidence: number; popularity_score: number; activity_score: number;
  coverage_score: number; trust_score: number; source_count: number;
  externals: Record<string, string>;
  weighted_confidence: number; weighted_popularity: number; weighted_activity: number;
  weighted_coverage: number; weighted_trust: number;
  rank: number;
}
export interface RankingWeights {
  id: string;
  weight_confidence: number; weight_popularity: number; weight_activity: number;
  weight_coverage: number; weight_trust: number; conflict_penalty: number;
  notes?: string | null;
}

export function searchRankDebug(input: { q: string; type?: EntityType; platform?: string; region?: string; limit?: number; }): Promise<{ q: string; results: RankedDebugRow[]; weights: RankingWeights | null }> {
  return callFn("search-rank-debug", input as any);
}

export interface ProviderMatchRun {
  id: string;
  provider: string;
  query_used: string | null;
  candidates: any[];
  chosen: any | null;
  rejected: any[];
  score_breakdown: Record<string, number>;
  conflict_reasons: string[];
  confidence_contribution: number | null;
  status: string;
  error_text: string | null;
  created_at: string;
}
export function getProviderMatchRuns(entity_type: EntityType, pub_entity_id: string, opts?: { provider?: string; limit?: number }): Promise<{ runs: ProviderMatchRun[] }> {
  return callFn("provider-match-debug", { entity_type, pub_entity_id, ...(opts ?? {}) });
}

export function retryRefresh(input: { refresh_log_id?: string; entity_type?: EntityType; pub_entity_id?: string; source?: string }): Promise<{ retried: boolean; source: string; report: ProviderSyncReport }> {
  return callFn("retry-refresh", input as any);
}

export function queueRefreshRetry(ids: string[], queued = true): Promise<{ updated: number }> {
  return callFn("queue-refresh-retry", { ids, queued });
}

/* ----------------------- Provider health ----------------------- */

export interface ProviderHealth {
  provider: string;
  total_runs_24h: number;
  ok_runs_24h: number;
  partial_runs_24h: number;
  error_runs_24h: number;
  success_pct_24h: number | null;
  avg_latency_ms: number | null;
  last_success_at: string | null;
  last_error_at: string | null;
}
export async function getProviderHealth(): Promise<ProviderHealth[]> {
  const { data, error } = await supabase.from("provider_health_live").select("*");
  if (error) return [];
  return (data ?? []) as ProviderHealth[];
}

/* ----------------------- Refresh log queries ----------------------- */

export interface RefreshLogRow {
  id: string;
  entity_type: string;
  pub_entity_id: string;
  source: string;
  status: string;
  refresh_reason: string | null;
  started_at: string;
  completed_at: string | null;
  error_text: string | null;
  metadata: Record<string, unknown> | null;
  queued_for_retry: boolean;
  retry_count: number;
  last_attempt_at: string | null;
}
export async function listRefreshLog(filters: {
  source?: string; status?: string; entity_type?: string;
  since?: string; limit?: number;
} = {}): Promise<RefreshLogRow[]> {
  let q = supabase.from("entity_refresh_log").select("*").order("started_at", { ascending: false }).limit(filters.limit ?? 100);
  if (filters.source) q = q.eq("source", filters.source);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.entity_type) q = q.eq("entity_type", filters.entity_type);
  if (filters.since) q = q.gte("started_at", filters.since);
  const { data, error } = await q;
  if (error) { console.warn("listRefreshLog", error); return []; }
  return (data ?? []) as RefreshLogRow[];
}

/* ----------------------- Saved query runs UI ----------------------- */

export interface SavedQueryRun {
  id: string;
  saved_query_id: string;
  run_at: string;
  result_count: number;
  diff_count: number;
  added: any[];
  removed: any[];
}
export async function listSavedQueryRuns(saved_query_id: string, limit = 20): Promise<SavedQueryRun[]> {
  const { data, error } = await supabase.from("saved_query_runs")
    .select("*").eq("saved_query_id", saved_query_id)
    .order("run_at", { ascending: false }).limit(limit);
  if (error) return [];
  return (data ?? []) as SavedQueryRun[];
}

export async function setSavedQuerySubscription(id: string, subscribed: boolean): Promise<boolean> {
  const { error } = await supabase.from("saved_queries").update({ is_subscribed: subscribed }).eq("id", id);
  return !error;
}

/* ----------------------- Ranking weights ----------------------- */

export async function getRankingWeights(): Promise<RankingWeights | null> {
  const { data } = await supabase.from("ranking_weights").select("*").eq("id", "default").maybeSingle();
  return (data as RankingWeights) ?? null;
}
export async function updateRankingWeights(patch: Partial<RankingWeights>): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("ranking_weights").update({ ...patch, updated_at: new Date().toISOString(), updated_by: u.user?.id ?? null }).eq("id", "default");
  return !error;
}