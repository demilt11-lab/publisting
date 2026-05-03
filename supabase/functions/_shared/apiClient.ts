// Resilient external-API client used by sync workers.
// - rate-limit check via api_rate_limit_check RPC
// - exponential backoff (1s, 2s, 4s, ... cap 30s) honoring Retry-After
// - on-failure: enqueue into pending_api_requests
// - telemetry logged to api_call_log
// - query-level cache via search_query_cache
// - fallback chain: try sources in order until one succeeds
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

type SB = ReturnType<typeof createClient>;

function admin(): SB {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export interface CallOpts {
  service: string;
  endpoint?: string;
  /** Max retry attempts after the initial try (default 3 → up to 4 total). */
  maxRetries?: number;
  /** Base backoff in ms (default 1000). */
  baseDelayMs?: number;
  /** Cap per-attempt delay (default 30_000). */
  maxDelayMs?: number;
  /** If true and rate-limited, persist a pending request row instead of throwing. */
  enqueueOnLimit?: boolean;
  /** Payload to store on the pending row. */
  pendingPayload?: Record<string, unknown>;
  /** Edge function name to retry from the queue worker. */
  pendingEdgeFunction?: string;
}

export interface CallResult<T> {
  ok: boolean;
  data: T | null;
  status: number | null;
  source: string;
  attempts: number;
  rate_limited: boolean;
  enqueued: boolean;
  error?: string;
}

async function logCall(
  sb: SB,
  opts: CallOpts,
  outcome: "success" | "error" | "rate_limited" | "retry" | "fallback" | "validation_error",
  status: number | null,
  duration: number,
  attempt: number,
  err?: string,
) {
  try {
    await sb.from("api_call_log").insert({
      service_name: opts.service,
      endpoint: opts.endpoint ?? null,
      status_code: status,
      outcome,
      duration_ms: duration,
      attempt,
      error_message: err ?? null,
    });
  } catch (_) { /* swallow telemetry errors */ }
}

function backoff(attempt: number, base: number, cap: number, retryAfterMs?: number): number {
  if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, cap);
  const delay = Math.min(cap, base * Math.pow(2, attempt));
  // jitter ±20%
  return Math.round(delay * (0.8 + Math.random() * 0.4));
}

function parseRetryAfter(h: Headers): number | undefined {
  const v = h.get("retry-after");
  if (!v) return;
  const n = Number(v);
  if (!Number.isNaN(n)) return n * 1000;
  const d = Date.parse(v);
  if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
}

async function enqueue(sb: SB, opts: CallOpts, reason: string, retryAfterMs?: number) {
  if (!opts.enqueueOnLimit) return;
  await sb.from("pending_api_requests").insert({
    service_name: opts.service,
    edge_function: opts.pendingEdgeFunction ?? "manual",
    payload: opts.pendingPayload ?? {},
    status: "pending",
    last_error: reason,
    next_attempt_at: new Date(Date.now() + (retryAfterMs ?? 60_000)).toISOString(),
  });
}

/**
 * Wrap any async fetch with: rate-limit check → exponential backoff retries
 * on 429/5xx → enqueue on persistent rate-limit → telemetry.
 * The fetcher returns either a Response or a {response, parsed} pair.
 */
export async function callApi<T>(
  opts: CallOpts,
  fetcher: () => Promise<Response>,
  parser: (r: Response) => Promise<T>,
): Promise<CallResult<T>> {
  const sb = admin();
  const maxRetries = opts.maxRetries ?? 3;
  const base = opts.baseDelayMs ?? 1000;
  const cap = opts.maxDelayMs ?? 30_000;

  // 1. Rate-limit check
  const { data: rlRaw } = await sb.rpc("api_rate_limit_check", { _service: opts.service });
  const rl: any = rlRaw ?? { allowed: true };
  if (rl?.allowed === false) {
    await logCall(sb, opts, "rate_limited", 429, 0, 1, `quota ${rl.count}/${rl.limit}`);
    await enqueue(sb, opts, "rate_limit_exceeded", rl.reset_in_ms);
    return {
      ok: false, data: null, status: 429, source: opts.service, attempts: 0,
      rate_limited: true, enqueued: !!opts.enqueueOnLimit,
      error: `rate_limited: ${rl.count}/${rl.limit}`,
    };
  }

  // 2. Try with retries
  let attempt = 0;
  let lastErr: string | undefined;
  let lastStatus: number | null = null;
  while (attempt <= maxRetries) {
    const t0 = Date.now();
    try {
      const res = await fetcher();
      lastStatus = res.status;
      if (res.ok) {
        const parsed = await parser(res);
        await logCall(sb, opts, "success", res.status, Date.now() - t0, attempt + 1);
        return { ok: true, data: parsed, status: res.status, source: opts.service, attempts: attempt + 1, rate_limited: false, enqueued: false };
      }
      // Retry on 429 / 5xx
      if (res.status === 429 || res.status >= 500) {
        const ra = parseRetryAfter(res.headers);
        await logCall(sb, opts, "retry", res.status, Date.now() - t0, attempt + 1, `http ${res.status}`);
        if (attempt === maxRetries) {
          lastErr = `http ${res.status}`;
          break;
        }
        await new Promise((r) => setTimeout(r, backoff(attempt, base, cap, ra)));
        attempt++;
        continue;
      }
      // 4xx other → permanent
      lastErr = `http ${res.status}`;
      await logCall(sb, opts, "error", res.status, Date.now() - t0, attempt + 1, lastErr);
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      await logCall(sb, opts, "retry", null, Date.now() - t0, attempt + 1, lastErr);
      if (attempt === maxRetries) break;
      await new Promise((r) => setTimeout(r, backoff(attempt, base, cap)));
      attempt++;
    }
  }

  // 3. Persistent failure → enqueue if requested
  if (lastStatus === 429 || (lastStatus !== null && lastStatus >= 500)) {
    await enqueue(sb, opts, lastErr ?? "exhausted", undefined);
  }
  await logCall(sb, opts, "error", lastStatus, 0, attempt + 1, lastErr);
  return {
    ok: false, data: null, status: lastStatus, source: opts.service,
    attempts: attempt + 1, rate_limited: lastStatus === 429,
    enqueued: !!opts.enqueueOnLimit && (lastStatus === 429 || (lastStatus ?? 0) >= 500),
    error: lastErr,
  };
}

