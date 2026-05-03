// PRO/provider sync. Uses the existing PRO lookup pipeline and records any
// confirmed publishing, PRO, label, management, IPI, and location fields.
import { corsHeaders, ok } from "../_shared/pub.ts";
import { runProviderSync } from "../_shared/providerSync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const report = await runProviderSync("pro", req, async ({ entity }) => {
    const raw = entity.raw as any;
    const names = [entity.display_name].filter(Boolean);
    const fields: Array<{ field: string; value: string | null; confidence?: number }> = [];

    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pro-lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? ""}`,
      },
      body: JSON.stringify({
        names,
        songTitle: entity.entity_type === "track" ? raw.title ?? entity.display_name : undefined,
        artist: raw.primary_artist_name ?? undefined,
      }),
    }).catch((error) => ({ ok: false, status: 0, json: async () => ({ error: error.message }) } as Response));

    const body = await res.json().catch(() => ({}));
    const row = body?.data?.[entity.display_name] ?? body?.data?.[names[0]] ?? null;
    if (!res.ok || body?.success === false || !row) {
      return { links: [], fields, metadata: { matched: false, error: body?.error ?? `HTTP ${res.status}` } };
    }

    fields.push(
      { field: "publisher", value: row.publisher ?? null, confidence: 0.82 },
      { field: "pro", value: row.pro ?? null, confidence: 0.8 },
      { field: "ipi", value: row.ipi ?? null, confidence: 0.86 },
      { field: "record_label", value: row.recordLabel ?? row.record_label ?? null, confidence: 0.72 },
      { field: "management", value: row.management ?? null, confidence: 0.72 },
      { field: "country", value: row.locationCountry ?? row.country ?? null, confidence: 0.7 },
    );

    return { links: [], fields, metadata: { matched: true, searched: body?.searched ?? [] } };
  });

  return ok(report);
});