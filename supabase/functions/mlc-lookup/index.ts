import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MLC_BASE = "https://public-api.themlc.com";

// In-memory token cache (per edge function instance) keyed by user id
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getMlcToken(userId: string, username: string, password: string): Promise<string> {
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });

  const res = await fetch(`${MLC_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MLC OAuth failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const token = json.access_token as string;
  const expiresIn = (json.expires_in as number | undefined) ?? 3600;
  tokenCache.set(userId, { token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const { action, title, artist, iswc, workId } = await req.json().catch(() => ({}));
    if (!action || typeof action !== "string") {
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load creds (RLS ensures only the user's row)
    const { data: cred, error: credErr } = await supabase
      .from("mlc_credentials")
      .select("username,password,auto_lookup_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (credErr) throw credErr;
    if (!cred) {
      return new Response(JSON.stringify({ error: "no_credentials", message: "Add MLC API credentials in settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getMlcToken(userId, cred.username, cred.password);
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    if (action === "search") {
      if (!title || typeof title !== "string") {
        return new Response(JSON.stringify({ error: "Missing title" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const searchBody: Record<string, unknown> = { title: title.slice(0, 200) };
      if (artist) searchBody.writers = [String(artist).slice(0, 120)];
      if (iswc) searchBody.iswc = String(iswc).slice(0, 20);

      const r = await fetch(`${MLC_BASE}/search/songcode`, {
        method: "POST", headers, body: JSON.stringify(searchBody),
      });
      const data = await r.json().catch(() => ({}));
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "work") {
      if (!workId) {
        return new Response(JSON.stringify({ error: "Missing workId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const r = await fetch(`${MLC_BASE}/work/id/${encodeURIComponent(String(workId))}`, { headers });
      const data = await r.json().catch(() => ({}));
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});