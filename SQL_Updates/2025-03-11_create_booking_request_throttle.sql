-- Tworzenie logu limitów rezerwacji i wyłączenie bezpośrednich insertów dla anon.
begin;

create table if not exists public.booking_request_throttle (
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  request_ip inet not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists booking_request_throttle_ip_idx
  on public.booking_request_throttle (tenant_id, request_ip, created_at desc);

alter table public.booking_request_throttle enable row level security;

drop policy if exists "Service role manage booking throttle" on public.booking_request_throttle;
create policy "Service role manage booking throttle"
  on public.booking_request_throttle
  for all
  to service_role
  using (
    tenant_id = public.current_tenant_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

drop policy if exists "Anonymous can create pending bookings" on public.bookings;
revoke insert on table public.bookings from anon;
drop policy if exists "Authenticated manage bookings" on public.bookings;
drop policy if exists "Service role manage bookings" on public.bookings;
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

create policy "Service role manage bookings"
  on public.bookings
  for all
  to service_role
  using (
    tenant_id = public.current_tenant_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
  );

grant select, insert, update on table public.bookings to authenticated, service_role;

commit;
