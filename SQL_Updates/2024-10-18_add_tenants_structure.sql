-- Dodaje strukturę rejestru najemców (tenantów) wraz z danymi kontaktowymi
-- i rozliczeniowymi oraz przykładowymi rekordami testowymi.

set search_path = public;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  tenant_code text unique,
  name text not null,
  is_active boolean not null default true,
  billing_name text not null,
  billing_tax_id text,
  billing_address_line1 text not null,
  billing_address_line2 text,
  billing_postal_code text not null,
  billing_city text not null,
  billing_country_code text not null default 'PL',
  contact_person text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_billing_country_code_chk check (
    char_length(billing_country_code) = 2
    and billing_country_code = upper(billing_country_code)
  ),
  constraint tenants_billing_tax_id_format_chk check (
    billing_tax_id is null or billing_tax_id ~ '^[0-9A-Za-z-]+$'
  )
);

create unique index if not exists tenants_tenant_code_uidx
  on public.tenants (lower(tenant_code))
  where tenant_code is not null;

create unique index if not exists tenants_billing_tax_id_uidx
  on public.tenants (billing_tax_id)
  where billing_tax_id is not null;

create index if not exists tenants_name_idx
  on public.tenants (lower(name));

-- Zapewnienie automatycznej aktualizacji kolumny updated_at.
drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

-- Polityki RLS zapewniające izolację tenantów.
alter table public.tenants enable row level security;

drop policy if exists "Service role manage tenants" on public.tenants;
create policy "Service role manage tenants"
  on public.tenants
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Authenticated read own tenant" on public.tenants;
create policy "Authenticated read own tenant"
  on public.tenants
  for select
  to authenticated
  using (
    id = public.current_effective_tenant_id()
  );

-- Przykładowe rekordy testowe.
insert into public.tenants (
  id,
  tenant_code,
  name,
  is_active,
  billing_name,
  billing_tax_id,
  billing_address_line1,
  billing_address_line2,
  billing_postal_code,
  billing_city,
  billing_country_code,
  contact_person,
  contact_email,
  contact_phone,
  notes
)
values
  (
    '98cf6ea0-80c4-4d88-b81d-73f3c6e8b07e',
    'zielony-zakatek',
    'Osiedle Zielony Zakątek',
    true,
    'Wspólnota Mieszkaniowa Zielony Zakątek',
    '945-123-45-67',
    'ul. Lipowa 10',
    null,
    '30-123',
    'Kraków',
    'PL',
    'Anna Kowalska',
    'biuro@zielonyzakatek.pl',
    '+48 600 100 200',
    'Domyślny klient testowy wykorzystywany w środowisku deweloperskim.'
  ),
  (
    '07b90c28-5a4b-4c6b-9f32-2bf2d5c29e1b',
    'biala-laka',
    'Spółdzielnia Mieszkaniowa Biała Łąka',
    true,
    'Spółdzielnia Mieszkaniowa Biała Łąka',
    '525-987-32-10',
    'ul. Słoneczna 5',
    'lok. 12',
    '02-326',
    'Warszawa',
    'PL',
    'Piotr Nowak',
    'kontakt@bialalaka.pl',
    '+48 601 200 300',
    'Dodatkowy klient testowy do scenariuszy integracyjnych.'
  )
on conflict (id) do nothing;
