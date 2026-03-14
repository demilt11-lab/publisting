import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date().toISOString();
    const results: Record<string, number> = {};

    // Clean up all cache tables with expires_at columns
    const cacheTables = [
      'streaming_stats_cache',
      'chart_placements_cache',
      'radio_airplay_cache',
      'hunter_email_cache',
      'mlc_shares_cache',
      'pro_cache',
    ];

    for (const table of cacheTables) {
      const { data, error } = await supabase
        .from(table)
        .delete()
        .lt('expires_at', now)
        .select('id');

      if (error) {
        console.warn(`Failed to clean ${table}:`, error.message);
        results[table] = -1;
      } else {
        results[table] = data?.length ?? 0;
        console.log(`Cleaned ${data?.length ?? 0} expired rows from ${table}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, cleaned: results, timestamp: now }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Cache cleanup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