/**
 * Try a list of sources in order. Returns the first success, marking the
 * result with `source` and `degraded` so callers can show warning badges.
 */
export interface FallbackAttempt<T> {
  service: string;
  fn: () => Promise<CallResult<T>>;
}
export interface FallbackResult<T> {
  ok: boolean;
  data: T | null;
  source: string | null;
  degraded: boolean;
  attempts: Array<{ service: string; ok: boolean; error?: string; status: number | null }>;
  /** True if we returned cached data because all live sources failed. */
  served_from_cache?: boolean;
  cache_age_seconds?: number;
}

export async function withFallback<T>(
  attempts: FallbackAttempt<T>[],
  cacheKey?: string,
): Promise<FallbackResult<T>> {
  const log: FallbackResult<T>["attempts"] = [];
  const sb = admin();
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    try {
      const r = await a.fn();
      log.push({ service: a.service, ok: r.ok, error: r.error, status: r.status });
      if (r.ok) {
        if (cacheKey) {
          await sb.from("search_query_cache").upsert({
            query_hash: cacheKey,
            service_name: a.service,
            results_json: r.data as any,
            created_at: new Date().toISOString(),
            ttl_minutes: 15,
            expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          });
        }
        return { ok: true, data: r.data, source: a.service, degraded: i > 0, attempts: log };
      }
    } catch (e) {
      log.push({ service: a.service, ok: false, error: e instanceof Error ? e.message : String(e), status: null });
    }
  }
  // All sources failed → try stale cache
  if (cacheKey) {
    const { data } = await sb.from("search_query_cache").select("results_json, created_at")
      .eq("query_hash", cacheKey).maybeSingle();
    if (data) {
      await sb.from("search_query_cache").update({ hit_count: 1, last_hit_at: new Date().toISOString() })
        .eq("query_hash", cacheKey);
      return {
        ok: true,
        data: (data as any).results_json as T,
        source: "cache",
        degraded: true,
        attempts: log,
        served_from_cache: true,
        cache_age_seconds: Math.floor((Date.now() - new Date((data as any).created_at).getTime()) / 1000),
      };
    }
  }
  return { ok: false, data: null, source: null, degraded: true, attempts: log };
}

/** Read a fresh entry from the search_query_cache. */
export async function readQueryCache<T>(cacheKey: string): Promise<{ data: T; age_seconds: number } | null> {
  const sb = admin();
  const { data } = await sb.from("search_query_cache").select("results_json, created_at, expires_at")
    .eq("query_hash", cacheKey).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!data) return null;
  await sb.from("search_query_cache").update({ hit_count: 1, last_hit_at: new Date().toISOString() })
    .eq("query_hash", cacheKey);
  return { data: (data as any).results_json as T, age_seconds: Math.floor((Date.now() - new Date((data as any).created_at).getTime()) / 1000) };
}

export async function writeQueryCache(
  cacheKey: string, service: string, payload: unknown, ttlMinutes = 15, queryText?: string,
): Promise<void> {
  const sb = admin();
  await sb.from("search_query_cache").upsert({
    query_hash: cacheKey,
    query_text: queryText ?? null,
    service_name: service,
    results_json: payload as any,
    created_at: new Date().toISOString(),
    ttl_minutes: ttlMinutes,
    expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
    hit_count: 0,
  });
}

/** Stable hash for a query string. */
export async function hashQuery(...parts: (string | undefined | null)[]): Promise<string> {
  const s = parts.filter(Boolean).join("|").toLowerCase();
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}