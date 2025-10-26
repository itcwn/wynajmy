-- Migracja wprowadzająca obsługę wielu najemców (tenantów).
 
-- Jeśli nie masz uprawnień do ALTER DATABASE, możesz pozostawić konfigurację
-- sesji tej migracji – poniższy blok DO ustawi wartość domyślną na podstawie
-- zmiennej v_fallback_tenant.

set search_path = public;

DO $$
DECLARE
  v_fallback_tenant uuid := '98cf6ea0-80c4-4d88-b81d-73f3c6e8b07e'; -- ← zmień jeśli potrzebujesz innego domyślnego tenant_id
  v_current text;
BEGIN
  BEGIN
    v_current := nullif(current_setting('app.default_tenant_id', true), '');
  EXCEPTION WHEN others THEN
    v_current := null;
  END;

  IF v_current IS NULL THEN
    PERFORM set_config('app.default_tenant_id', v_fallback_tenant::text, false);
  END IF;
END;
$$;

 
-- Funkcja zwracająca identyfikator bieżącego najemcy.
create or replace function public.current_tenant_id()
returns uuid
language plpgsql
stable
as $$
declare
  header text;
  claim text;
begin
  header := nullif(current_setting('request.header.x-tenant-id', true), '');
  if header is not null then
    begin
      return header::uuid;
    exception when others then
      null;
    end;
  end if;

  begin
    claim := nullif(coalesce(auth.jwt()->>'tenant_id', ''), '');
    if claim is not null then
      return claim::uuid;
    end if;
  exception when others then
    null;
  end;

  header := nullif(current_setting('app.default_tenant_id', true), '');
  if header is not null then
    begin
      return header::uuid;
    exception when others then
      null;
    end;
  end if;

  return null;
end;
$$;

grant execute on function public.current_tenant_id() to anon, authenticated;

