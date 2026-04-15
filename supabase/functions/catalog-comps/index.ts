import { corsHeaders } from '@supabase/supabase-js/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { genre, min_price, max_price, limit = 20 } = await req.json();

    // Fetch existing comparables from DB
    let query = supabase
      .from('catalog_comparables')
      .select('*')
      .order('sale_date', { ascending: false })
      .limit(Math.min(limit, 50));

    if (genre) query = query.ilike('genre', `%${genre}%`);
    if (min_price) query = query.gte('sale_price', min_price);
    if (max_price) query = query.lte('sale_price', max_price);

    const { data: comparables, error } = await query;
    if (error) throw error;

    // Calculate market stats
    const withMultiple = (comparables || []).filter((c: any) => c.multiple != null && c.multiple > 0);
    const avgMultiple = withMultiple.length > 0
      ? withMultiple.reduce((sum: number, c: any) => sum + c.multiple, 0) / withMultiple.length
      : null;
    const medianMultiple = withMultiple.length > 0
      ? withMultiple.sort((a: any, b: any) => a.multiple - b.multiple)[Math.floor(withMultiple.length / 2)]?.multiple
      : null;

    const withPrice = (comparables || []).filter((c: any) => c.sale_price != null);
    const avgPrice = withPrice.length > 0
      ? withPrice.reduce((sum: number, c: any) => sum + Number(c.sale_price), 0) / withPrice.length
      : null;

    // Genre breakdown
    const genreBreakdown: Record<string, { count: number; avgMultiple: number }> = {};
    for (const c of withMultiple) {
      const g = c.genre || 'Unknown';
      if (!genreBreakdown[g]) genreBreakdown[g] = { count: 0, avgMultiple: 0 };
      genreBreakdown[g].count++;
      genreBreakdown[g].avgMultiple += c.multiple;
    }
    for (const g of Object.keys(genreBreakdown)) {
      genreBreakdown[g].avgMultiple = Math.round((genreBreakdown[g].avgMultiple / genreBreakdown[g].count) * 10) / 10;
    }

    return new Response(JSON.stringify({
      success: true,
      comparables: comparables || [],
      market_stats: {
        total_transactions: (comparables || []).length,
        avg_multiple: avgMultiple ? Math.round(avgMultiple * 10) / 10 : null,
        median_multiple: medianMultiple,
        avg_sale_price: avgPrice ? Math.round(avgPrice) : null,
        genre_breakdown: genreBreakdown,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Catalog comps error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
