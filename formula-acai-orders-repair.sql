-- Fórmula Açaí: correção segura da tabela de pedidos. Não altera store_state.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null default '',
  address text not null default '',
  reference text not null default '',
  payment text not null default '',
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  distance_km numeric(8,3) not null default 0,
  delivery_latitude double precision,
  delivery_longitude double precision,
  created_at timestamptz not null default now()
);
alter table public.orders add column if not exists customer_name text not null default '';
alter table public.orders add column if not exists address text not null default '';
alter table public.orders add column if not exists reference text not null default '';
alter table public.orders add column if not exists payment text not null default '';
alter table public.orders add column if not exists notes text not null default '';
alter table public.orders add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists subtotal numeric(10,2) not null default 0;
alter table public.orders add column if not exists delivery_fee numeric(10,2) not null default 0;
alter table public.orders add column if not exists total numeric(10,2) not null default 0;
alter table public.orders add column if not exists distance_km numeric(8,3) not null default 0;
alter table public.orders add column if not exists delivery_latitude double precision;
alter table public.orders add column if not exists delivery_longitude double precision;
alter table public.orders add column if not exists created_at timestamptz not null default now();
alter table public.orders enable row level security;
grant insert on public.orders to anon, authenticated;
grant select on public.orders to authenticated;
drop policy if exists "Customers can create orders" on public.orders;
create policy "Customers can create orders" on public.orders for insert to anon, authenticated with check (true);
drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders" on public.orders for select to authenticated using (true);
