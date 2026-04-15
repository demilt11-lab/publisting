import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = getSupabase();
    const body = await req.json();

    // Mode 1: Record velocity data point
    if (body.record) {
      return await recordVelocity(supabase, body);
    }

    // Mode 2: Detect trends for a catalog
    if (body.detect_trends) {
      return await detectTrends(supabase, body);
    }

    // Mode 3: Get velocity for specific song
    if (body.song_key) {
      return await getSongVelocity(supabase, body.song_key, body.days || 90);
    }

    return new Response(JSON.stringify({ error: "Specify record, detect_trends, or song_key" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Streaming velocity error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function recordVelocity(supabase: any, body: any) {
  const { song_key, title, artist, daily_streams, weekly_streams, platform, region } = body;
  if (!song_key || !title || !artist) {
    return new Response(JSON.stringify({ error: "song_key, title, artist required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get previous week's data for comparison
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: prev } = await supabase
    .from("streaming_velocity")
    .select("weekly_streams")
    .eq("song_key", song_key)
    .eq("platform", platform || "spotify")
    .lte("date", weekAgo.toISOString().split("T")[0])
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevWeekly = prev?.weekly_streams || 0;
  const currentWeekly = weekly_streams || daily_streams * 7 || 0;
  const weeklyChangePct = prevWeekly > 0 ? ((currentWeekly - prevWeekly) / prevWeekly) * 100 : 0;

  // Classify velocity type
  let velocityType = "normal";
  const annotations: any[] = [];

  if (weeklyChangePct > 200) {
    velocityType = "viral";
    annotations.push({ type: "viral_spike", message: `${weeklyChangePct.toFixed(0)}% week-over-week growth`, date: new Date().toISOString() });
  } else if (weeklyChangePct > 100) {
    velocityType = "trending";
    annotations.push({ type: "trending", message: `${weeklyChangePct.toFixed(0)}% WoW growth`, date: new Date().toISOString() });
  } else if (weeklyChangePct < -50) {
    velocityType = "declining";
    annotations.push({ type: "decline", message: `${weeklyChangePct.toFixed(0)}% WoW decline`, date: new Date().toISOString() });
  }

  // Check for regional breakout pattern
  if (region && region !== "Global" && weeklyChangePct > 100) {
    velocityType = "regional_breakout";
    annotations.push({ type: "regional_breakout", message: `Breakout in ${region}`, date: new Date().toISOString() });
  }

  const { data, error } = await supabase
    .from("streaming_velocity")
    .upsert({
      song_key,
      title,
      artist,
      daily_streams: daily_streams || 0,
      weekly_streams: currentWeekly,
      weekly_change_pct: Math.round(weeklyChangePct * 100) / 100,
      velocity_type: velocityType,
      annotations,
      platform: platform || "spotify",
      region: region || "Global",
    }, { onConflict: "song_key,date,platform" })
    .select()
    .single();

  if (error) throw error;

  return new Response(JSON.stringify({ success: true, velocity: data, velocity_type: velocityType }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function detectTrends(supabase: any, body: any) {
  const { user_id, song_keys } = body;

  // Get recent velocity data for all songs
  const { data: velocities } = await supabase
    .from("streaming_velocity")
    .select("*")
    .in("song_key", song_keys || [])
    .gte("date", new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0])
    .order("date", { ascending: false });

  if (!velocities || velocities.length === 0) {
    return new Response(JSON.stringify({ trends: [], alerts: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Group by song_key
  const bySong: Record<string, any[]> = {};
  for (const v of velocities) {
    if (!bySong[v.song_key]) bySong[v.song_key] = [];
    bySong[v.song_key].push(v);
  }

  const trends: any[] = [];
  const alerts: any[] = [];

  for (const [songKey, data] of Object.entries(bySong)) {
    const latest = data[0];
    const trend: any = {
      song_key: songKey,
      title: latest.title,
      artist: latest.artist,
      current_velocity: latest.weekly_change_pct,
      velocity_type: latest.velocity_type,
      data_points: data.length,
      latest_date: latest.date,
    };

    // Detect patterns
    if (latest.velocity_type === "viral" || latest.weekly_change_pct > 200) {
      trend.pattern = "viral_spike";
      trend.badge = "🔥 Viral";
      alerts.push({
        type: "viral_growth",
        song_key: songKey,
        title: latest.title,
        artist: latest.artist,
        message: `"${latest.title}" is experiencing viral growth (+${latest.weekly_change_pct.toFixed(0)}% WoW)`,
      });
    } else if (latest.velocity_type === "regional_breakout") {
      trend.pattern = "regional_breakout";
      trend.badge = "🌍 Regional Breakout";
    } else if (latest.weekly_change_pct > 100) {
      trend.pattern = "trending";
      trend.badge = "📈 Trending";
    }

    // Check for seasonal pattern (look for same-month spikes in previous data)
    const currentMonth = new Date().getMonth();
    const sameMonthData = data.filter((d: any) => new Date(d.date).getMonth() === currentMonth);
    if (sameMonthData.length >= 2 && sameMonthData.every((d: any) => d.weekly_change_pct > 30)) {
      trend.pattern = "seasonal";
      trend.badge = "📅 Seasonal";
    }

    trends.push(trend);
  }

  // Generate catalog-level alert
  const viralCount = trends.filter(t => t.pattern === "viral_spike" || t.pattern === "trending").length;
  if (viralCount > 0) {
    alerts.unshift({
      type: "catalog_alert",
      message: `${viralCount} song${viralCount > 1 ? "s" : ""} in your catalog ${viralCount > 1 ? "are" : "is"} experiencing viral growth`,
    });
  }

  return new Response(JSON.stringify({ trends, alerts, total_tracked: Object.keys(bySong).length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getSongVelocity(supabase: any, songKey: string, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const { data } = await supabase
    .from("streaming_velocity")
    .select("*")
    .eq("song_key", songKey)
    .gte("date", since)
    .order("date", { ascending: true });

  return new Response(JSON.stringify({ song_key: songKey, history: data || [], days }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
