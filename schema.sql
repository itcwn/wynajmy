-- Podstawowy schemat bazy dla aplikacji rezerwacji świetlic.
-- Uruchom w Supabase przed skryptami dodatkowymi (np. supabase/caretaker_access.sql).

set search_path = public;

create extension if not exists "pgcrypto";

-- Funkcja wspierająca aktualizację kolumn updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- Funkcja zwracająca identyfikator opiekuna na podstawie nagłówków żądania.
create or replace function public.current_caretaker_id()
returns uuid
language plpgsql
stable
as $$
declare
  header text;
  claims jsonb;
  caretaker uuid;
begin
  header := nullif(current_setting('request.header.x-caretaker-id', true), '');
  if header is not null then
    begin
      caretaker := header::uuid;
      return caretaker;
    exception when others then
      null;
    end;
  end if;

  claims := current_setting('request.jwt.claims', true)::jsonb;
  if claims is not null then
    begin
      caretaker := (claims ->> 'caretaker_id')::uuid;
      return caretaker;
    exception when others then
      return null;
    end;
  end if;

  return null;
end;
$$;

grant execute on function public.current_caretaker_id() to anon, authenticated;


-- Tabela obiektów (świetlic).
create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  postal_code text,
  city text,
  address_line1 text,
  address_line2 text,
  capacity integer,
  price_per_hour numeric(12,2),
  price_per_day numeric(12,2),
  lat numeric(10,6),
  lng numeric(10,6),
  description text,
  image_urls text,
  caretaker_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists facilities_name_idx
  on public.facilities (lower(name));

create index if not exists facilities_city_idx
  on public.facilities (lower(city));

drop trigger if exists facilities_set_updated_at on public.facilities;
create trigger facilities_set_updated_at
before update on public.facilities
for each row execute function public.set_updated_at();

-- Słownik udogodnień.
create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists amenities_active_order_idx
  on public.amenities (is_active desc, order_index, lower(name));

drop trigger if exists amenities_set_updated_at on public.amenities;
create trigger amenities_set_updated_at
before update on public.amenities
for each row execute function public.set_updated_at();

-- Przypisanie udogodnień do świetlic.
create table if not exists public.facility_amenities (
  facility_id uuid not null references public.facilities(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (facility_id, amenity_id)
);

create index if not exists facility_amenities_amenity_idx
  on public.facility_amenities (amenity_id);


-- Dane opiekunów świetlic.
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

drop trigger if exists caretakers_set_updated_at on public.caretakers;
create trigger caretakers_set_updated_at
before update on public.caretakers
for each row execute function public.set_updated_at();

-- Powiązania świetlic z opiekunami.
create table if not exists public.facility_caretakers (
  caretaker_id uuid not null references public.caretakers(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (caretaker_id, facility_id)
);

create index if not exists facility_caretakers_facility_idx
  on public.facility_caretakers (facility_id);

create index if not exists facility_caretakers_caretaker_idx
  on public.facility_caretakers (caretaker_id);

-- Funkcja pomocnicza sprawdzająca istnienie opiekuna.
create or replace function public.caretaker_exists(p_caretaker_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.caretakers c
    where c.id = p_caretaker_id
  );
$$;

grant execute on function public.caretaker_exists(uuid) to anon, authenticated;

-- Konfiguracja polityk RLS dla opiekunów i przypisań.
alter table public.caretakers enable row level security;
alter table public.facility_caretakers enable row level security;

drop policy if exists "Allow anonymous caretakers insert" on public.caretakers;
create policy "Allow anonymous caretakers insert"
  on public.caretakers
  for insert
  to anon
  with check (true);

drop policy if exists "Caretaker can read self" on public.caretakers;
create policy "Caretaker can read self"
  on public.caretakers
  for select
  to anon
  using (
    public.current_caretaker_id() = id
  );

drop policy if exists "Caretaker can update self" on public.caretakers;
create policy "Caretaker can update self"
  on public.caretakers
  for update
  to anon
  using (
    public.current_caretaker_id() = id
  )
  with check (
    public.current_caretaker_id() = id
  );

drop policy if exists "Caretaker can see assigned facilities" on public.facility_caretakers;
create policy "Caretaker can see assigned facilities"
  on public.facility_caretakers
  for select
  to anon
  using (
    public.current_caretaker_id() = caretaker_id
  );

drop policy if exists "Caretaker can assign self" on public.facility_caretakers;
create policy "Caretaker can assign self"
  on public.facility_caretakers
  for insert
  to anon
  with check (
    public.current_caretaker_id() = caretaker_id
  );

drop policy if exists "Caretaker can unassign self" on public.facility_caretakers;
create policy "Caretaker can unassign self"
  on public.facility_caretakers
  for delete
  to anon
  using (
    public.current_caretaker_id() = caretaker_id
  );

-- Polityki RLS dla tabeli świetlic.
alter table public.facilities enable row level security;

drop policy if exists "Public read facilities" on public.facilities;
create policy "Public read facilities"
  on public.facilities
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Caretaker insert facilities" on public.facilities;
create policy "Caretaker insert facilities"
  on public.facilities
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.caretakers c
      where c.id = public.current_caretaker_id()
    )
  );

