import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, ok, err } from "../_shared/pub.ts";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return err("POST required", 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return err("Unauthorized", 401);

  let body: { refresh_token?: string } = {};
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }
  if (!body.refresh_token) return err("Missing refresh_token", 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: claims, error: cErr } = await sb.auth.getClaims(auth.slice(7));
  if (cErr || !claims?.claims?.sub) return err("Unauthorized", 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tokenHash = await sha256Hex(body.refresh_token);

  const { data: row } = await admin.from("api_refresh_tokens")
    .select("id, api_clients:client_id(user_id)")
    .eq("token_hash", tokenHash).maybeSingle();
  if (!row) return err("Token not found", 404);
  if ((row as any).api_clients?.user_id !== claims.claims.sub) return err("Forbidden", 403);

  await admin.from("api_refresh_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", (row as any).id);
  return ok({ revoked: true });
});