import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { corsHeaders, ok, err } from "../_shared/pub.ts";

/**
 * Opaque-refresh-token → short-lived access token exchange.
 * Mints a Supabase service-anonymized JWT-style access token signed with HMAC.
 * 1 hour TTL.
 */

async function hmacSha256(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64url(o: unknown) {
  return btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return err("POST required", 405);

  let body: { refresh_token?: string } = {};
  try { body = await req.json(); } catch { return err("Invalid JSON", 400); }
  if (!body.refresh_token) return err("Missing refresh_token", 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tokenHash = await sha256Hex(body.refresh_token);

  const { data: row } = await sb.from("api_refresh_tokens")
    .select("id, client_id, expires_at, revoked_at, api_clients:client_id(id, user_id, is_active, scopes)")
    .eq("token_hash", tokenHash).maybeSingle();

  if (!row) return err("Invalid token", 401);
  const r = row as any;
  if (r.revoked_at) return err("Token revoked", 401);
  if (new Date(r.expires_at).getTime() < Date.now()) return err("Token expired", 401);
  if (!r.api_clients?.is_active) return err("Client disabled", 401);

  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // signing key (server-only)
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: "publisting",
    sub: r.api_clients.user_id,
    cid: r.client_id,
    scope: (r.api_clients.scopes ?? []).join(" "),
    iat: now,
    exp: now + 3600,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = await hmacSha256(secret, signingInput);
  const access_token = `${signingInput}.${sig}`;

  return ok({ access_token, token_type: "bearer", expires_in: 3600, scope: payload.scope });
});