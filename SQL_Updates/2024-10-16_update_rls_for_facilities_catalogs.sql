-- Aktualizacja polityk RLS dla obiektów, słownika udogodnień i typów wydarzeń.
-- Zmiany umożliwiają autoryzowanym opiekunom dostęp do danych nawet bez nagłówka X-Tenant-Id,
-- co eliminuje błędy 403 zwracane przez API.

set search_path = public;

create or replace function public.current_effective_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_caretaker uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is not null then
    return v_tenant;
  end if;

  v_caretaker := public.current_caretaker_id();
  if v_caretaker is null then
    return null;
  end if;

  select c.tenant_id
    into v_tenant
    from public.caretakers c
   where c.id = v_caretaker
   limit 1;

  return v_tenant;
end;
$$;

grant execute on function public.current_effective_tenant_id() to anon, authenticated;

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
      and c.tenant_id = public.current_effective_tenant_id()
  );
$$;

grant execute on function public.caretaker_exists(uuid) to anon, authenticated;

create or replace function public.caretaker_assigned_to_facility(p_facility_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_caretaker uuid;
begin
  v_tenant := public.current_effective_tenant_id();
  if v_tenant is null then
    return false;
  end if;

  v_caretaker := public.current_caretaker_id();
  if v_caretaker is null then
    return false;
  end if;

  return exists (
    select 1
    from public.facility_caretakers fc
    where fc.tenant_id = v_tenant
      and fc.facility_id = p_facility_id
      and fc.caretaker_id = v_caretaker
  );
end;
$$;

grant execute on function public.caretaker_assigned_to_facility(uuid) to anon, authenticated;

-- Polityki RLS dla słownika udogodnień.
drop policy if exists "Public read amenities" on public.amenities;
create policy "Public read amenities"
  on public.amenities
  for select
  to anon, authenticated
  using (
    tenant_id = public.current_effective_tenant_id()
    and is_active
  );

drop policy if exists "Authenticated manage amenities" on public.amenities;
create policy "Authenticated manage amenities"
  on public.amenities
  for all
  to authenticated
  using (
    tenant_id = public.current_effective_tenant_id()
  )
  with check (
    tenant_id = public.current_effective_tenant_id()
  );

-- Polityki RLS dla obiektów.
drop policy if exists "Public read facilities" on public.facilities;
create policy "Public read facilities"
  on public.facilities
  for select
  to anon, authenticated
  using (
    tenant_id = public.current_effective_tenant_id()
  );

drop policy if exists "Caretaker insert facilities" on public.facilities;
create policy "Caretaker insert facilities"
  on public.facilities
  for insert
  to authenticated
  with check (
    public.caretaker_exists(public.current_caretaker_id())
    and tenant_id = public.current_effective_tenant_id()
  );

drop policy if exists "Caretaker update facilities" on public.facilities;
create policy "Caretaker update facilities"
  on public.facilities
  for update
  to authenticated
  using (
    tenant_id = public.current_effective_tenant_id()
    and public.caretaker_assigned_to_facility(id)
  )
  with check (
    tenant_id = public.current_effective_tenant_id()
    and public.caretaker_assigned_to_facility(id)
  );

-- Polityki RLS dla typów wydarzeń.
drop policy if exists "Public read event types" on public.event_types;
create policy "Public read event types"
  on public.event_types
  for select
  to anon, authenticated
  using (
    tenant_id = public.current_effective_tenant_id()
    and is_active
  );

drop policy if exists "Authenticated manage event types" on public.event_types;
create policy "Authenticated manage event types"
  on public.event_types
  for all
  to authenticated
  using (
    tenant_id = public.current_effective_tenant_id()
  )
  with check (
    tenant_id = public.current_effective_tenant_id()
  );
