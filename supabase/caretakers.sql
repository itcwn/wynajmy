-- Struktura tabeli opiekunów oraz tabeli łączącej ich ze świetlicami.
-- Uruchom w SQL Editorze Supabase po wcześniejszym wdrożeniu głównego schema.sql.

create table if not exists public.caretakers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name_or_company text not null,
  phone text not null,
  email text not null,
  login text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists caretakers_login_unique
  on public.caretakers (lower(login));

create unique index if not exists caretakers_email_unique
  on public.caretakers (lower(email));

create or replace function public.set_caretaker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists caretakers_set_updated_at on public.caretakers;
create trigger caretakers_set_updated_at
before update on public.caretakers
for each row execute function public.set_caretaker_updated_at();

create table if not exists public.facility_caretakers (
  caretaker_id uuid not null references public.caretakers(id) on delete cascade,
  -- Upewnij się, że typ kolumny odpowiada typowi public.facilities.id (standardowo uuid).
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (caretaker_id, facility_id)
);

create index if not exists facility_caretakers_facility_idx
  on public.facility_caretakers (facility_id);

create index if not exists facility_caretakers_caretaker_idx
  on public.facility_caretakers (caretaker_id);

alter table public.caretakers enable row level security;
alter table public.facility_caretakers enable row level security;

drop policy if exists "Allow anonymous caretakers insert" on public.caretakers;
create policy "Allow anonymous caretakers insert"
  on public.caretakers
  for insert
  to anon
  with check (true);

drop policy if exists "Allow anonymous facility caretakers insert" on public.facility_caretakers;
create policy "Allow anonymous facility caretakers insert"
  on public.facility_caretakers
  for insert
  to anon
  with check (true);