drop policy if exists "Caretaker update facilities" on public.facilities;
create policy "Caretaker update facilities"
  on public.facilities
  for update
  to anon, authenticated
  using (
    exists (
      select 1
      from public.facility_caretakers fc
      where fc.facility_id = id
        and fc.caretaker_id = public.current_caretaker_id()
    )
  )
  with check (
    exists (
      select 1
      from public.facility_caretakers fc
      where fc.facility_id = id
        and fc.caretaker_id = public.current_caretaker_id()
    )
  );

-- Automatyczne przypisanie nowej świetlicy do bieżącego opiekuna.
drop trigger if exists facilities_assign_caretaker on public.facilities;

create or replace function public.assign_caretaker_to_new_facility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caretaker uuid;
begin
  caretaker := public.current_caretaker_id();
  if caretaker is null then
    return new;
  end if;

  begin
    insert into public.facility_caretakers (caretaker_id, facility_id)
    values (caretaker, new.id)
    on conflict do nothing;
  exception when others then
    null;
  end;

  return new;
end;
$$;

grant execute on function public.assign_caretaker_to_new_facility() to anon, authenticated;

create trigger facilities_assign_caretaker
  after insert on public.facilities
  for each row
  execute function public.assign_caretaker_to_new_facility();


-- Słownik typów wydarzeń wykorzystywany przy rezerwacjach.
create table if not exists public.event_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_types_active_order_idx
  on public.event_types (is_active desc, order_index, lower(name));

drop trigger if exists event_types_set_updated_at on public.event_types;
create trigger event_types_set_updated_at
before update on public.event_types
for each row execute function public.set_updated_at();

-- Szablony dokumentów (wnioski, protokoły, itp.).
create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  facility_id uuid references public.facilities(id) on delete cascade,
  is_active boolean not null default true,
  html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists document_templates_code_facility_unique
  on public.document_templates (lower(code), facility_id);

create unique index if not exists document_templates_code_global_unique
  on public.document_templates (lower(code))
  where facility_id is null;

drop trigger if exists document_templates_set_updated_at on public.document_templates;
create trigger document_templates_set_updated_at
before update on public.document_templates
for each row execute function public.set_updated_at();

-- Rezerwacje świetlic.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  title text not null default 'Rezerwacja',
  event_type_id uuid references public.event_types(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  renter_name text not null,
  renter_email text not null,
  renter_phone text,
  notes text,
  is_public boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'active', 'cancelled', 'rejected', 'declined')),
  request_date timestamptz not null default now(),
  decision_comment text,
  cancel_token uuid not null default gen_random_uuid(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_end_after_start check (end_time > start_time)
);

create unique index if not exists bookings_cancel_token_unique
  on public.bookings (cancel_token);

create index if not exists bookings_facility_time_idx
  on public.bookings (facility_id, start_time, end_time);

create index if not exists bookings_status_idx
  on public.bookings (status);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- Widok uproszczonych danych rezerwacji udostępniany publicznie.
create or replace view public.public_bookings as
select
  b.id,
  b.facility_id,
  b.title,
  b.start_time,
  b.end_time,
  b.status,
  b.renter_name,
  b.notes
from public.bookings b
where b.is_public;

-- Funkcja anulująca rezerwację po tokenie.
create or replace function public.cancel_booking(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.bookings
  set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      updated_at = now()
  where cancel_token = p_token
    and status in ('pending', 'active');

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

grant execute on function public.cancel_booking(uuid) to anon, authenticated;

grant select on table public.public_bookings to anon, authenticated;
