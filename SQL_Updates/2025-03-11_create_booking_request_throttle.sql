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

drop policy if exists "Anonymous can create pending bookings" on public.bookings;
revoke insert on table public.bookings from anon;

commit;
