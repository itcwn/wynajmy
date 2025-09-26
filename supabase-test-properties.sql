-- Przed uruchomieniem upewnij się, że masz włączone rozszerzenie pgcrypto.

create extension if not exists "pgcrypto";

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  address text not null,
  description text not null,
  price numeric(12,2) not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.properties enable row level security;

create policy if not exists "Properties insert for authenticated users"
  on public.properties
  for insert
  to authenticated
  with check (created_by = auth.uid());


create policy if not exists "Properties select for owners"
  on public.properties
  for select

  to authenticated
  using (created_by = auth.uid());

create policy if not exists "Properties update for owners"
  on public.properties
  for update

  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy if not exists "Properties delete for owners"
  on public.properties
  for delete
  to authenticated
  using (created_by = auth.uid());

create or replace function public.properties_set_owner()
returns trigger as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists set_properties_owner on public.properties;

create trigger set_properties_owner
before insert on public.properties
for each row execute function public.properties_set_owner();
