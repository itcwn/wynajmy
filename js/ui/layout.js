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
        <div class="grid grid-cols-1 md:grid-cols-3">
          <img id="facilityImg" class="w-full h-56 object-cover md:col-span-1" alt="Zdjęcie świetlicy"/>
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
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2">
            <button id="prevDay" class="px-3 py-2 rounded-xl border">◀</button>
            <button id="todayBtn" class="px-3 py-2 rounded-xl border">Dziś</button>
            <button id="nextDay" class="px-3 py-2 rounded-xl border">▶</button>
            <input id="dayPicker" type="date" class="border rounded-xl px-3 py-2"/>
            <button id="openMonthPreview" class="px-3 py-2 rounded-xl border">Podgląd miesiąca</button>
          </div>
          <div class="flex items-center gap-3">
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
            <label class="text-sm">Tytuł wydarzenia</label>
            <input name="title" required class="w-full border rounded-xl px-3 py-2" placeholder="np. Urodziny" />
          </div>
          <div>
            <label class="text-sm">Rodzaj</label>
            <select name="event_type_id" class="w-full border rounded-xl px-3 py-2"></select>
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

          <div class="flex items-center gap-2 md:col-span-2">
            <input id="is_public" type="checkbox" checked class="w-4 h-4"/>
            <label for="is_public" class="text-sm">Pokaż tytuł wydarzenia publicznie w kalendarzu</label>
          </div>

          <div class="md:col-span-2 flex gap-2 items-center">
            <button class="px-4 py-2 rounded-xl bg-blue-600 text-white" type="submit">
              Złóż wstępną rezerwację
            </button>
            <a id="genDocsLink" href="#" class="no-print hidden text-blue-700 underline">Generuj dokumenty</a>
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
  `;
}
