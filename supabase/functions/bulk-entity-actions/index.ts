import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface Target {
  entity_type: "artist" | "track" | "creator" | "album";
  pub_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") || "";

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action: string = body?.action;
  const targets: Target[] = Array.isArray(body?.targets) ? body.targets.slice(0, 200) : [];
  const payload = body?.payload ?? {};

  if (!action || !targets.length) {
    return new Response(JSON.stringify({ error: "missing action or targets" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  let succeeded = 0, failed = 0;

  for (const t of targets) {
    try {
      if (action === "refresh") {
        for (const fn of ["sync-spotify-entity", "sync-genius-entity"]) {
          await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({ entity_type: t.entity_type, pub_id: t.pub_id }),
          }).catch(() => {});
        }
      } else if (action === "subscribe" || action === "unsubscribe") {
        const table = t.entity_type === "creator" ? "creators" : `${t.entity_type}s`;
        const pubCol = `pub_${t.entity_type}_id`;
        const { data: row } = await admin.from(table as any).select(`id, ${pubCol}`).eq(pubCol, t.pub_id).maybeSingle();
        if (!row) throw new Error("entity not found");
        if (action === "subscribe") {
          await admin.from("pub_alert_subscriptions").upsert({
            user_id: userData.user.id,
            entity_type: t.entity_type,
            entity_id: (row as any).id,
            pub_id: t.pub_id,
          }, { onConflict: "user_id,entity_type,entity_id" });
        } else {
          await admin.from("pub_alert_subscriptions")
            .delete()
            .eq("user_id", userData.user.id)
            .eq("entity_type", t.entity_type)
            .eq("entity_id", (row as any).id);
        }
      } else if (action === "add_to_watchlist" && t.entity_type === "creator") {
        await admin.from("watchlist_entries").upsert({
          user_id: userData.user.id,
          pub_creator_id: t.pub_id,
          stage: "scout",
        }, { onConflict: "user_id,pub_creator_id" });
      } else if (action === "tag") {
        await admin.from("entity_notes").insert({
          author_id: userData.user.id,
          team_id: payload.team_id ?? userData.user.id,
          entity_type: t.entity_type,
          pub_id: t.pub_id,
          body: `#${payload.tag}`,
        });
      } else {
        throw new Error(`unsupported action: ${action}`);
      }
      succeeded++;
      results.push({ ...t, ok: true });
    } catch (e) {
      failed++;
      results.push({ ...t, ok: false, error: (e as Error).message });
    }
  }

  await admin.from("bulk_action_runs").insert({
    action, actor_user_id: userData.user.id,
    target_count: targets.length, succeeded, failed, payload, results,
  });

  return new Response(JSON.stringify({ succeeded, failed, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});