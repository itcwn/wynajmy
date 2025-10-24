-- Aktualizacja dodająca linki do cennika i regulaminu wynajmu obiektu.
-- Uruchom w środowisku produkcyjnym po wdrożeniu zmian w aplikacji.

set search_path = public;

alter table public.facilities
  add column if not exists price_list_url text;

alter table public.facilities
  add column if not exists rental_rules_url text;

create or replace view public.public_facilities as
select
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
where f.tenant_id = public.current_tenant_id();
