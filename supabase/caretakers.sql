-- Struktura tabeli opiekunów oraz tabeli łączącej ich ze świetlicami.
-- Uruchom w SQL Editorze Supabase po wcześniejszym wdrożeniu głównego schema.sql.

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

grant execute on function public.current_caretaker_id() to anon;

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

-- Funkcja pomocnicza do logowania opiekuna po loginie.
drop function if exists public.caretaker_login_get(text);
create or replace function public.caretaker_login_get(p_login text)
returns table (
  id uuid,
  login text,
  password_hash text,
  first_name text,
  last_name_or_company text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.login,
    c.password_hash,
    c.first_name,
    c.last_name_or_company
  from public.caretakers c
  where lower(c.login) = lower(p_login)
  limit 1;
$$;

grant execute on function public.caretaker_login_get(text) to anon;

-- Polityki RLS umożliwiające odczyt danych opiekuna z nagłówka X-Caretaker-Id lub claimu caretaker_id.
drop policy if exists "Caretaker can read self" on public.caretakers;
create policy "Caretaker can read self"
  on public.caretakers
  for select
  to anon
  using (
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

-- Funkcja zwracająca rezerwacje przypisane do opiekuna po zweryfikowaniu skrótu hasła.
drop function if exists public.caretaker_reservations_secure(text, text);
create or replace function public.caretaker_reservations_secure(p_login text, p_password_hash text)
returns table (
  caretaker_id uuid,
  caretaker_login text,
  facility_id uuid,
  facility_name text,
  booking_id uuid,
  booking_start timestamptz,
  booking_end timestamptz,
  booking_status text,
  booking_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_caretaker public.caretakers%rowtype;
begin
  select *
  into auth_caretaker
  from public.caretakers
  where lower(login) = lower(p_login)
  limit 1;

  if auth_caretaker.id is null then
    return;
  end if;

  if auth_caretaker.password_hash <> p_password_hash then
    return;
  end if;

  return query
  select
    auth_caretaker.id as caretaker_id,
    auth_caretaker.login as caretaker_login,
    fc.facility_id,
    f.name as facility_name,
    b.id as booking_id,
    b.start_time as booking_start,
    b.end_time as booking_end,
    b.status as booking_status,
    b.title as booking_title
  from public.facility_caretakers fc
  join public.facilities f on f.id = fc.facility_id
  left join public.bookings b on b.facility_id = fc.facility_id
  where fc.caretaker_id = auth_caretaker.id;
end;
$$;

grant execute on function public.caretaker_reservations_secure(text, text) to anon;
