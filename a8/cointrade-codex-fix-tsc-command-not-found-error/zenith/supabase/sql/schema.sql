create table if not exists public.trade_signals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  symbol text not null,
  bias text not null,
  confidence numeric not null,
  reasoning text,
  risk_level integer not null
);

create table if not exists public.trade_fills (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  symbol text not null,
  order_id text not null,
  status text not null,
  filled_qty numeric not null,
  avg_price numeric not null,
  bias text not null
);

create table if not exists public.trade_equity (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz default now(),
  balance numeric not null,
  equity numeric not null,
  pnl_percent numeric not null
);

create view public.vw_symbol_performance as
select
  s.symbol,
  count(distinct s.id) as signals,
  coalesce(sum(f.filled_qty * f.avg_price * case when f.bias = 'long' then 1 else -1 end), 0) as notional,
  coalesce(avg(f.avg_price), 0) as avg_price,
  coalesce(sum(f.filled_qty), 0) as total_contracts
from public.trade_signals s
left join public.trade_fills f on f.symbol = s.symbol and f.created_at >= s.created_at
group by 1;
