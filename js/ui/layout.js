
import { $ } from '../utils/dom.js';

const CARD_BASE_CLASSES =
  'rounded-3xl border border-amber-900/10 bg-white/75 backdrop-blur shadow-xl shadow-amber-500/10';
const HEADING_ACCENT_CLASSES = 'text-black';
const HEADING_DIVIDER_CLASSES =
  'h-px flex-1 bg-gradient-to-r from-slate-400/30 via-slate-300/15 to-transparent';

export function renderSidebar({ onSearch } = {}) {
  const root = $('#sidebar');
  if (!root) {
    console.warn('#sidebar not found');
    return;
  }
  root.innerHTML = `
    <div class="space-y-6">
      <div class="${CARD_BASE_CLASSES} p-6">
        <div class="flex items-center gap-3 pb-4">
          <h2 class="text-lg font-semibold tracking-tight text-black">
            <span class="${HEADING_ACCENT_CLASSES}">Wyszukaj</span>
          </h2>
          <span class="${HEADING_DIVIDER_CLASSES}"></span>
        </div>
        <input
          id="q"
          class="w-full rounded-2xl border border-white/60 bg-white/60 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
          placeholder="Szukaj ..."
        />
      </div>
      <div class="${CARD_BASE_CLASSES} p-6">
        <div class="flex items-center gap-3 pb-4">
          <h2 class="text-lg font-semibold tracking-tight text-black">
            <span class="${HEADING_ACCENT_CLASSES}">Świetlice</span>
            <span class="ml-2 text-sm font-medium text-slate-600">(<span id="count">0</span>)</span>
          </h2>
          <span class="${HEADING_DIVIDER_CLASSES}"></span>
        </div>
        <ul id="facilities" class="space-y-3"></ul>
      </div>
      <div id="mapCard" class="hidden ${CARD_BASE_CLASSES} p-6">
        <div class="flex items-center gap-3 pb-4">
          <h3 class="text-lg font-semibold tracking-tight text-black">
            <span class="${HEADING_ACCENT_CLASSES}">Mapa</span>
          </h3>
          <span class="${HEADING_DIVIDER_CLASSES}"></span>
        </div>
        <div
          id="map"
          class="rounded-2xl border border-white/40 shadow-inner shadow-amber-500/10"
          style="width:100%;height:280px;"
        ></div>
      </div>
    </div>
  `;
  const search = $('#q');
  if (search && typeof onSearch === 'function') {
    search.addEventListener('input', () => onSearch(search.value));
  }
}

