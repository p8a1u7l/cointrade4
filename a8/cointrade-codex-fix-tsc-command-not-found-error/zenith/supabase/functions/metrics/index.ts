import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.5';

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ error: 'Missing Supabase credentials' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const [{ data: equity }, { data: fills }, { data: signals }] = await Promise.all([
    supabase.from('trade_equity').select('*').order('recorded_at', { ascending: false }).limit(1),
    supabase
      .from('trade_fills')
      .select('symbol, filled_qty, avg_price, bias')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('trade_signals').select('risk_level').order('created_at', { ascending: false }).limit(1),
  ]);

  const latest = equity?.[0];
  const realized = fills?.reduce((acc, fill) => {
    const direction = fill.bias === 'long' ? 1 : -1;
    return acc + direction * Number(fill.filled_qty) * Number(fill.avg_price);
  }, 0) ?? 0;

  const body = {
    balance: Number(latest?.balance ?? 0),
    equity: Number(latest?.equity ?? 0),
    pnlPercent: Number(latest?.pnl_percent ?? 0),
    realized,
    riskLevel: Number(signals?.[0]?.risk_level ?? 3),
  };

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
});
