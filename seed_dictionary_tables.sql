-- Skrypt uzupełniający słowniki dla typów wydarzeń i wyposażenia świetlic.
-- Uruchom po podstawowym schema.sql.

set search_path = public;

with data(name, description, order_index) as (
  values
    ('Uroczystość rodzinna', 'Imprezy takie jak urodziny, rocznice czy komunie.', 10),
    ('Spotkanie mieszkańców', 'Zebrania wspólnoty, konsultacje społeczne i inne wydarzenia lokalne.', 20),
    ('Wydarzenie kulturalne', 'Koncerty kameralne, wernisaże, wystawy lub projekcje filmowe.', 30),
    ('Szkolenie / warsztaty', 'Zajęcia edukacyjne, kursy i warsztaty dla różnych grup wiekowych.', 40),
    ('Zajęcia sportowe', 'Małe treningi, zajęcia ruchowe, joga czy fitness.', 50),
    ('Spotkanie biznesowe', 'Konferencje, prezentacje lub spotkania firmowe.', 60),
    ('Wydarzenie charytatywne', 'Zbiórki, aukcje i inne wydarzenia non-profit.', 70),
    ('Impreza okolicznościowa', 'Bal karnawałowy, zabawa sylwestrowa lub inne uroczystości sezonowe.', 80)
)
insert into public.event_types (name, description, order_index)
select d.name, d.description, d.order_index
from data d
where not exists (
  select 1
  from public.event_types et
  where lower(et.name) = lower(d.name)
);

with data(name, description, order_index) as (
  values
    ('Nagłośnienie', 'Zestaw głośników wraz z mikrofonami przewodowymi lub bezprzewodowymi.', 10),
    ('Projektor multimedialny', 'Projektor wraz z ekranem projekcyjnym lub możliwością projekcji na ścianie.', 20),
    ('Monitor / telewizor', 'Ekran do prezentacji multimedialnych lub transmisji wydarzeń.', 30),
    ('Wi-Fi', 'Dostęp do bezprzewodowego internetu dla uczestników wydarzenia.', 40),
    ('Kuchnia / aneks kuchenny', 'Wyposażenie do przygotowania poczęstunku, w tym lodówka i zlew.', 50),
    ('Zastawa stołowa', 'Talerze, sztućce i szkło dostępne na miejscu.', 60),
    ('Stoły i krzesła', 'Mobilne stoły i komplet krzeseł, które można dowolnie ustawiać.', 70),
    ('Scena / podest', 'Podwyższenie lub scena do występów.', 80),
    ('Oświetlenie sceniczne', 'Dodatkowe oświetlenie punktowe lub efektowe.', 90),
    ('Klimatyzacja / wentylacja', 'System zapewniający komfortową temperaturę i wymianę powietrza.', 100)
)
insert into public.amenities (name, description, order_index)
select d.name, d.description, d.order_index
from data d
where not exists (
  select 1
  from public.amenities a
  where lower(a.name) = lower(d.name)
);
