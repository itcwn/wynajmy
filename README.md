# MVP Rezerwacje świetlic — HTML print dokumentów

Ten pakiet zawiera działające MVP:
- statyczny frontend `index.html` (GitHub Pages),
- kompletny schemat bazy `schema.sql` (Supabase) z tabelami, checklistą oraz politykami RLS dla opiekunów i świetlic,
- proste drukowanie dokumentów jako HTML (okno podglądu + `window.print()`),
- przykładowe 2 szablony: **Wniosek o wynajem** oraz **Protokół** — przypisane do wybranej świetlicy oraz szablony globalne (fallback).

## Szybki start
1. W Supabase wykonaj `schema.sql` (SQL Editor).
2. W `index.html` podmień `SUPABASE_URL` oraz `SUPABASE_ANON_KEY`.
3. Wgraj `index.html` do GitHub i włącz Pages.
4. Wybierz świetlicę, utwórz rezerwację — po zapisie pojawi się sekcja generowania dokumentów.
5. Wybierz szablon i drukuj (PDF z przeglądarki).

## Szablony dokumentów
- Tabela `document_templates` przechowuje HTML z placeholderami.
- Placeholdery (`{{booking.title}}`, `{{facility.name}}`, `{{date booking.start_time}}`). Dostępne aliasy:
  - `booking.title`, `booking.start_time`, `booking.end_time`, `booking.renter_name`, `booking.renter_email`, `booking.notes`
  - `facility.name`, `facility.address`, `facility.city`, `facility.postal_code`, `facility.capacity`, `facility.price_per_hour`, `facility.price_per_day`
- Filtrowanie dat: `{{date booking.start_time}}` i `{{time booking.start_time}}`.
- Jeśli istnieje szablon przypisany do świetlicy (`facility_id`), ma on priorytet nad globalnym (`facility_id` = NULL).

## Modyfikacje
- Dodaj nowe szablony w `document_templates` (INSERT) lub stwórz prosty panel w UI.
- Możesz dostosować CSS w sekcji `<style id="print-styles">` w oknie wydruku.

## Rejestracja opiekuna
- W nagłówku aplikacji dostępny jest link „Zarejestruj opiekuna”, który prowadzi do formularza `registerCaretaker.html`.
- Formularz zapisuje dane do tabeli `caretakers` oraz przypisania w tabeli `facility_caretakers`.
- Wszystkie funkcje pomocnicze i polityki RLS wymagane do obsługi opiekunów są częścią `schema.sql`.
