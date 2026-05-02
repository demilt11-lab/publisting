import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, ok, err, detailPathFor, normalizeName } from "../_shared/pub.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const u = new URL(req.url);
  const q = (u.searchParams.get("q") || "").trim();
  const type = u.searchParams.get("type") || null;
  const limit = Math.min(15, Math.max(1, Number(u.searchParams.get("limit") || 8)));
  if (!q) return err("Missing 'q'", 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const norm = normalizeName(q);
  let qry = sb.from("search_documents")
    .select("entity_type, pub_entity_id, display_name, subtitle")
    .or(`normalized_name.ilike.${norm}%,aliases.cs.{${norm}}`)
    .order("popularity_score", { ascending: false })
    .limit(limit);
  if (type) qry = qry.eq("entity_type", type);

  const { data, error } = await qry;
  if (error) return err(error.message, 500);

  return ok({
    results: (data ?? []).map((r: any) => ({
      entity_type: r.entity_type,
      pub_entity_id: r.pub_entity_id,
      display_name: r.display_name,
      subtitle: r.subtitle,
      detail_path: detailPathFor(r.entity_type, r.pub_entity_id),
    })),
  });
});