
import { $ } from '../utils/dom.js';

const CARD_BASE_CLASSES =
  'border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]';
const HEADING_ACCENT_CLASSES = 'text-[#003580]';
const HEADING_DIVIDER_CLASSES =
  'hidden lg:flex lg:h-px lg:flex-1 lg:bg-slate-200';

export function renderMain() {
  const root = $('#main');
  if (!root) {
    console.warn('#main not found');
    return;
  }
  root.innerHTML = `
    <div id="mainInner" class="relative z-10 space-y-6">
      <div id="facilityBrowser" class="${CARD_BASE_CLASSES} overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#003580]/70">Lista obiektów</p>
            <h2 class="text-lg font-semibold text-slate-900">
              <span class="${HEADING_ACCENT_CLASSES}">Lista obiektów</span>
              <span class="ml-2 text-sm font-medium text-slate-500">(<span id="count">0</span>)</span>
            </h2>
          </div>
        </div>
        <div class="border-b border-slate-200 bg-slate-50/60 px-6 py-4">
          <label for="facilitySearch" class="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Szukaj po nazwie lub miejscowości
          </label>
          <div class="mt-2 flex items-center gap-2">
            <div class="relative flex-1">
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden="true">🔍</span>
              <input
                id="facilitySearch"
                type="search"
                inputmode="search"
                placeholder="Wpisz nazwę obiektu lub miejscowość"
                class="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm focus:border-[#003580] focus:outline-none focus:ring-2 focus:ring-[#003580]/40"
                autocomplete="off"
              />
            </div>
            <button
              type="button"
              id="facilitySearchClear"
              class="hidden whitespace-nowrap rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-[#003580] hover:text-[#003580]"
            >
              Wyczyść
            </button>
          </div>
        </div>
        <div id="facilities" class="facility-grid px-6 pb-6 pt-4"></div>
        <div class="border-t border-slate-200 bg-slate-50/60 px-6 py-4">
          <button
            id="openReservationCta"
            type="button"
            disabled
            aria-disabled="true"
            class="inline-flex w-full items-center justify-center gap-2 rounded bg-[#003580] px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white shadow-md shadow-[#003580]/20 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00245c] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            Wybierz obiekt, aby przejść do rezerwacji
          </button>
        </div>
      </div>
      <section id="mapCard" class="hidden ${CARD_BASE_CLASSES}">
        <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <h3 class="text-lg font-semibold text-slate-900">
            <span class="${HEADING_ACCENT_CLASSES}">Mapa</span>
          </h3>
        </div>
        <div id="map" class="map-panel h-[18rem] w-full"></div>
      </section>
      <section id="reservationSection" class="space-y-6">
        <div
          id="facilityPlaceholder"
          class="${CARD_BASE_CLASSES} px-6 py-12 text-center"
        >
          <div class="space-y-3">
            <h2 class="text-2xl font-semibold tracking-tight text-slate-900">
              Wybierz obiekt, aby rozpocząć
            </h2>
            <p class="text-sm text-slate-600">
              Skorzystaj z kafelków powyżej, aby zobaczyć szczegóły, dostępność oraz formularz rezerwacji wybranego obiektu.
            </p>
          </div>
        </div>
        <div id="facilityCard" class="hidden ${CARD_BASE_CLASSES}">
        <div class="flow-space space-y-6 p-6">
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold tracking-tight text-slate-900">
              <span class="${HEADING_ACCENT_CLASSES}">Wybrany obiekt</span>
            </h2>
            <span class="${HEADING_DIVIDER_CLASSES}"></span>
          </div>
          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div class="md:col-span-1">
              <div id="facilityGallery" class="flex flex-col gap-4 md:h-full">
                <div class="relative overflow-hidden rounded-2xl bg-stone-900/5">
                  <img id="facilityImgMain" class="h-56 w-full object-cover" alt="Zdjęcie obiektu" />
                  <button
                    id="openGalleryBtn"
                    type="button"
                    class="absolute bottom-3 right-3 rounded-full bg-stone-900/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-lg shadow-amber-500/20 backdrop-blur focus:outline-none focus:ring-2 focus:ring-amber-300/60"
                    aria-haspopup="dialog"
                  >
                    Otwórz galerię
                  </button>
                </div>
                <div id="galleryColumnInfo" class="text-xs leading-snug text-slate-500">
                  Wybierz obiekt, aby zobaczyć zdjęcia.
                </div>
              </div>
            </div>
            <div class="space-y-4 md:col-span-2">
              <div>
                <h2 id="facilityName" class="text-2xl font-semibold tracking-tight text-slate-900"></h2>
                <p id="facilityDesc" class="mt-1 text-sm text-slate-600"></p>
              </div>
              <div class="space-y-3 text-sm text-slate-700">
                <div id="facilityAddr"></div>
                <div class="flex flex-wrap items-center gap-2">
                  <span id="facilityCap" class="inline-flex items-center rounded-2xl bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm shadow-amber-500/15"></span>
                  <span id="facilityPrices" class="inline-flex items-center rounded-2xl bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm shadow-amber-500/15"></span>
                </div>
                <div id="facilityLinks" class="hidden flex flex-wrap items-center gap-2 text-xs font-medium text-amber-700"></div>
                <div id="facilityAmenities" class="flex flex-wrap gap-2 text-xs text-slate-600"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="selectors" class="hidden ${CARD_BASE_CLASSES} linked-card linked-card--top">
        <div class="flow-space space-y-6 p-6 lg:p-8">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#003580]/70">Krok 1 z 2</p>
              <h3 class="text-2xl font-semibold text-slate-900">Wybierz termin</h3>
              <p class="text-sm text-slate-600">Sprawdź dostępność i wskaż dzień rezerwacji, aby przejść dalej.</p>
            </div>
            <div class="wizard-step-dots" aria-hidden="true">
              <span class="wizard-step-dot is-active" data-wizard-dot="1">1</span>
              <span class="wizard-step-dot" data-wizard-dot="2">2</span>
            </div>
          </div>
          <div class="space-y-6">
            <div class="space-y-5">
              <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <div class="space-y-0.5">
                  <span class="text-sm font-medium text-slate-600">Tryb rezerwacji</span>
                  <span class="text-xs text-slate-500">Przełącz między rezerwacją dzienną i godzinową.</span>
                </div>
                <button
                  id="modeSwitch"
                  type="button"
                  role="switch"
                  aria-label="Przełącz tryb rezerwacji"
                  aria-checked="false"
                  class="booking-mode-switch"
                  data-mode="day"
                >
                  <span class="booking-mode-switch__option booking-mode-switch__option--day">Dni</span>
                  <span class="booking-mode-switch__track">
                    <span class="booking-mode-switch__thumb"></span>
                  </span>
                  <span class="booking-mode-switch__option booking-mode-switch__option--hour">Godziny</span>
                </button>
              </div>
              <div class="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-4">
                    <div class="flex items-center gap-2">
                      <button id="prevDay" class="rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#003580] hover:text-[#003580]">◀</button>
                      <button id="todayBtn" class="rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#003580] hover:text-[#003580]">Dziś</button>
                      <button id="nextDay" class="rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#003580] hover:text-[#003580]">▶</button>
                    </div>
                    <input
                      id="dayPicker"
                      type="date"
                      aria-label="Wybierz datę rezerwacji"
                      class="date-picker-control w-full rounded-xl border border-slate-300 text-slate-900 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/40 focus:outline-none sm:w-auto"
                    />
                  </div>
                  <div class="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
                    <button
                      id="openMonthPreview"
                      class="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003580] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[#003580]/30 transition hover:bg-[#00245c] whitespace-nowrap"
                    >
                      Kalendarz obiektu
                    </button>
                    <button
                      id="openFacilityInstructions"
                      type="button"
                      class="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-[#003580] hover:bg-[#003580]/10 hover:text-[#003580] disabled:cursor-not-allowed disabled:opacity-50"
                      title="Instrukcja od opiekuna"
                      disabled
                    >
                      Instrukcja
                    </button>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50/70 p-3 text-sm text-slate-600">
                  <span class="font-medium text-slate-600">Wybrany dzień:</span>
                  <span id="dateLabel" class="text-base font-semibold text-slate-900"></span>
                </div>
              </div>
              <div id="hourSliderWrap" class="hidden rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <div class="grid grid-cols-1 items-center gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
                  <div class="text-sm font-medium text-slate-600">Zakres godzin</div>
                  <div class="flex items-center gap-3">
                    <div class="flex-1"><input id="hourStart" type="range" min="0" max="23" step="1"></div>
                    <span class="text-slate-400">—</span>
                    <div class="flex-1"><input id="hourEnd" type="range" min="0" max="23" step="1" value="23"></div>
                    <div class="whitespace-nowrap text-sm font-semibold text-slate-600">
                      <span id="hourStartLabel">12:00</span>–<span id="hourEndLabel">14:00</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <div class="space-y-0.5">
                  <h4 class="text-sm font-semibold text-slate-700">Dostępność</h4>
                  <span class="text-xs text-slate-500">Kliknij dzień, aby ustawić datę</span>
                </div>
                <div id="availabilityPreviewMonth" class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"></div>
              </div>
              <div id="availabilityPreviewGrid" class="availability-preview" aria-live="polite"></div>
              <p class="text-[11px] leading-snug text-slate-500">
                Doba rozliczeniowa liczona jest zgodnie z umową i zależy od rodzaju wynajmu. Przekroczenie doby może wiązać się z dodatkową opłatą. Szczegóły w cenniku danego obiektu.
              </p>
              <div class="availability-legend" aria-label="Legenda kalendarza dostępności">
                <span
                  class="availability-legend-dot availability-legend-dot--available"
                  role="img"
                  aria-label="Termin dostępny"
                  title="Termin dostępny"
                ></span>
                <span
                  class="availability-legend-dot availability-legend-dot--pending"
                  role="img"
                  aria-label="Termin wstępnie zajęty"
                  title="Termin wstępnie zajęty"
                ></span>
                <span
                  class="availability-legend-dot availability-legend-dot--busy"
                  role="img"
                  aria-label="Termin zajęty"
                  title="Termin zajęty"
                ></span>
              </div>
              <div
                id="calendar"
                class="hidden space-y-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm"
              >
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <h5 class="text-sm font-semibold text-slate-700">Dostępność godzinowa</h5>
                  <span class="text-xs uppercase tracking-[0.18em] text-slate-400">Tryb godzinowy</span>
                </div>
                <div id="hours" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"></div>
                <div class="availability-legend availability-legend--hours" aria-label="Legenda dostępnych godzin">
                  <span
                    class="availability-legend-dot availability-legend-dot--busy"
                    role="img"
                    aria-label="Godziny zajęte (potwierdzone)"
                    title="Godziny zajęte (potwierdzone)"
                  ></span>
                  <span
                    class="availability-legend-dot availability-legend-dot--pending"
                    role="img"
                    aria-label="Godziny wstępne (czekają na akceptację)"
                    title="Godziny wstępne (czekają na akceptację)"
                  ></span>
                  <span
                    class="availability-legend-dot availability-legend-dot--available"
                    role="img"
                    aria-label="Godziny dostępne"
                    title="Godziny dostępne"
                  ></span>
                </div>
              </div>
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div id="stepValidationMessage" class="step-validation-message hidden"></div>
                <button
                  id="goToBookingStep"
                  type="button"
                  class="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003580] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#003580]/30 transition hover:bg-[#00245c]"
                >
                  Kontynuuj do formularza
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="booking" class="hidden ${CARD_BASE_CLASSES}">
        <div class="flow-space space-y-6 p-6 lg:p-8">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#003580]/70">Krok 2 z 2</p>
              <h3 class="text-2xl font-semibold text-slate-900">
                <span class="${HEADING_ACCENT_CLASSES}">Złóż rezerwację</span>
              </h3>
              <p class="text-sm text-slate-600">Uzupełnij dane rezerwującego i potwierdź zgłoszenie.</p>
            </div>
            <div class="flex flex-wrap items-center gap-3 justify-end">
              <div class="wizard-step-dots" aria-hidden="true">
                <span class="wizard-step-dot is-complete" data-wizard-dot="1">1</span>
                <span class="wizard-step-dot" data-wizard-dot="2">2</span>
              </div>
              <button
                id="backToDates"
                type="button"
                class="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-[#003580] hover:text-[#003580]"
              >
                ← Wróć do wyboru terminu
              </button>
            </div>
          </div>
          <form id="bookingForm" class="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label class="text-sm font-medium text-slate-600">Rodzaj</label>
              <select name="event_type_id" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/40 focus:outline-none"></select>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-600">Tytuł wydarzenia</label>
              <input name="title" required readonly class="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/30 focus:outline-none" placeholder="Uzupełni się automatycznie" />
            </div>

            <div data-day-fields>
              <label class="text-sm font-medium text-slate-600">Dzień rezerwacji</label>
              <input name="day_only" type="date" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/40 focus:outline-none" />
            </div>

            <div data-hour-fields class="hidden">
              <label class="text-sm font-medium text-slate-600">Początek (godzina)</label>
              <input name="start_time" type="datetime-local" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/40 focus:outline-none" />
            </div>
            <div data-hour-fields class="hidden">
              <label class="text-sm font-medium text-slate-600">Koniec (godzina)</label>
              <input name="end_time" type="datetime-local" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/40 focus:outline-none" />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-600">Imię i nazwisko</label>
              <input name="renter_name" required class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/40 focus:outline-none" />
            </div>
            <div>
              <label class="text-sm font-medium text-slate-600">E-mail</label>
              <input name="renter_email" type="email" required class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/40 focus:outline-none" />
            </div>

            <div class="md:col-span-2">
              <label class="text-sm font-medium text-slate-600">Krótka zagadka matematyczna</label>
              <div class="mt-2 flex flex-wrap items-center gap-3">
                <span id="mathPuzzleQuestion" class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"></span>
                <input
                  name="math_answer"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="1"
                  required
                  class="w-32 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/40 focus:outline-none"
                  placeholder="Wynik"
                />
                <button
                  id="mathPuzzleRefresh"
                  type="button"
                  class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-[#003580] hover:text-[#003580]"
                >
                  Inna zagadka
                </button>
              </div>
              <p class="mt-1 text-xs text-slate-500">Aby wysłać formularz, podaj poprawny wynik działania.</p>
            </div>

            <div class="md:col-span-2">
              <label class="text-sm font-medium text-slate-600">Uwagi (opcjonalnie)</label>
              <textarea name="notes" class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/40 focus:outline-none" rows="3"></textarea>
            </div>

            <div class="md:col-span-2 flex flex-wrap items-center gap-4">
              <button class="inline-flex items-center justify-center gap-2 rounded-xl bg-[#003580] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#003580]/30 transition hover:bg-[#00245c]" type="submit">
                Złóż wstępną rezerwację
              </button>
              <button id="cancelThisBooking" type="button" class="no-print hidden rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-[#003580] hover:text-[#003580]">Anuluj tę rezerwację</button>
              <div id="formMsg" class="hidden"></div>
            </div>

            <p class="text-xs text-slate-500 md:col-span-2">
              Wstępna rezerwacja trafia do opiekuna obiektu do akceptacji. Dostaniesz e-mail z decyzją.
            </p>
          </form>

          <div id="docGen" class="pt-2"></div>
        </div>
      </div>
      </section>
    </div>

    <div id="galleryModal" class="fixed inset-0 z-50 hidden">
      <div id="galleryModalBackdrop" data-role="gallery-overlay" class="absolute inset-0 bg-black/60"></div>
      <div class="relative mx-auto my-10 w-[min(960px,94vw)] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b">
          <div class="flex flex-col">
            <span id="galleryModalTitle" class="font-semibold">Galeria zdjęć</span>
            <span id="galleryModalCounter" class="text-xs text-gray-500"></span>
          </div>
          <button id="closeGalleryModal" class="px-3 py-1 border rounded text-sm">Zamknij</button>
        </div>
        <div class="relative bg-black flex items-center justify-center min-h-[320px]">
          <button
            id="galleryPrev"
            class="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-10 h-10 flex items-center justify-center text-lg font-semibold shadow focus:outline-none focus:ring-2 focus:ring-amber-400"
            type="button"
            aria-label="Poprzednie zdjęcie"
          >
            &#10094;
          </button>
          <img id="galleryModalImage" class="max-h-[70vh] w-auto max-w-full object-contain" alt="Zdjęcie obiektu" />
          <button
            id="galleryNext"
            class="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-10 h-10 flex items-center justify-center text-lg font-semibold shadow focus:outline-none focus:ring-2 focus:ring-amber-400"
            type="button"
            aria-label="Następne zdjęcie"
          >
            &#10095;
          </button>
          <div id="galleryModalEmpty" class="absolute inset-0 hidden items-center justify-center px-6 text-center text-sm text-white/90">
            Brak zdjęć dla tego obiektu.
          </div>
        </div>
        <div id="galleryModalThumbs" class="hidden flex gap-2 overflow-x-auto p-3 bg-gray-50"></div>
      </div>
    </div>

    <div id="fcModal" class="fixed inset-0 z-50 hidden">
      <div class="absolute inset-0 bg-black/40"></div>
      <div class="relative mx-auto my-10 w-[min(1000px,92vw)] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b">
          <div class="font-semibold">Kalendarz miesięczny</div>
          <button id="closeFcModal" class="px-3 py-1 border rounded">Zamknij</button>
        </div>
        <div id="fcContainer" class="p-3">
          <div id="fullCalendar" class="fc fc-media-screen"></div>
        </div>
      </div>
    </div>

    <div id="instructionsModal" class="fixed inset-0 z-50 hidden">
      <div class="absolute inset-0 bg-black/40"></div>
      <div class="relative mx-auto my-10 w-[min(640px,92vw)] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b">
          <div class="font-semibold">Instrukcja od opiekuna</div>
          <div class="flex items-center gap-2">
            <a
              id="editInstructionsLink"
              href="./caretakerPanel.html"
              class="px-3 py-1 rounded border text-sm text-amber-700 hover:bg-amber-50"
            >Edytuj</a>
            <button id="closeInstructionsModal" class="px-3 py-1 border rounded text-sm">Zamknij</button>
          </div>
        </div>
        <div class="p-4">
          <div id="instructionsContent" class="text-sm leading-relaxed text-gray-700 whitespace-pre-line"></div>
        </div>
      </div>
    </div>
  `;
}

export function refreshLayoutAlignment() {
  // layout alignment no longer required in the simplified view
}