export function renderMain() {
  const root = $('#main');
  if (!root) {
    console.warn('#main not found');
    return;
  }
  root.innerHTML = `
    <div id="mainInner" class="relative z-10 space-y-6">
      <div id="facilityCard" class="hidden ${CARD_BASE_CLASSES}">
        <div class="flow-space space-y-6 p-6">
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold tracking-tight text-black">
              <span class="${HEADING_ACCENT_CLASSES}">Wybrana świetlica</span>
            </h2>
            <span class="${HEADING_DIVIDER_CLASSES}"></span>
          </div>
          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div class="md:col-span-1">
              <div id="facilityGallery" class="flex flex-col gap-4 md:h-full">
                <div class="relative overflow-hidden rounded-2xl bg-stone-900/5">
                  <img id="facilityImgMain" class="h-56 w-full object-cover" alt="Zdjęcie świetlicy" />
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
                  Wybierz świetlicę, aby zobaczyć zdjęcia.
                </div>
              </div>
            </div>
            <div class="space-y-4 md:col-span-2">
              <div>
                <h2 id="facilityName" class="text-2xl font-semibold tracking-tight text-black"></h2>
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

      <div id="selectors" class="hidden ${CARD_BASE_CLASSES}">
        <div class="flow-space space-y-6 p-6">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold tracking-tight text-black">
              <span class="${HEADING_ACCENT_CLASSES}">Planowanie rezerwacji</span>
            </h3>
            <span class="${HEADING_DIVIDER_CLASSES}"></span>
          </div>
          <div class="flex flex-wrap items-center gap-3 md:justify-between">
            <div class="flex w-full flex-wrap items-center gap-2 md:w-auto">
              <div class="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
                <div class="flex items-center gap-2">
                  <button id="prevDay" class="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm shadow-amber-500/15">◀</button>
                  <button id="todayBtn" class="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm shadow-amber-500/15">Dziś</button>
                  <button id="nextDay" class="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm shadow-amber-500/15">▶</button>
                </div>
                <input
                  id="dayPicker"
                  type="date"
                  class="w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60 sm:w-auto"
                />
              </div>
              <div class="flex w-full items-center gap-2 sm:w-auto sm:flex-nowrap">
                <button id="openMonthPreview" class="w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm shadow-amber-500/15 transition hover:border-amber-400/60 hover:text-amber-700 sm:w-auto">Podgląd miesiąca</button>
                <button
                  id="openFacilityInstructions"
                  type="button"
                  class="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-slate-500/80 via-slate-400/70 to-slate-500/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 focus:outline-none focus:ring-2 focus:ring-slate-300/60 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-2"
                  title="Instrukcja od opiekuna"
                  disabled
                >
                  Instrukcja
                </button>
              </div>
            </div>
            <div class="flex w-full flex-wrap items-center gap-3 text-sm text-slate-600 md:w-auto md:flex-nowrap">
              <span class="text-sm font-medium text-slate-500">Tryb:</span>
              <label class="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="mode" value="day" checked> Dni
              </label>
              <label class="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="mode" value="hour"> Godziny
              </label>
            </div>
          </div>
          <div id="hourSliderWrap" class="hidden rounded-2xl border border-white/50 bg-white/60 p-4">
            <div class="grid grid-cols-1 items-center gap-3 md:grid-cols-3">
              <div class="text-sm text-slate-600 md:col-span-1">Zakres godzin:</div>
              <div class="flex items-center gap-3 md:col-span-2">
                <div class="flex-1"><input id="hourStart" type="range" min="0" max="23" step="1"></div>
                <div class="text-slate-500">—</div>
                <div class="flex-1"><input id="hourEnd" type="range" min="0" max="23" step="1" value="23"></div>
                <div class="whitespace-nowrap text-sm text-slate-600">
                  <span id="hourStartLabel">12:00</span>–<span id="hourEndLabel">14:00</span>
                </div>
              </div>
            </div>
          </div>
          <div id="dateLabel" class="text-lg font-semibold tracking-tight text-black"></div>
        </div>
      </div>

      <div id="calendar" class="hidden ${CARD_BASE_CLASSES}">
        <div class="flow-space space-y-6 p-6">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold tracking-tight text-black">
              <span class="${HEADING_ACCENT_CLASSES}">Dostępność</span>
            </h3>
            <span class="${HEADING_DIVIDER_CLASSES}"></span>
          </div>
          <div id="hours" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"></div>
          <p class="text-xs text-slate-500">
            🔴 Zajęte (potwierdzone) · 🟡 Wstępne (czeka na akceptację) · brak koloru = dostępne
          </p>
          <p class="text-xs text-slate-500">
            Doba rozliczeniowa liczona jest zgodnie z umową i zależy od rodzaju wynajmu. Przekroczenie doby może wiązać się z dodatkową opłatą.
            Szczegóły w cenniku danego obiektu.
          </p>
        </div>
      </div>

      <div id="booking" class="hidden ${CARD_BASE_CLASSES}">
        <div class="flow-space space-y-6 p-6">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold tracking-tight text-black">
              <span class="${HEADING_ACCENT_CLASSES}">Nowa rezerwacja</span>
            </h3>
            <span class="${HEADING_DIVIDER_CLASSES}"></span>
          </div>
          <form id="bookingForm" class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="text-sm font-medium text-slate-600">Rodzaj</label>
              <select name="event_type_id" class="mt-1 w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60"></select>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-600">Tytuł wydarzenia</label>
              <input name="title" required readonly class="mt-1 w-full rounded-2xl border border-white/60 bg-white/50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60" placeholder="Uzupełni się automatycznie" />
            </div>

            <div data-day-fields>
              <label class="text-sm font-medium text-slate-600">Dzień rezerwacji</label>
              <input name="day_only" type="date" class="mt-1 w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60" />
            </div>

            <div data-hour-fields class="hidden">
              <label class="text-sm font-medium text-slate-600">Początek (godzina)</label>
              <input name="start_time" type="datetime-local" class="mt-1 w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60" />
            </div>
            <div data-hour-fields class="hidden">
              <label class="text-sm font-medium text-slate-600">Koniec (godzina)</label>
              <input name="end_time" type="datetime-local" class="mt-1 w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60" />
            </div>

            <div>
              <label class="text-sm font-medium text-slate-600">Imię i nazwisko</label>
              <input name="renter_name" required class="mt-1 w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60" />
            </div>
            <div>
              <label class="text-sm font-medium text-slate-600">E-mail</label>
              <input name="renter_email" type="email" required class="mt-1 w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60" />
            </div>

            <div class="md:col-span-2">
              <label class="text-sm font-medium text-slate-600">Krótka zagadka matematyczna</label>
              <div class="mt-2 flex flex-wrap items-center gap-3">
                <span id="mathPuzzleQuestion" class="rounded-2xl bg-white/70 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm shadow-amber-500/15"></span>
                <input
                  name="math_answer"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="1"
                  required
                  class="w-32 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60"
                  placeholder="Wynik"
                />
                <button
                  id="mathPuzzleRefresh"
                  type="button"
                  class="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-600 shadow-sm shadow-amber-500/15 transition hover:border-amber-300/80 hover:text-amber-700"
                >
                  Inna zagadka
                </button>
              </div>
              <p class="mt-1 text-xs text-slate-500">Aby wysłać formularz, podaj poprawny wynik działania.</p>
            </div>

            <div class="md:col-span-2">
              <label class="text-sm font-medium text-slate-600">Uwagi (opcjonalnie)</label>
              <textarea name="notes" class="mt-1 w-full rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm text-slate-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300/60" rows="2"></textarea>
            </div>

            <div class="md:col-span-2 flex flex-wrap items-center gap-3">
              <button class="rounded-2xl bg-gradient-to-r from-amber-400 via-rose-300 to-amber-300 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-300/60" type="submit">
                Złóż wstępną rezerwację
              </button>
              <button id="cancelThisBooking" type="button" class="no-print hidden rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm shadow-amber-500/15">Anuluj tę rezerwację</button>
              <div id="formMsg" class="hidden"></div>
            </div>

            <p class="text-xs text-slate-500 md:col-span-2">
              Wstępna rezerwacja trafia do opiekuna obiektu do akceptacji. Dostaniesz e-mail z decyzją.
            </p>
          </form>

          <div id="docGen" class="pt-2"></div>
        </div>
      </div>
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
            Brak zdjęć dla tej świetlicy.
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
