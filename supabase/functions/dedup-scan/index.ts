// Scans tracks/artists/creators for likely duplicates using normalize_entity_key
// + Levenshtein-style similarity. Auto-merges when similarity >= 0.95 AND ISRC matches.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  entity_type: "track" | "artist" | "creator";
  limit?: number;        // how many records to scan
  auto_merge?: boolean;  // default true
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}
function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const entityType = body.entity_type ?? "track";
    const limit = Math.min(body.limit ?? 500, 2000);
    const autoMerge = body.auto_merge ?? true;
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let candidates: { pub_id: string; key: string; isrc?: string | null }[] = [];

    if (entityType === "track") {
      const { data } = await sb.from("tracks").select("pub_track_id, title, primary_artist_name, isrc").limit(limit);
      candidates = (data ?? []).map((r: any) => ({
        pub_id: r.pub_track_id,
        key: ((r.title ?? "") + "|" + (r.primary_artist_name ?? "")).toLowerCase().replace(/\s*[\(\[]?\s*(feat\.?|ft\.?|featuring|with)\s+[^\)\]\|]+[\)\]]?/gi, "").replace(/[^a-z0-9|]+/gi, ""),
        isrc: r.isrc,
      }));
    } else {
      const table = entityType === "artist" ? "artists" : "creators";
      const idCol = entityType === "artist" ? "pub_artist_id" : "pub_creator_id";
      const { data } = await sb.from(table).select(`${idCol}, name, normalized_name`).limit(limit);
      candidates = (data ?? []).map((r: any) => ({
        pub_id: r[idCol],
        key: (r.normalized_name ?? r.name ?? "").toLowerCase().replace(/[^a-z0-9]+/gi, ""),
      }));
    }

    // Bucket by first 4 chars to keep it O(n*k) instead of O(n^2)
    const buckets = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const b = c.key.slice(0, 4);
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b)!.push(c);
    }

    const pairs: any[] = [];
    let auto_merged = 0;
    for (const arr of buckets.values()) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (!arr[i].key || !arr[j].key) continue;
          const sim = similarity(arr[i].key, arr[j].key);
          if (sim < 0.85) continue;
          const isrcMatch = !!(arr[i].isrc && arr[j].isrc && arr[i].isrc === arr[j].isrc);
          const reason = isrcMatch ? "key_match+isrc_match" : sim >= 0.95 ? "high_key_similarity" : "key_similarity";
          const [a, b] = [arr[i].pub_id, arr[j].pub_id].sort();
          let status = "pending";

          if (autoMerge && sim >= 0.95 && isrcMatch) {
            try {
              await sb.rpc("pub_merge_entities", {
                _entity_type: entityType, _source_pub_id: a, _target_pub_id: b, _reason: "auto_merge_dedup",
              });
              status = "auto_merged";
              auto_merged++;
            } catch {
              // fall back to pending row
            }
          }

          await sb.from("potential_duplicates").upsert({
            entity_type: entityType,
            entity_id_1: a,
            entity_id_2: b,
            similarity_score: Number(sim.toFixed(3)),
            match_reason: reason,
            merge_status: status,
            merged_into: status === "auto_merged" ? b : null,
            reviewed_at: status === "auto_merged" ? new Date().toISOString() : null,
          }, { onConflict: "entity_type,entity_id_1,entity_id_2" });

          pairs.push({ a, b, sim, reason, status });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      scanned: candidates.length,
      pairs_found: pairs.length,
      auto_merged,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});