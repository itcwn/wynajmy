# MVP Rezerwacje obiektów — HTML print dokumentów

Ten pakiet zawiera działające MVP:
- statyczny frontend `index.html` (GitHub Pages),
- kompletny schemat bazy `schema.sql` (Supabase) z tabelami, checklistą oraz politykami RLS dla opiekunów i obiektów,
- proste drukowanie dokumentów jako HTML (okno podglądu + `window.print()`),
- przykładowe 2 szablony: **Wniosek o wynajem** oraz **Protokół** — przypisane do wybranego obiektu oraz szablony globalne (fallback).

## Szybki start
1. W Supabase wykonaj `schema.sql` (SQL Editor).
2. W Supabase Storage utwórz publiczny bucket (np. `facility-images`) na zdjęcia obiektów i zanotuj jego nazwę.
3. W `index.html` podmień `SUPABASE_URL` oraz `SUPABASE_ANON_KEY`.
4. Jeśli korzystasz z innej nazwy bucketa, ustaw ją w `supabase-config.js` pod kluczem `STORAGE_BUCKET_FACILITY_IMAGES`.
5. Wgraj `index.html` do GitHub i włącz Pages.
6. Wybierz obiekt, utwórz rezerwację — po zapisie pojawi się sekcja generowania dokumentów.
7. Wybierz szablon i drukuj (PDF z przeglądarki).

## Szablony dokumentów
- Tabela `document_templates` przechowuje HTML z placeholderami.
- Placeholdery (`{{booking.title}}`, `{{facility.name}}`, `{{date booking.start_time}}`). Dostępne aliasy:
  - `booking.title`, `booking.start_time`, `booking.end_time`, `booking.renter_name`, `booking.renter_email`, `booking.notes`
  - `facility.name`, `facility.address`, `facility.city`, `facility.postal_code`, `facility.capacity`, `facility.price_per_hour`, `facility.price_per_day`
- Filtrowanie dat: `{{date booking.start_time}}` i `{{time booking.start_time}}`.
- Jeśli istnieje szablon przypisany do obiektu (`facility_id`), ma on priorytet nad globalnym (`facility_id` = NULL).

## Modyfikacje
- Dodaj nowe szablony w `document_templates` (INSERT) lub stwórz prosty panel w UI.
- Możesz dostosować CSS w sekcji `<style id="print-styles">` w oknie wydruku.

## Powiadomienia e-mail o rezerwacjach
- W katalogu `supabase/functions/send-booking-notifications` znajduje się funkcja Edge odpowiedzialna za wysyłkę powiadomień do
  rezerwującego oraz opiekunów. Treści wiadomości (tematy, akapity, linki) opisane są w funkcjach `buildCaretakerMessage` oraz
  `buildRenterMessage` – tam można dopisać własne fragmenty.
- W katalogu `SQL_Updates` znajdują się dwa skrypty konfiguracyjne: `2024-10-03_booking_notifications.sql` (dodaje funkcję
  `get_booking_notification_payload`) oraz `2024-10-11_booking_notification_queue.sql` (definiuje kolejkę zdarzeń i funkcje
  `enqueue_booking_notification` oraz `dequeue_booking_notification_events`). Uruchom oba w edytorze SQL Supabase.
- Konfiguracja wymaga ustawienia w Supabase zmiennych środowiskowych (np. `APP_BASE_URL`, `BOOKING_PAGE_PATH`, `RESEND_API_KEY`,
  `NOTIFY_FROM_EMAIL`, opcjonalnie `NOTIFY_FROM_NAME`). Jeśli chcesz testować bez wysyłki, ustaw `NOTIFY_DRY_RUN=true`.
- Link do rezerwacji w e-mailu prowadzi na stronę główną aplikacji z parametrem `?booking=TOKEN`. Frontend (`index.html`) wykrywa
  taki parametr i automatycznie wczytuje dane rezerwacji, dlatego ważne jest ustawienie `APP_BASE_URL`/`BOOKING_PAGE_PATH` na prawidłowy
  adres frontendu.
- Frontend zapisuje zdarzenia do kolejki poprzez funkcję RPC `enqueue_booking_notification`. Przetwarzaniem kolejki zajmuje się
  funkcja Edge `dispatch-notification-queue`, która co 3 minuty uruchamiana jest przez harmonogram (plik
  `supabase/functions/_schedule/dispatch-notification-queue.json`) i w razie potrzeby wywołuje funkcję
  `send-booking-notifications`.

## Rejestracja opiekuna
- W nagłówku aplikacji dostępny jest link „Dodaj obiekt”, który kieruje na stronę `marketing.html` opisującą ofertę wdrożenia.
- Formularz rejestracji opiekuna pozostaje dostępny pod adresem `registerCaretaker.html`; zapisuje dane do tabeli `caretakers` oraz przypisania w tabeli `facility_caretakers`.
- Wszystkie funkcje pomocnicze i polityki RLS wymagane do obsługi opiekunów są częścią `schema.sql`.

## Test środowiska Supabase
Dla szybkiego sprawdzenia konfiguracji Supabase dodano stronę `supabase-test.html`. Umożliwia ona zalogowanie się przez Supabase Auth oraz dodanie przykładowej encji nieruchomości do tabeli `properties`. Po ustawieniu w `supabase-config.js` poprawnych wartości `SUPABASE_URL` i `SUPABASE_ANON_KEY`:

1. Otwórz `supabase-test.html` w przeglądarce.
2. Zaloguj się przy użyciu konta użytkownika z Supabase Auth.
3. Po zalogowaniu wypełnij formularz „Dodaj nieruchomość” i zapisz wpis.

Aby przygotować tabelę testową wraz z podstawowymi politykami RLS, uruchom skrypt `supabase-test-properties.sql` w edytorze SQL Supabase. Tabela `properties` utworzona przez skrypt zawiera kolumny `title`, `address`, `description`, `price` (NUMERIC), a także informacje o właścicielu rekordu. Dzięki temu można łatwo zweryfikować poprawność konfiguracji bazy i uwierzytelniania.
