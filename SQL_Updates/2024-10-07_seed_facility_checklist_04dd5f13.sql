-- Dodaje listę kontrolną przekazania i zdania dla obiektu 04dd5f13-f1ae-4342-9649-3159d3176112.
-- Uruchom po utworzeniu tabeli facility_checklist_items.

set search_path = public;

with facility as (
  select '04dd5f13-f1ae-4342-9649-3159d3176112'::uuid as id
),
items as (
  select * from (values
    ('handover', 10, 'Przekazanie i spisanie kompletu kluczy', 'Przekaż najemcy klucze, piloty i kody dostępu. Wypisz je w protokole i potwierdź podpisem obydwu stron, że liczba się zgadza.'),
    ('handover', 20, 'Omówienie zasad bezpieczeństwa i ewakuacji', 'Przedstaw najemcy zasady przeciwpożarowe, lokalizację wyłączników prądu, drogi ewakuacji oraz numery alarmowe.'),
    ('handover', 30, 'Prezentacja wyposażenia sali i systemów', 'Pokaż działanie oświetlenia, rolet, nagłośnienia i ogrzewania. Zanotuj stan urządzeń oraz zgłoszone uwagi.'),
    ('handover', 40, 'Instruktaż kuchni i sprzętów AGD', 'Wskaż lokalizację zaworów wody i gazu, omów zasady używania pieca, płyty, zmywarki i okapu. Pokaż gdzie znajdują się instrukcje i środki czystości.'),
    ('handover', 50, 'Weryfikacja wyposażenia z listą inwentarzową', 'Razem z najemcą sprawdź liczbę krzeseł, stołów, naczyń i drobnego sprzętu kuchennego. Zaznacz w protokole ewentualne braki lub uszkodzenia.'),
    ('handover', 60, 'Odczyt stanów liczników', 'Zanotuj stany liczników prądu, wody i innych mediów przed rozpoczęciem wydarzenia oraz dołącz zdjęcia do protokołu.'),
    ('handover', 70, 'Kontrola czystości i przygotowania zaplecza', 'Zweryfikuj czystość sali głównej, kuchni, chłodni i sanitariatów. Sprawdź czy środki higieniczne są uzupełnione.'),
    ('handover', 80, 'Przekazanie danych kontaktowych opiekuna', 'Potwierdź, że najemca ma numer telefonu opiekuna i zna procedurę zgłaszania usterek lub awarii.'),
    ('return', 10, 'Odbiór kluczy i zabezpieczeń', 'Odbierz wszystkie klucze, piloty i kody dostępu. Porównaj ich liczbę z protokołem przekazania i potwierdź odbiór podpisem.'),
    ('return', 20, 'Kontrola czystości sali i sanitariatów', 'Sprawdź, czy sala, toalety i zaplecze zostały dokładnie wysprzątane, podłogi umyte, a kosze opróżnione.'),
    ('return', 30, 'Inspekcja kuchni i urządzeń AGD', 'Skontroluj blaty, zlewy i urządzenia (piec, płyta, zmywarka, lodówka, okap). Upewnij się, że są czyste, wyłączone i bez resztek jedzenia.'),
    ('return', 40, 'Weryfikacja wyposażenia z listą inwentarzową', 'Przelicz krzesła, stoły, naczynia i drobny sprzęt kuchenny według listy. Zanotuj ewentualne braki, zamianę egzemplarzy lub uszkodzenia.'),
    ('return', 50, 'Sprawdzenie zamknięcia i zabezpieczeń', 'Potwierdź zamknięcie wszystkich okien, drzwi, zaworów wody i gazu oraz wyłączenie głównych zasilaczy i świateł.'),
    ('return', 60, 'Odczyt stanów liczników po wydarzeniu', 'Zanotuj końcowe stany liczników prądu, wody i innych mediów. Upewnij się, że dokumentacja zdjęciowa jest kompletna.'),
    ('return', 70, 'Sporządzenie protokołu zdawczo-odbiorczego', 'Uzupełnij protokół o uwagi najemcy, wpisz szkody i brakujące elementy oraz uzyskaj podpisy stron.')
  ) as t(phase, order_index, title, description)
)
insert into public.facility_checklist_items (facility_id, phase, order_index, title, description, is_required)
select f.id, i.phase, i.order_index, i.title, i.description, true
from facility f
join items i on true
where not exists (
  select 1
  from public.facility_checklist_items existing
  where existing.facility_id = f.id
    and existing.phase = i.phase
    and lower(existing.title) = lower(i.title)
);
