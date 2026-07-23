-- Jalankan seluruh isi file ini satu kali di Supabase > SQL Editor.
-- Tabel hanya dapat dibaca/diubah oleh pengguna yang sudah login.

create table if not exists public.vehicle_records (
  record_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.follow_up_records (
  record_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.geo_cache_records (
  record_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.app_settings (
  record_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.vehicle_records enable row level security;
alter table public.follow_up_records enable row level security;
alter table public.geo_cache_records enable row level security;
alter table public.app_settings enable row level security;

grant select, insert, update, delete on public.vehicle_records to authenticated;
grant select, insert, update, delete on public.follow_up_records to authenticated;
grant select, insert, update, delete on public.geo_cache_records to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;

drop policy if exists "authenticated_all_vehicle_records" on public.vehicle_records;
create policy "authenticated_all_vehicle_records" on public.vehicle_records
for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "authenticated_all_follow_up_records" on public.follow_up_records;
create policy "authenticated_all_follow_up_records" on public.follow_up_records
for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "authenticated_all_geo_cache_records" on public.geo_cache_records;
create policy "authenticated_all_geo_cache_records" on public.geo_cache_records
for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "authenticated_all_app_settings" on public.app_settings;
create policy "authenticated_all_app_settings" on public.app_settings
for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
