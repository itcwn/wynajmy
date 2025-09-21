import { $ } from '../utils/dom.js';

export function renderSidebar({ onSearch } = {}) {
  const root = $('#sidebar');
  if (!root) {
    console.warn('#sidebar not found');
    return;
  }
  root.innerHTML = `
    <div class="bg-white rounded-xl shadow-md p-4">
      <h2 class="font-semibold mb-3">Wyszukaj</h2>
      <input id="q" class="w-full border rounded-xl px-3 py-2" placeholder="Szukaj ..." />
    </div>
    <div class="bg-white rounded-xl shadow-md p-4 mt-3">
      <h2 class="font-semibold mb-3">Świetlice (<span id="count">0</span>)</h2>
      <ul id="facilities" class="space-y-3"></ul>
    </div>
    <div id="mapCard" class="hidden bg-white rounded-xl shadow-md p-4 mt-3">
      <h3 class="font-semibold mb-3">Mapa</h3>
      <div id="map" style="width:100%;height:280px;border-radius:12px;"></div>
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
    <div id="mainInner" class="space-y-6">
      <div id="facilityCard" class="hidden bg-white rounded-2xl shadow-md overflow-hidden">
        <div class="grid grid-cols-1 md:grid-cols-3 md:gap-4">
          <div class="md:col-span-1">
            <div id="facilityGallery" class="flex flex-col md:h-full">
              <div class="relative">
                <img id="facilityImgMain" class="w-full h-56 object-cover" alt="Zdjęcie świetlicy"/>
                <button
                  id="openGalleryBtn"
                  type="button"
                  class="absolute bottom-2 right-2 px-3 py-1 rounded-full text-xs sm:text-sm bg-black/70 text-white shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-haspopup="dialog"
                >
                  Otwórz galerię
                </button>
              </div>
              <div id="facilityThumbs" class="hidden mt-2 flex gap-2 overflow-x-auto pb-1"></div>
              <div id="galleryColumnInfo" class="mt-2 text-xs text-gray-500 leading-snug">
                Wybierz świetlicę, aby zobaczyć zdjęcia.
              </div>
            </div>
          </div>
          <div class="p-4 md:col-span-2">
            <h2 id="facilityName" class="text-xl font-bold"></h2>
            <p id="facilityDesc" class="text-sm text-gray-600 mt-1"></p>
            <div class="mt-3 text-sm">
              <div id="facilityAddr" class="text-gray-700"></div>
              <div class="mt-1">
                <span id="facilityCap" class="inline-block bg-gray-100 px-2 py-1 rounded-lg"></span>
                <span id="facilityPrices" class="inline-block bg-gray-100 px-2 py-1 rounded-lg ml-2"></span>
              </div>
              <div id="facilityAmenities" class="mt-2 flex flex-wrap gap-2"></div>
            </div>
          </div>
        </div>
      </div>

      <div id="selectors" class="hidden bg-white rounded-2xl shadow-md p-4">
        <div class="flex flex-wrap items-center gap-3 md:justify-between">
          <div class="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <div class="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
              <div class="flex items-center gap-2">
                <button id="prevDay" class="px-3 py-2 rounded-xl border">◀</button>
                <button id="todayBtn" class="px-3 py-2 rounded-xl border">Dziś</button>
                <button id="nextDay" class="px-3 py-2 rounded-xl border">▶</button>
              </div>
              <input id="dayPicker" type="date" class="border rounded-xl px-3 py-2 w-full sm:w-auto"/>
            </div>
            <div class="flex w-full items-center gap-2 sm:w-auto sm:flex-nowrap">
              <button id="openMonthPreview" class="w-full px-3 py-2 rounded-xl border sm:w-auto">Podgląd miesiąca</button>
              <button
                id="openFacilityInstructions"
                type="button"
                class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
                title="Instrukcja od opiekuna"
                disabled
              >
                i
              </button>
            </div>
          </div>
          <div class="flex w-full flex-wrap items-center gap-3 text-sm md:w-auto md:flex-nowrap">
            <span class="text-sm">Tryb:</span>
            <label class="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="mode" value="day" checked> Dni
            </label>
            <label class="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="mode" value="hour"> Godziny
            </label>
          </div>
        </div>
        <div id="hourSliderWrap" class="hidden mt-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
            <div class="md:col-span-1 text-sm text-gray-700">Zakres godzin:</div>
            <div class="md:col-span-2 flex items-center gap-3">
              <div class="flex-1"><input id="hourStart" type="range" min="0" max="23" step="1"></div>
              <div>—</div>
              <div class="flex-1"><input id="hourEnd" type="range" min="0" max="23" step="1" value="23"></div>
              <div class="whitespace-nowrap text-sm">
                <span id="hourStartLabel">12:00</span>–<span id="hourEndLabel">14:00</span>
              </div>
            </div>
          </div>
        </div>
        <div class="text-lg font-semibold mt-3" id="dateLabel"></div>
      </div>

      <div id="calendar" class="hidden bg-white rounded-2xl shadow-md p-4">
        <div id="hours" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"></div>
        <p class="text-xs text-gray-500 mt-2">
          🔴 Zajęte (potwierdzone) · 🟡 Wstępne (czeka na akceptację) · brak koloru = dostępne
        </p>
      </div>

      <div id="booking" class="hidden bg-white rounded-2xl shadow p-4">
        <h3 class="font-semibold mb-3">Nowa rezerwacja</h3>
        <form id="bookingForm" class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="text-sm">Rodzaj</label>
            <select name="event_type_id" class="w-full border rounded-xl px-3 py-2"></select>
          </div>
          <div>
            <label class="text-sm">Tytuł wydarzenia</label>
            <input name="title" required readonly class="w-full border rounded-xl px-3 py-2 bg-gray-50" placeholder="Uzupełni się automatycznie" />
          </div>

          <div data-day-fields>
            <label class="text-sm">Dzień rezerwacji</label>
            <input name="day_only" type="date" class="w-full border rounded-xl px-3 py-2" />
          </div>

          <div data-hour-fields class="hidden">
            <label class="text-sm">Początek (godzina)</label>
            <input name="start_time" type="datetime-local" class="w-full border rounded-xl px-3 py-2" />
          </div>
          <div data-hour-fields class="hidden">
            <label class="text-sm">Koniec (godzina)</label>
            <input name="end_time" type="datetime-local" class="w-full border rounded-xl px-3 py-2" />
          </div>

          <div>
            <label class="text-sm">Imię i nazwisko</label>
            <input name="renter_name" required class="w-full border rounded-xl px-3 py-2" />
          </div>
          <div>
            <label class="text-sm">E-mail</label>
            <input name="renter_email" type="email" required class="w-full border rounded-xl px-3 py-2" />
          </div>

          <div class="md:col-span-2">
            <label class="text-sm">Uwagi (opcjonalnie)</label>
            <textarea name="notes" class="w-full border rounded-xl px-3 py-2" rows="2"></textarea>
          </div>

          <div class="md:col-span-2 flex gap-2 items-center">
            <button class="px-4 py-2 rounded-xl bg-blue-600 text-white" type="submit">
              Złóż wstępną rezerwację
            </button>
            <button id="cancelThisBooking" type="button" class="no-print hidden px-3 py-2 border rounded-xl">Anuluj tę rezerwację</button>
            <div id="formMsg" class="text-sm ml-2"></div>
          </div>

          <p class="text-xs text-gray-500 md:col-span-2">
            Wstępna rezerwacja trafia do opiekuna obiektu do akceptacji. Dostaniesz e-mail z decyzją.
          </p>
        </form>

        <div id="docGen" class="mt-6"></div>
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
            class="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-10 h-10 flex items-center justify-center text-lg font-semibold shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="button"
            aria-label="Poprzednie zdjęcie"
          >
            &#10094;
          </button>
          <img id="galleryModalImage" class="max-h-[70vh] w-auto max-w-full object-contain" alt="Zdjęcie obiektu" />
          <button
            id="galleryNext"
            class="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full w-10 h-10 flex items-center justify-center text-lg font-semibold shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              href="./editDescription.html"
              class="px-3 py-1 rounded border text-sm text-blue-700 hover:bg-blue-50"
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
