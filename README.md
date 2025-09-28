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

## Powiadomienia e-mail o rezerwacjach
- W katalogu `supabase/functions/send-booking-notifications` znajduje się funkcja Edge odpowiedzialna za wysyłkę powiadomień do
  rezerwującego oraz opiekunów.
- Konfiguracja wymaga ustawienia w Supabase zmiennych środowiskowych (np. `APP_BASE_URL`, `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USERNAME`, `SMTP_PASSWORD`/hasło aplikacji Gmail, `NOTIFY_FROM_EMAIL`, opcjonalnie `NOTIFY_FROM_NAME`).
- Po wdrożeniu funkcji należy uruchomić skrypt SQL `SQL_Updates/2024-10-03_booking_notifications.sql`, który dodaje funkcję
  `get_booking_notification_payload` wykorzystywaną przez powiadomienia.
- Aplikacja frontowa automatycznie wywołuje funkcję Edge po utworzeniu rezerwacji, zmianie decyzji opiekuna oraz anulowaniu przez
  rezerwującego.

## Rejestracja opiekuna
- W nagłówku aplikacji dostępny jest link „Zarejestruj opiekuna”, który prowadzi do formularza `registerCaretaker.html`.
- Formularz zapisuje dane do tabeli `caretakers` oraz przypisania w tabeli `facility_caretakers`.
- Wszystkie funkcje pomocnicze i polityki RLS wymagane do obsługi opiekunów są częścią `schema.sql`.

## Test środowiska Supabase
Dla szybkiego sprawdzenia konfiguracji Supabase dodano stronę `supabase-test.html`. Umożliwia ona zalogowanie się przez Supabase Auth oraz dodanie przykładowej encji nieruchomości do tabeli `properties`. Po ustawieniu w `supabase-config.js` poprawnych wartości `SUPABASE_URL` i `SUPABASE_ANON_KEY`:

1. Otwórz `supabase-test.html` w przeglądarce.
2. Zaloguj się przy użyciu konta użytkownika z Supabase Auth.
3. Po zalogowaniu wypełnij formularz „Dodaj nieruchomość” i zapisz wpis.

Aby przygotować tabelę testową wraz z podstawowymi politykami RLS, uruchom skrypt `supabase-test-properties.sql` w edytorze SQL Supabase. Tabela `properties` utworzona przez skrypt zawiera kolumny `title`, `address`, `description`, `price` (NUMERIC), a także informacje o właścicielu rekordu. Dzięki temu można łatwo zweryfikować poprawność konfiguracji bazy i uwierzytelniania.
