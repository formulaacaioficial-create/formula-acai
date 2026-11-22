-- Fórmula Açaí: histórico de pedidos
-- Seguro para executar mais de uma vez; não altera nem apaga store_state.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  address text not null,
  reference text not null default '',
  payment text not null,
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  distance_km numeric(8,3) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;
grant insert on public.orders to anon, authenticated;
grant select on public.orders to authenticated;
drop policy if exists "Customers can create orders" on public.orders;
create policy "Customers can create orders" on public.orders
  for insert to anon, authenticated
  with check (true);
drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders" on public.orders
  for select to authenticated
  using (true);
