import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { songTitle, songArtist } = await req.json();
    if (!songTitle || !songArtist) {
      return new Response(JSON.stringify({ error: "songTitle and songArtist required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const cacheKey = `yt_cid_${songTitle.toLowerCase()}_${songArtist.toLowerCase()}`.replace(/\s+/g, "_");

    // Check cache
    const { data: cached } = await supabase
      .from("youtube_content_id")
      .select("*")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify({
        video_count: cached.video_count,
        total_views: cached.total_views,
        estimated_revenue: cached.estimated_revenue,
        claim_count: cached.claim_count,
        top_videos: cached.top_videos,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Search YouTube for videos using the song
    const query = encodeURIComponent(`${songTitle} ${songArtist}`);
    let videos: any[] = [];
    let totalViews = 0;

    if (YOUTUBE_API_KEY) {
      // Search for videos
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=20&order=viewCount&key=${YOUTUBE_API_KEY}`;
      const searchRes = await fetch(searchUrl);
      
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const videoIds = (searchData.items || []).map((item: any) => item.id.videoId).filter(Boolean);

        if (videoIds.length > 0) {
          // Get video statistics
          const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(",")}&key=${YOUTUBE_API_KEY}`;
          const statsRes = await fetch(statsUrl);
          
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            videos = (statsData.items || []).map((item: any) => {
              const views = parseInt(item.statistics?.viewCount || "0", 10);
              totalViews += views;
              return {
                title: item.snippet?.title || "Untitled",
                url: `https://www.youtube.com/watch?v=${item.id}`,
                views,
                channel: item.snippet?.channelTitle || "Unknown",
              };
            });
            videos.sort((a: any, b: any) => b.views - a.views);
          }
        }
      }
    } else {
      // Fallback: estimate based on search without API key
      // Return minimal data
      return new Response(JSON.stringify({
        video_count: 0,
        total_views: 0,
        estimated_revenue: 0,
        claim_count: 0,
        top_videos: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Estimate Content ID revenue at ~$0.002 per view (industry average for music)
    const estimatedRevenue = totalViews * 0.002;
    const videoCount = videos.length;
    // Approximate claim count (most matched videos would have claims)
    const claimCount = Math.round(videoCount * 0.7);

    const result = {
      video_count: videoCount,
      total_views: totalViews,
      estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
      claim_count: claimCount,
      top_videos: videos.slice(0, 10),
    };

    // Cache result
    await supabase.from("youtube_content_id").upsert({
      cache_key: cacheKey,
      song_title: songTitle,
      song_artist: songArtist,
      video_count: result.video_count,
      total_views: result.total_views,
      estimated_revenue: result.estimated_revenue,
      claim_count: result.claim_count,
      top_videos: result.top_videos,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "cache_key" });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("YouTube Content ID error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