create or replace function public.resolve_tenant_for_facility(p_facility_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id
    into v_tenant
    from public.facilities
   where id = p_facility_id;

  return v_tenant;
end;
$$;

grant execute on function public.resolve_tenant_for_facility(uuid) to anon, authenticated;

create or replace function public.resolve_tenant_for_booking_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id
    into v_tenant
    from public.bookings
   where cancel_token = p_token;

  return v_tenant;
end;
$$;

grant execute on function public.resolve_tenant_for_booking_token(text) to anon, authenticated;

create or replace function public.resolve_tenant_for_caretaker(p_caretaker_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id
    into v_tenant
    from public.caretakers
   where id = p_caretaker_id;

  return v_tenant;
end;
$$;

grant execute on function public.resolve_tenant_for_caretaker(uuid) to anon, authenticated;

-- Dodanie kolumn tenant_id do kluczowych tabel (jeśli brak).
alter table public.facilities add column if not exists tenant_id uuid;
alter table public.amenities add column if not exists tenant_id uuid;
alter table public.facility_amenities add column if not exists tenant_id uuid;
alter table public.facility_checklist_items add column if not exists tenant_id uuid;
alter table public.caretakers add column if not exists tenant_id uuid;
alter table public.facility_caretakers add column if not exists tenant_id uuid;
alter table public.event_types add column if not exists tenant_id uuid;
alter table public.document_templates add column if not exists tenant_id uuid;
alter table public.bookings add column if not exists tenant_id uuid;
alter table public.booking_notification_events add column if not exists tenant_id uuid;

-- Uzupełnienie brakujących wartości tenant_id.
DO $$
DECLARE
  v_tenant uuid;
BEGIN
  BEGIN
    v_tenant := nullif(current_setting('app.default_tenant_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_tenant := null;
  END;
  IF v_tenant IS NULL THEN
    v_tenant := public.current_tenant_id();
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'TENANT_ID_REQUIRED_FOR_MIGRATION';
  END IF;

  UPDATE public.facilities SET tenant_id = coalesce(tenant_id, v_tenant);
  UPDATE public.amenities SET tenant_id = coalesce(tenant_id, v_tenant);
  UPDATE public.facility_amenities SET tenant_id = coalesce(tenant_id, v_tenant);
  UPDATE public.facility_checklist_items SET tenant_id = coalesce(tenant_id, v_tenant);
  UPDATE public.caretakers SET tenant_id = coalesce(tenant_id, v_tenant);
  UPDATE public.facility_caretakers SET tenant_id = coalesce(tenant_id, v_tenant);
  UPDATE public.event_types SET tenant_id = coalesce(tenant_id, v_tenant);
  UPDATE public.document_templates SET tenant_id = coalesce(tenant_id, v_tenant);
  UPDATE public.bookings SET tenant_id = coalesce(tenant_id, v_tenant);
  UPDATE public.booking_notification_events SET tenant_id = coalesce(tenant_id, v_tenant);
END;
$$;

-- Wymuszenie wartości tenant_id i dodanie ograniczeń.
alter table public.facilities alter column tenant_id set not null;
alter table public.facilities alter column tenant_id set default public.current_tenant_id();
alter table public.facilities drop constraint if exists facilities_tenant_nn;
alter table public.facilities add constraint facilities_tenant_nn check (tenant_id is not null);

drop index if exists facilities_name_idx;
create index facilities_name_idx on public.facilities (tenant_id, lower(name));

drop index if exists facilities_city_idx;
create index facilities_city_idx on public.facilities (tenant_id, lower(city));

create or replace view public.public_facilities as
select
  f.id,
  f.name,
  f.postal_code,
  f.city,
  f.address_line1,
  f.address_line2,
  f.capacity,
  (f.price_per_hour)::numeric(12,2) as price_per_hour,
  (f.price_per_day)::numeric(12,2) as price_per_day,
  f.price_list_url,
  f.rental_rules_url,
  (f.lat)::numeric(10,6) as lat,
  (f.lng)::numeric(10,6) as lng,
  f.description,
  f.image_urls,
  f.caretaker_instructions,
  f.created_at,
  f.updated_at
from public.list_public_facilities() f;

grant select on table public.public_facilities to anon, authenticated;

create or replace function public.list_public_facilities()
returns table (
  tenant_id uuid,
  id uuid,
  name text,
  postal_code text,
  city text,
  address_line1 text,
  address_line2 text,
  capacity integer,
  price_per_hour numeric(12,2),
  price_per_day numeric(12,2),
  price_list_url text,
  rental_rules_url text,
  lat numeric(10,6),
  lng numeric(10,6),
  description text,
  image_urls text,
  caretaker_instructions text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    f.tenant_id,
    f.id,
    f.name,
    f.postal_code,
    f.city,
    f.address_line1,
    f.address_line2,
    f.capacity,
    f.price_per_hour,
    f.price_per_day,
    f.price_list_url,
    f.rental_rules_url,
    f.lat,
    f.lng,
    f.description,
    f.image_urls,
    f.caretaker_instructions,
    f.created_at,
    f.updated_at
  from public.facilities f
  order by lower(coalesce(f.name, ''))
$$;

grant execute on function public.list_public_facilities() to anon, authenticated;

drop view if exists public.public_facilities;

create or replace view public.public_facilities as
select
  f.id,
  f.name,
  f.postal_code,
  f.city,
  f.address_line1,
  f.address_line2,
  f.capacity,
  (f.price_per_hour)::numeric(12,2) as price_per_hour,
  (f.price_per_day)::numeric(12,2) as price_per_day,
  f.price_list_url,
  f.rental_rules_url,
  (f.lat)::numeric(10,6) as lat,
  (f.lng)::numeric(10,6) as lng,
  f.description,
  f.image_urls,
  f.caretaker_instructions,
  f.created_at,
  f.updated_at
from public.list_public_facilities() f;

grant select on table public.public_facilities to anon, authenticated;

alter table public.facilities enable row level security;

drop policy if exists "Public read facilities" on public.facilities;
create policy "Public read facilities"
  on public.facilities
  for select
  to anon, authenticated
  using (
    tenant_id = public.current_tenant_id()
  );

drop policy if exists "Caretaker insert facilities" on public.facilities;
create policy "Caretaker insert facilities"
  on public.facilities
  for insert
  to authenticated
  with check (
    public.caretaker_exists(public.current_caretaker_id())
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "Caretaker update facilities" on public.facilities;
create policy "Caretaker update facilities"
  on public.facilities
  for update
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1
      from public.facility_caretakers fc
      where fc.facility_id = id
        and fc.caretaker_id = public.current_caretaker_id()
        and fc.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1
      from public.facility_caretakers fc
      where fc.facility_id = id
        and fc.caretaker_id = public.current_caretaker_id()
        and fc.tenant_id = public.current_tenant_id()
    )
  );

-- Udogodnienia
alter table public.amenities alter column tenant_id set not null;
alter table public.amenities alter column tenant_id set default public.current_tenant_id();
alter table public.amenities drop constraint if exists amenities_tenant_nn;
alter table public.amenities add constraint amenities_tenant_nn check (tenant_id is not null);

drop index if exists amenities_active_order_idx;
create index amenities_active_order_idx on public.amenities (tenant_id, is_active desc, order_index, lower(name));

drop view if exists public.public_amenities;

create or replace function public.list_public_amenities()
returns table (
  facility_id uuid,
  amenity_id uuid,
  name text,
  description text,
  order_index integer
)
language sql
security definer
set search_path = public
as $$
  select
    fa.facility_id,
    a.id as amenity_id,
    a.name,
    a.description,
    a.order_index
  from public.facility_amenities fa
  join public.amenities a on a.id = fa.amenity_id
  join public.list_public_facilities() f
    on f.id = fa.facility_id
   and f.tenant_id = fa.tenant_id
   and f.tenant_id = a.tenant_id
  where coalesce(a.is_active, true)
  order by fa.facility_id, coalesce(a.order_index, 0), lower(coalesce(a.name, ''))
$$;

grant execute on function public.list_public_amenities() to anon, authenticated;

create or replace view public.public_amenities as
select
  facility_id,
  amenity_id as id,
  name,
  description,
  order_index
from public.list_public_amenities();

grant select on table public.public_amenities to anon, authenticated;

alter table public.amenities enable row level security;

drop policy if exists "Public read amenities" on public.amenities;
create policy "Public read amenities"
  on public.amenities
  for select
  to anon, authenticated
  using (
    coalesce(is_active, true)
  );

drop policy if exists "Authenticated manage amenities" on public.amenities;
create policy "Authenticated manage amenities"
  on public.amenities
  for all
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

-- Powiązania obiektów z udogodnieniami
alter table public.facility_amenities alter column tenant_id set not null;
alter table public.facility_amenities alter column tenant_id set default public.current_tenant_id();
alter table public.facility_amenities drop constraint if exists facility_amenities_tenant_nn;
alter table public.facility_amenities add constraint facility_amenities_tenant_nn check (tenant_id is not null);

drop index if exists facility_amenities_amenity_idx;
create index facility_amenities_amenity_idx on public.facility_amenities (tenant_id, amenity_id);

alter table public.facility_amenities drop constraint if exists facility_amenities_pkey;
alter table public.facility_amenities add primary key (tenant_id, facility_id, amenity_id);

create or replace view public.public_facility_amenities as
select
  facility_id,
  amenity_id
from public.list_public_amenities();

grant select on table public.public_facility_amenities to anon, authenticated;

alter table public.facility_amenities enable row level security;

drop policy if exists "Public read facility amenities" on public.facility_amenities;
create policy "Public read facility amenities"
  on public.facility_amenities
  for select
  to anon, authenticated
  using (
    tenant_id = public.current_tenant_id()
  );

drop policy if exists "Authenticated manage facility amenities" on public.facility_amenities;
create policy "Authenticated manage facility amenities"
  on public.facility_amenities
  for all
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

-- Lista kontrolna przekazania/zdania
alter table public.facility_checklist_items alter column tenant_id set not null;
alter table public.facility_checklist_items alter column tenant_id set default public.current_tenant_id();
alter table public.facility_checklist_items drop constraint if exists facility_checklist_items_tenant_nn;
alter table public.facility_checklist_items add constraint facility_checklist_items_tenant_nn check (tenant_id is not null);

drop index if exists facility_checklist_items_facility_phase_idx;
create index facility_checklist_items_facility_phase_idx on public.facility_checklist_items (tenant_id, facility_id, phase, order_index, id);

alter table public.facility_checklist_items enable row level security;

drop policy if exists "Caretaker read facility checklist" on public.facility_checklist_items;
create policy "Caretaker read facility checklist"
  on public.facility_checklist_items
  for select
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
  );

drop policy if exists "Caretaker manage facility checklist" on public.facility_checklist_items;
create policy "Caretaker manage facility checklist"
  on public.facility_checklist_items
  for all
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

-- Opiekunowie
alter table public.caretakers alter column tenant_id set not null;
alter table public.caretakers alter column tenant_id set default public.current_tenant_id();
alter table public.caretakers drop constraint if exists caretakers_tenant_nn;
alter table public.caretakers add constraint caretakers_tenant_nn check (tenant_id is not null);

drop index if exists caretakers_email_unique;
create unique index caretakers_email_unique on public.caretakers (tenant_id, lower(email));

drop index if exists caretakers_login_unique;
create unique index caretakers_login_unique on public.caretakers (tenant_id, lower(login));

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
      and c.tenant_id = public.current_tenant_id()
  );
$$;

grant execute on function public.caretaker_exists(uuid) to anon, authenticated;

create or replace function public.create_caretaker_profile(
  p_id uuid,
  p_first_name text,
  p_last_name_or_company text,
  p_phone text,
  p_email text,
  p_login text
)
returns public.caretakers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
  v_result public.caretakers%rowtype;
  v_tenant uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    raise exception using message = 'TENANT_ID_REQUIRED';
  end if;

  if p_id is null then
    raise exception using message = 'USER_ID_REQUIRED';
  end if;

  select *
    into v_user
    from auth.users
   where id = p_id;

  if not found then
    raise exception using message = 'USER_NOT_FOUND';
  end if;

  if coalesce(lower(v_user.email), '') <> coalesce(lower(p_email), '') then
    raise exception using message = 'EMAIL_MISMATCH';
  end if;

  insert into public.caretakers as c (tenant_id, id, first_name, last_name_or_company, phone, email, login)
  values (
    v_tenant,
    p_id,
    trim(both from coalesce(p_first_name, '')),
    trim(both from coalesce(p_last_name_or_company, '')),
    trim(both from coalesce(p_phone, '')),
    trim(both from coalesce(p_email, '')),
    trim(both from coalesce(p_login, ''))
  )
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name_or_company = excluded.last_name_or_company,
        phone = excluded.phone,
        email = excluded.email,
        login = excluded.login,
        tenant_id = excluded.tenant_id,
        updated_at = now()
  returning c.* into v_result;

  return v_result;
end;
$$;

grant execute on function public.create_caretaker_profile(uuid, text, text, text, text, text) to anon, authenticated;

alter table public.caretakers enable row level security;

drop policy if exists "Allow anonymous caretakers insert" on public.caretakers;
create policy "Allow anonymous caretakers insert"
  on public.caretakers
  for insert
  to authenticated
  with check (
    auth.uid() = id
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "Caretaker can read self" on public.caretakers;
create policy "Caretaker can read self"
  on public.caretakers
  for select
  to authenticated
  using (
    auth.uid() = id
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "Caretaker can update self" on public.caretakers;
create policy "Caretaker can update self"
  on public.caretakers
  for update
  to authenticated
  using (
    auth.uid() = id
    and tenant_id = public.current_tenant_id()
  )
  with check (
    auth.uid() = id
    and tenant_id = public.current_tenant_id()
  );

-- Przypisania opiekunów do obiektów
alter table public.facility_caretakers alter column tenant_id set not null;
alter table public.facility_caretakers alter column tenant_id set default public.current_tenant_id();
alter table public.facility_caretakers drop constraint if exists facility_caretakers_tenant_nn;
alter table public.facility_caretakers add constraint facility_caretakers_tenant_nn check (tenant_id is not null);

drop index if exists facility_caretakers_facility_idx;
create index facility_caretakers_facility_idx on public.facility_caretakers (tenant_id, facility_id);

drop index if exists facility_caretakers_caretaker_idx;
create index facility_caretakers_caretaker_idx on public.facility_caretakers (tenant_id, caretaker_id);

alter table public.facility_caretakers drop constraint if exists facility_caretakers_pkey;
alter table public.facility_caretakers add primary key (tenant_id, caretaker_id, facility_id);

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
    insert into public.facility_caretakers (tenant_id, caretaker_id, facility_id)
    values (new.tenant_id, caretaker, new.id)
    on conflict do nothing;
  exception when others then
    null;
  end;

  return new;
end;
$$;

grant execute on function public.assign_caretaker_to_new_facility() to anon, authenticated;

alter table public.facility_caretakers enable row level security;

drop policy if exists "Caretaker can see assigned facilities" on public.facility_caretakers;
create policy "Caretaker can see assigned facilities"
  on public.facility_caretakers
  for select
  to authenticated
  using (
    public.current_caretaker_id() = caretaker_id
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "Caretaker can assign self" on public.facility_caretakers;
create policy "Caretaker can assign self"
  on public.facility_caretakers
  for insert
  to authenticated
  with check (
    public.current_caretaker_id() = caretaker_id
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "Caretaker can unassign self" on public.facility_caretakers;
create policy "Caretaker can unassign self"
  on public.facility_caretakers
  for delete
  to authenticated
  using (
    public.current_caretaker_id() = caretaker_id
    and tenant_id = public.current_tenant_id()
  );

-- Typy wydarzeń
alter table public.event_types alter column tenant_id set not null;
alter table public.event_types alter column tenant_id set default public.current_tenant_id();
alter table public.event_types drop constraint if exists event_types_tenant_nn;
alter table public.event_types add constraint event_types_tenant_nn check (tenant_id is not null);

drop index if exists event_types_active_order_idx;
create index event_types_active_order_idx on public.event_types (tenant_id, is_active desc, order_index, lower(name));

create or replace function public.list_public_event_types()
returns table (
  id uuid,
  name text,
  description text,
  order_index integer
)
language sql
security definer
set search_path = public
as $$
  with tenants as (
    select distinct tenant_id
    from public.list_public_facilities()
  )
  select distinct on (e.id)
    e.id,
    e.name,
    e.description,
    e.order_index
  from public.event_types e
  join tenants t on t.tenant_id = e.tenant_id
  where e.is_active
  order by e.id, e.order_index, lower(coalesce(e.name, ''))
$$;

grant execute on function public.list_public_event_types() to anon, authenticated;

create or replace view public.public_event_types as
select
  id,
  name,
  description,
  order_index
from public.list_public_event_types();

grant select on table public.public_event_types to anon, authenticated;

alter table public.event_types enable row level security;

drop policy if exists "Public read event types" on public.event_types;
create policy "Public read event types"
  on public.event_types
  for select
  to anon, authenticated
  using (
    tenant_id = public.current_tenant_id()
    and is_active
  );

drop policy if exists "Authenticated manage event types" on public.event_types;
create policy "Authenticated manage event types"
  on public.event_types
  for all
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

-- Szablony dokumentów
alter table public.document_templates alter column tenant_id set not null;
alter table public.document_templates alter column tenant_id set default public.current_tenant_id();
alter table public.document_templates drop constraint if exists document_templates_tenant_nn;
alter table public.document_templates add constraint document_templates_tenant_nn check (tenant_id is not null);

drop index if exists document_templates_code_facility_unique;
create unique index document_templates_code_facility_unique on public.document_templates (tenant_id, lower(code), facility_id);

drop index if exists document_templates_code_global_unique;
create unique index document_templates_code_global_unique on public.document_templates (tenant_id, lower(code)) where facility_id is null;

alter table public.document_templates enable row level security;

drop policy if exists "Caretaker read document templates" on public.document_templates;
create policy "Caretaker read document templates"
  on public.document_templates
  for select
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
  );

drop policy if exists "Caretaker manage document templates" on public.document_templates;
create policy "Caretaker manage document templates"
  on public.document_templates
  for all
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

-- Rezerwacje
alter table public.bookings alter column tenant_id set not null;
alter table public.bookings alter column tenant_id set default public.current_tenant_id();
alter table public.bookings drop constraint if exists bookings_tenant_nn;
alter table public.bookings add constraint bookings_tenant_nn check (tenant_id is not null);

drop index if exists bookings_cancel_token_unique;
create unique index bookings_cancel_token_unique on public.bookings (tenant_id, cancel_token);

drop index if exists bookings_facility_time_idx;
create index bookings_facility_time_idx on public.bookings (tenant_id, facility_id, start_time, end_time);

drop index if exists bookings_status_idx;
create index bookings_status_idx on public.bookings (tenant_id, status);

create or replace function public.list_public_bookings()
returns table (
  id uuid,
  facility_id uuid,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  renter_name text,
  notes text
)
language sql
security definer
set search_path = public
as $$
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
  join public.list_public_facilities() f
    on f.id = b.facility_id
   and f.tenant_id = b.tenant_id
  where b.is_public
$$;

grant execute on function public.list_public_bookings() to anon, authenticated;

create or replace view public.public_bookings as
select
  id,
  facility_id,
  title,
  start_time,
  end_time,
  status,
  renter_name,
  notes
from public.list_public_bookings();

grant select on table public.public_bookings to anon, authenticated;

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
    and status in ('pending', 'active')
    and tenant_id = public.current_tenant_id();

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

grant execute on function public.cancel_booking(uuid) to anon, authenticated;

alter table public.bookings enable row level security;

drop policy if exists "Anonymous can create pending bookings" on public.bookings;
create policy "Anonymous can create pending bookings"
  on public.bookings
  for insert
  to anon
  with check (
    status = 'pending'
    and is_public = true
    and decision_comment is null
    and cancelled_at is null
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "Authenticated manage bookings" on public.bookings;
create policy "Authenticated manage bookings"
  on public.bookings
  for all
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

create or replace function public.get_booking_notification_payload(
  p_booking_id uuid default null,
  p_cancel_token uuid default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with target as (
    select
      b.id,
      b.facility_id,
      b.title,
      b.start_time,
      b.end_time,
      b.status,
      b.renter_name,
      b.renter_email,
      b.notes,
      b.cancel_token,
      b.created_at,
      b.updated_at,
      f.name as facility_name,
      f.city,
      f.postal_code,
      f.address_line1,
      f.address_line2,
      f.rental_rules_url,
      f.price_list_url,
      f.caretaker_instructions
    from public.bookings b
    join public.facilities f on f.id = b.facility_id
      and f.tenant_id = public.current_tenant_id()
    where b.tenant_id = public.current_tenant_id()
      and (
        (p_booking_id is not null and b.id = p_booking_id)
        or (
          p_cancel_token is not null
          and b.cancel_token = p_cancel_token
        )
      )
    order by b.updated_at desc
    limit 1
  ),
  caretakers as (
    select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'first_name', c.first_name,
          'last_name_or_company', c.last_name_or_company,
          'email', c.email,
          'phone', c.phone,
          'login', c.login
        )
        order by c.first_name, c.last_name_or_company
      ) as items
    from target t
    left join public.facility_caretakers fc
      on fc.facility_id = t.facility_id
     and fc.tenant_id = public.current_tenant_id()
    left join public.caretakers c
      on c.id = fc.caretaker_id
     and c.tenant_id = public.current_tenant_id()
  )
  select jsonb_build_object(
      'booking', jsonb_build_object(
        'id', t.id,
        'facility_id', t.facility_id,
        'title', t.title,
        'start_time', t.start_time,
        'end_time', t.end_time,
        'status', t.status,
        'renter_name', t.renter_name,
        'renter_email', t.renter_email,
        'notes', t.notes,
        'cancel_token', t.cancel_token,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ),
      'facility', jsonb_build_object(
        'id', t.facility_id,
        'name', t.facility_name,
        'city', t.city,
        'postal_code', t.postal_code,
        'address_line1', t.address_line1,
        'address_line2', t.address_line2,
        'rental_rules_url', t.rental_rules_url,
        'price_list_url', t.price_list_url,
        'caretaker_instructions', t.caretaker_instructions
      ),
      'caretakers', coalesce(c.items, '[]'::jsonb)
    )
  from target t
  left join caretakers c on true;
$$;

grant execute on function public.get_booking_notification_payload(uuid, uuid) to authenticated;

-- Kolejka powiadomień
alter table public.booking_notification_events alter column tenant_id set not null;
alter table public.booking_notification_events alter column tenant_id set default public.current_tenant_id();
alter table public.booking_notification_events drop constraint if exists booking_notification_events_tenant_nn;
alter table public.booking_notification_events add constraint booking_notification_events_tenant_nn check (tenant_id is not null);

drop index if exists booking_notification_events_status_created_idx;
create index booking_notification_events_status_created_idx on public.booking_notification_events (tenant_id, status, created_at);

create or replace function public.enqueue_booking_notification(
  p_event_type text,
  p_booking_id uuid default null,
  p_cancel_token uuid default null,
  p_metadata jsonb default null,
  p_max_attempts integer default 5
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_metadata jsonb;
  v_max_attempts integer;
  v_tenant uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    raise exception 'TENANT_ID_REQUIRED';
  end if;
  if p_event_type is null then
    raise exception 'event_type is required';
  end if;
  if p_event_type not in ('booking_created', 'booking_status_decided', 'booking_cancelled_by_renter') then
    raise exception 'unsupported event_type %', p_event_type;
  end if;
  if p_booking_id is null and p_cancel_token is null then
    raise exception 'booking_id or cancel_token is required';
  end if;
  v_metadata := coalesce(p_metadata, '{}'::jsonb);
  v_max_attempts := greatest(1, coalesce(p_max_attempts, 5));

  insert into public.booking_notification_events (
    tenant_id,
    event_type,
    booking_id,
    cancel_token,
    metadata,
    max_attempts
  ) values (
    v_tenant,
    p_event_type,
    p_booking_id,
    p_cancel_token,
    v_metadata,
    v_max_attempts
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function public.enqueue_booking_notification(text, uuid, uuid, jsonb, integer) to anon;
grant execute on function public.enqueue_booking_notification(text, uuid, uuid, jsonb, integer) to authenticated;

create or replace function public.dequeue_booking_notification_events(
  p_limit integer default 10
) returns setof public.booking_notification_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  v_tenant := public.current_tenant_id();

  return query
    with candidate as (
      select id
      from public.booking_notification_events
      where status in ('pending', 'failed')
        and attempts < coalesce(max_attempts, 5)
        and (v_tenant is null or tenant_id = v_tenant)
      order by created_at
      limit greatest(1, coalesce(p_limit, 10))
      for update skip locked
    )
    update public.booking_notification_events src
    set status = 'processing',
        attempts = src.attempts + 1,
        last_attempt_at = timezone('utc', now())
    from candidate
    where src.id = candidate.id
      and (v_tenant is null or src.tenant_id = v_tenant)
    returning src.*;
end;
$$;

grant execute on function public.dequeue_booking_notification_events(integer) to service_role;

create or replace function public.reset_booking_notification_event(
  p_event_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_tenant_id() is not null then
    update public.booking_notification_events
    set status = 'pending',
        attempts = 0,
        last_attempt_at = null,
        processed_at = null,
        last_error = null
    where id = p_event_id
      and tenant_id = public.current_tenant_id();
  else
    update public.booking_notification_events
    set status = 'pending',
        attempts = 0,
        last_attempt_at = null,
        processed_at = null,
        last_error = null
    where id = p_event_id;
  end if;
end;
$$;

grant execute on function public.reset_booking_notification_event(uuid) to service_role;

-- Aktualizacja funkcji pomocniczej current_caretaker_id w celu uwzględnienia tenantów.
create or replace function public.current_caretaker_id()
returns uuid
language plpgsql
stable
as $$
declare
  header text;
  uid uuid;
  tenant uuid;
begin
  tenant := public.current_tenant_id();

  uid := auth.uid();
  if uid is not null then
    if tenant is null then
      return uid;
    end if;
    if exists (
      select 1
      from public.caretakers c
      where c.id = uid
        and c.tenant_id = tenant
    ) then
      return uid;
    end if;
  end if;

  header := nullif(current_setting('request.header.x-caretaker-id', true), '');
  if header is not null then
    begin
      if tenant is null then
        return header::uuid;
      end if;
      select c.id
        into uid
      from public.caretakers c
      where c.id = header::uuid
        and c.tenant_id = tenant
      limit 1;
      return uid;
    exception when others then
      return null;
    end;
  end if;

  return null;
end;
$$;

grant execute on function public.current_caretaker_id() to anon, authenticated;
