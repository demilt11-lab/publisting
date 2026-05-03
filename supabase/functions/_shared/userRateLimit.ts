// Per-user rate limit + search analytics helpers shared across edge functions.
// Backend rate limiting is intentionally ad-hoc — see project memory.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

type SB = ReturnType<typeof createClient>;

export interface RateCheck {
  allowed: boolean;
  reason?: string;
  count?: number;
  limit?: number;
  reset_in_seconds?: number;
}

function admin(): SB {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Resolve the JWT user id from the request, or null for anonymous. */
export async function userFromReq(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Enforces a per-user rolling-window quota by calling user_rate_limit_check.
 * Returns allowed=true for anonymous calls (so public endpoints stay working).
 */
export async function checkUserRateLimit(
  req: Request,
  action: string,
  limit = 100,
  windowMinutes = 60,
): Promise<RateCheck & { user_id: string | null }> {
  const uid = await userFromReq(req);
  if (!uid) return { allowed: true, user_id: null };

  // Use the requesting user's JWT so auth.uid() resolves inside the SECURITY DEFINER fn.
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );
  const { data, error } = await sb.rpc("user_rate_limit_check", {
    _action: action,
    _limit: limit,
    _window_minutes: windowMinutes,
  });
  if (error) return { allowed: true, user_id: uid };
  const r = data as any;
  return {
    allowed: !!r?.allowed,
    reason: r?.reason,
    count: r?.count,
    limit: r?.limit,
    reset_in_seconds: r?.reset_in_seconds,
    user_id: uid,
  };
}

/** Build a 429 Response when a rate limit fires. */
export function rateLimitResponse(rc: RateCheck, corsHeaders: Record<string, string>): Response {
  const minutes = Math.max(1, Math.ceil((rc.reset_in_seconds ?? 3600) / 60));
  return new Response(
    JSON.stringify({
      success: false,
      error: "rate_limited",
      message: `Rate limit reached, try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      reset_in_seconds: rc.reset_in_seconds ?? 3600,
      limit: rc.limit ?? 100,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(rc.reset_in_seconds ?? 3600),
      },
    },
  );
}

/** Persist a search log row (best-effort, swallows errors). */
export async function logSearch(opts: {
  user_id: string | null;
  query_text: string;
  result_count?: number;
  clicked_entity_id?: string | null;
  clicked_entity_type?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!opts.user_id || !opts.query_text) return;
  try {
    const sb = admin();
    await sb.from("user_search_logs").insert({
      user_id: opts.user_id,
      query_text: opts.query_text.slice(0, 500),
      result_count: opts.result_count ?? 0,
      clicked_entity_id: opts.clicked_entity_id ?? null,
      clicked_entity_type: opts.clicked_entity_type ?? null,
      metadata: opts.metadata ?? {},
    });
  } catch (_) { /* swallow */ }
}