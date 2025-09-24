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
