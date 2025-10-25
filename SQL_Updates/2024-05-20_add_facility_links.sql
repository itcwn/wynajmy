-- Aktualizacja dodająca linki do cennika i regulaminu wynajmu obiektu.
-- Uruchom w środowisku produkcyjnym po wdrożeniu zmian w aplikacji.

set search_path = public;

alter table public.facilities
  add column if not exists price_list_url text;

alter table public.facilities
  add column if not exists rental_rules_url text;

drop view if exists public.public_facilities;

create view public.public_facilities as
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
