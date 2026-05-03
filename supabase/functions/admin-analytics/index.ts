// Aggregates analytics for /admin/analytics: DAU, top searches, top clicks, watchlist growth.
// Caller must be an authenticated admin (verified via has_role RPC).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    const uid = userRes?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ ok: false, error: "unauthenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: uid, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
    const since14 = new Date(Date.now() - 14 * 86400_000).toISOString();

    // 1. Daily active users (last 14 days)
    const { data: logs7 } = await sb
      .from("user_search_logs")
      .select("user_id, query_text, clicked_entity_id, clicked_entity_type, created_at")
      .gte("created_at", since14)
      .limit(20000);
    const dauMap = new Map<string, Set<string>>();
    for (const r of logs7 ?? []) {
      if (!r.user_id) continue;
      const day = String(r.created_at).slice(0, 10);
      if (!dauMap.has(day)) dauMap.set(day, new Set());
      dauMap.get(day)!.add(r.user_id);
    }
    const dau = Array.from(dauMap.entries()).sort().map(([day, set]) => ({ day, users: set.size }));

    // 2. Top searches (last 7 days)
    const recent = (logs7 ?? []).filter((r: any) => r.created_at >= since7 && r.query_text);
    const qCounts = new Map<string, number>();
    for (const r of recent) {
      const k = String((r as any).query_text).toLowerCase().trim();
      if (!k || k.startsWith("(click:")) continue;
      qCounts.set(k, (qCounts.get(k) ?? 0) + 1);
    }
    const top_searches = Array.from(qCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    // 3. Most clicked entities
    const cCounts = new Map<string, { id: string; type: string | null; count: number }>();
    for (const r of recent) {
      const id = (r as any).clicked_entity_id;
      if (!id) continue;
      const key = `${(r as any).clicked_entity_type ?? "?"}|${id}`;
      const existing = cCounts.get(key);
      if (existing) existing.count += 1;
      else cCounts.set(key, { id, type: (r as any).clicked_entity_type ?? null, count: 1 });
    }
    const top_clicks = Array.from(cCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 4. Watchlist growth (last 14 days)
    const { data: watch } = await sb
      .from("watchlist_entries")
      .select("created_at")
      .gte("created_at", since14)
      .limit(20000);
    const wMap = new Map<string, number>();
    for (const r of watch ?? []) {
      const day = String(r.created_at).slice(0, 10);
      wMap.set(day, (wMap.get(day) ?? 0) + 1);
    }
    const watchlist_growth = Array.from(wMap.entries()).sort().map(([day, count]) => ({ day, count }));

    // 5. Totals
    const totals = {
      searches_7d: recent.length,
      unique_users_7d: new Set(recent.map((r: any) => r.user_id).filter(Boolean)).size,
      watchlist_added_7d: (watch ?? []).filter((r: any) => r.created_at >= since7).length,
    };

    return new Response(JSON.stringify({
      ok: true, dau, top_searches, top_clicks, watchlist_growth, totals,
      generated_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});