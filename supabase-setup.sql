-- Fórmula Açaí: estado central do cardápio
create table if not exists public.store_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.store_state enable row level security;

grant select on public.store_state to anon, authenticated;
grant insert, update on public.store_state to authenticated;

drop policy if exists "Public can read store menu" on public.store_state;
create policy "Public can read store menu" on public.store_state
  for select to anon, authenticated
  using (id = 'formula-acai-main');

drop policy if exists "Authenticated admins can insert store menu" on public.store_state;
create policy "Authenticated admins can insert store menu" on public.store_state
  for insert to authenticated
  with check (id = 'formula-acai-main');

drop policy if exists "Authenticated admins can update store menu" on public.store_state;
create policy "Authenticated admins can update store menu" on public.store_state
  for update to authenticated
  using (id = 'formula-acai-main')
  with check (id = 'formula-acai-main');

-- Habilita Realtime para a tabela (pode ser executado mais de uma vez).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'store_state'
  ) then
    alter publication supabase_realtime add table public.store_state;
  end if;
end $$;
