// Compares the same field across Spotify / Soundcharts / Genius and writes
// to data_source_confirmations. Confidence: 95 if all agree, 70 if 2/3, 40 if all differ.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FieldInput {
  field_name: string;
  spotify?: any;
  soundcharts?: any;
  genius?: any;
}

interface Body {
  entity_id: string;
  entity_type: "track" | "artist" | "creator" | "album";
  fields: FieldInput[];
}

function canonicalize(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim().toLowerCase().normalize("NFKD").replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
  if (Array.isArray(v)) return v.map((x) => canonicalize(x)).filter(Boolean).sort().join("|");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).toLowerCase();
}

function score(f: FieldInput): { confidence: number; agreement: string; consensus: any; sources: string[] } {
  const present: { source: string; raw: any; canonical: string }[] = [];
  for (const s of ["spotify", "soundcharts", "genius"] as const) {
    if (f[s] !== undefined && f[s] !== null && f[s] !== "") {
      present.push({ source: s, raw: f[s], canonical: canonicalize(f[s]) });
    }
  }
  if (present.length === 0) return { confidence: 0, agreement: "no_source", consensus: null, sources: [] };
  if (present.length === 1) return { confidence: 50, agreement: "single_source", consensus: present[0].raw, sources: [present[0].source] };

  // Group by canonical value
  const groups = new Map<string, typeof present>();
  for (const p of present) {
    if (!groups.has(p.canonical)) groups.set(p.canonical, []);
    groups.get(p.canonical)!.push(p);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const top = sorted[0][1];

  if (top.length === present.length) {
    return { confidence: 95, agreement: "all_agree", consensus: top[0].raw, sources: present.map((p) => p.source) };
  }
  if (top.length === 2) {
    return { confidence: 70, agreement: "2_of_3", consensus: top[0].raw, sources: top.map((p) => p.source) };
  }
  return { confidence: 40, agreement: "all_differ", consensus: present[0].raw, sources: present.map((p) => p.source) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body?.entity_id || !body?.entity_type || !Array.isArray(body.fields)) {
      return new Response(JSON.stringify({ error: "entity_id, entity_type, fields required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const results = [] as any[];
    for (const f of body.fields) {
      const s = score(f);
      const row = {
        entity_id: body.entity_id,
        entity_type: body.entity_type,
        field_name: f.field_name,
        spotify_value: f.spotify ?? null,
        soundcharts_value: f.soundcharts ?? null,
        genius_value: f.genius ?? null,
        consensus_value: s.consensus,
        confidence_level: s.confidence,
        agreement_label: s.agreement,
        sources_present: s.sources,
        last_verified_at: new Date().toISOString(),
      };
      await sb.from("data_source_confirmations").upsert(row, { onConflict: "entity_type,entity_id,field_name" });
      results.push({ field_name: f.field_name, confidence: s.confidence, agreement: s.agreement });
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});