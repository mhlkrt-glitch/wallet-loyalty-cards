-- Wallet shared loyalty cards.
-- This migration only adds wallet-specific tables; it does NOT modify existing app tables.
-- Public shared-access mode: visitors who can access the site may read, add, edit, and delete cards.
-- For private groups, add Supabase Auth and replace these policies with authenticated/role-based policies.

create extension if not exists pgcrypto;

create table if not exists public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  store_name text not null,
  card_name text not null,
  card_number text not null default '',
  barcode_format text not null default '',
  barcode_image text not null default '',
  store_image text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_stores (
  name text primary key,
  image text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.loyalty_cards enable row level security;
alter table public.loyalty_stores enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.loyalty_cards to anon, authenticated;
grant select, insert, update on table public.loyalty_stores to anon, authenticated;

drop policy if exists "Public can view shared cards" on public.loyalty_cards;
drop policy if exists "Public can add shared cards" on public.loyalty_cards;
drop policy if exists "Public can edit shared cards" on public.loyalty_cards;
drop policy if exists "Public can delete shared cards" on public.loyalty_cards;
create policy "Public can view shared cards" on public.loyalty_cards for select to anon, authenticated using (true);
create policy "Public can add shared cards" on public.loyalty_cards for insert to anon, authenticated with check (true);
create policy "Public can edit shared cards" on public.loyalty_cards for update to anon, authenticated using (true) with check (true);
create policy "Public can delete shared cards" on public.loyalty_cards for delete to anon, authenticated using (true);

drop policy if exists "Public can view stores" on public.loyalty_stores;
drop policy if exists "Public can add stores" on public.loyalty_stores;
drop policy if exists "Public can edit stores" on public.loyalty_stores;
create policy "Public can view stores" on public.loyalty_stores for select to anon, authenticated using (true);
create policy "Public can add stores" on public.loyalty_stores for insert to anon, authenticated with check (true);
create policy "Public can edit stores" on public.loyalty_stores for update to anon, authenticated using (true) with check (true);

-- Realtime change feed for cross-device synchronization.
alter table public.loyalty_cards replica identity full;
alter table public.loyalty_stores replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loyalty_cards') then
    alter publication supabase_realtime add table public.loyalty_cards;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loyalty_stores') then
    alter publication supabase_realtime add table public.loyalty_stores;
  end if;
end $$;

insert into public.loyalty_stores(name) values
('5 Элемент'), ('Белоруснефть'), ('Санта'), ('Евроопт'), ('Prostore-ВПРОК'),
('goodshop'), ('Соседи-Купилка'), ('Спортмастер'), ('Три цены'), ('FIX Price'),
('Алеся'), ('Доброnom'), ('Планета здоровья'), ('Электросила')
on conflict (name) do nothing;
