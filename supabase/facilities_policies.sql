-- Polityki RLS dla tabeli public.facilities umożliwiające dodawanie obiektów tylko zalogowanym opiekunom.
-- Uruchom w SQL Editorze Supabase po wdrożeniu bazowego schematu.

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

alter table public.facilities enable row level security;

drop policy if exists "Public read facilities" on public.facilities;
create policy "Public read facilities"
  on public.facilities
  for select
  to anon
  using (true);

drop policy if exists "Caretaker insert facilities" on public.facilities;
create policy "Caretaker insert facilities"
  on public.facilities
  for insert
  to anon
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
  to anon
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

drop trigger if exists facilities_assign_caretaker on public.facilities;
drop function if exists public.assign_caretaker_to_new_facility();

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

grant execute on function public.assign_caretaker_to_new_facility() to anon;

create trigger facilities_assign_caretaker
  after insert on public.facilities
  for each row
  execute function public.assign_caretaker_to_new_facility();
