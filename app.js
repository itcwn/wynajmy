/* app.js — MVP v3 (układ poziomy, suwak godzin, druk HTML, anulowanie) */

/* === Konfiguracja === */
const SUPABASE_URL = window.__SUPA?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.__SUPA?.SUPABASE_ANON_KEY;
const GOOGLE_MAPS_API_KEY = window.__SUPA?.GOOGLE_MAPS_API_KEY || null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  alert("Brak konfiguracji Supabase — uzupełnij supabase-config.js");
}
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* === Globalny state === */
const state = {
  facilities: [],
  amenities: {},
  eventTypes: [],
  selectedFacility: null,
  currentDate: new Date(),
  bookingsCache: new Map(),
  lastBooking: null,
  templates: [],
  mode: "day", // 'day' | 'hour'
  mapsReady: false,
};

/* === Utils === */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fmtDateLabel = (d) =>
  d.toLocaleDateString("pl-PL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const escapeHtml = (str) =>
  String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/* === Layout render === */
function renderSidebar() {
  $("#sidebar").innerHTML = `
    <div class="bg-white rounded-xl shadow p-4">
      <h2 class="font-semibold mb-3">Wyszukaj</h2>
      <input id="q" class="w-full border rounded-xl px-3 py-2" placeholder="Szukaj po nazwie/mieście..." />
    </div>
    <div class="bg-white rounded-xl shadow p-4 mt-3">
      <h2 class="font-semibold mb-3">Świetlice (<span id="count">0</span>)</h2>
      <ul id="facilities" class="space-y-3"></ul>
    </div>
    <div id="mapCard" class="hidden bg-white rounded-xl shadow p-4 mt-3">
      <h3 class="font-semibold mb-3">Mapa</h3>
      <div id="map" style="width:100%;height:280px;border-radius:12px;"></div>
    </div>
  `;
  $("#q").addEventListener("input", renderFacilityList);
}

function renderMain() {
  $("#main").innerHTML = `
    <!-- (1) Nagłówek obiektu -->
    <div id="facilityCard" class="hidden bg-white rounded-2xl shadow overflow-hidden">
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

    <!-- (2) Wybór dnia / tryb godzinowy z suwakiem -->
    <div id="selectors" class="hidden bg-white rounded-2xl shadow p-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <button id="prevDay" class="px-3 py-2 rounded-xl border">◀</button>
          <button id="todayBtn" class="px-3 py-2 rounded-xl border">Dziś</button>
          <button id="nextDay" class="px-3 py-2 rounded-xl border">▶</button>
          <input id="dayPicker" type="date" class="border rounded-xl px-3 py-2"/>
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

    <!-- (3) Formularz rezerwacji -->
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
          <button class="px-4 py-2 rounded-xl bg-blue-600 text-white" type="submit">Zarezerwuj</button>
          <a id="genDocsLink" href="#" class="no-print hidden text-blue-700 underline">Generuj dokumenty</a>
          <button id="cancelThisBooking" type="button" class="no-print hidden px-3 py-2 border rounded-xl">Anuluj tę rezerwację</button>
          <div id="formMsg" class="text-sm ml-2"></div>
        </div>
        <p class="text-xs text-gray-500 md:col-span-2">
          Po dokonaniu rezerwacji otrzymasz e-mail z potwierdzeniem oraz linkiem do anulowania (jeśli będzie potrzebne).
        </p>
      </form>
    </div>

    <!-- (4) Kalendarz dzienny -->
    <div id="calendar" class="hidden bg-white rounded-2xl shadow p-4">
      <div id="hours" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"></div>
      <p class="text-xs text-gray-500 mt-2">Widok dzienny 00–23. Rezerwacje dzienne zajmują cały dzień.</p>
    </div>

    <!-- Szablony dokumentów -->
    <div id="templatesList" class="hidden bg-white rounded-2xl shadow p-4">
      <h3 class="font-semibold mb-3">Szablony dokumentów</h3>
      <ul id="templateItems" class="space-y-2"></ul>
    </div>
  `;
}

/* === Dane słownikowe i obiekty === */
async function loadDictionaries() {
  const [{ data: ams }, { data: evs }] = await Promise.all([
    supabase.from("amenities").select("*").order("name"),
    supabase.from("event_types").select("*").order("name"),
  ]);
  (ams || []).forEach((a) => (state.amenities[a.id] = a.name));
  state.eventTypes = evs || [];
  const sel = document.querySelector('select[name="event_type_id"]');
  sel.innerHTML = `<option value="">(brak)</option>` + state.eventTypes.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
}

async function loadFacilities() {
  const { data } = await supabase.from("facilities").select("*").order("name");
  state.facilities = data || [];
  renderFacilityList();
}

function renderFacilityList() {
  const q = $("#q").value.trim().toLowerCase();
  const list = state.facilities.filter((f) => `${f.name} ${f.city} ${f.postal_code}`.toLowerCase().includes(q));
  $("#count").textContent = list.length;
  const ul = $("#facilities");
  ul.innerHTML = list
    .map(
      (f) => `
      <li>
        <button data-id="${f.id}" class="w-full text-left border rounded-xl p-3 hover:bg-gray-50">
          <div class="font-semibold">${f.name} ${f.postal_code ? "(" + f.postal_code + ")" : ""}</div>
          <div class="text-sm text-gray-600">${f.city}</div>
        </button>
      </li>`
    )
    .join("");
  ul.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => selectFacility(btn.dataset.id)));
}

/* === Google Maps === */
function loadMapsIfKey() {
  if (!GOOGLE_MAPS_API_KEY) return;
  if (document.querySelector('script[data-role="maps"]')) return;
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&callback=initMapsApi`;
  s.async = true;
  s.defer = true;
  s.dataset.role = "maps";
  document.body.appendChild(s);
}
function initMapsApi() {
  state.mapsReady = true;
  if (state.selectedFacility) renderMap();
}
window.initMapsApi = initMapsApi;

function renderMap() {
  const f = state.selectedFacility;
  if (!state.mapsReady || !f || !f.lat || !f.lng) return;
  $("#mapCard").classList.remove("hidden");
  const center = { lat: Number(f.lat), lng: Number(f.lng) };
  const map = new google.maps.Map(document.getElementById("map"), { center, zoom: 13 });
  new google.maps.Marker({ position: center, map, title: f.name });
}

/* === Selekcja obiektu === */
async function selectFacility(id) {
  loadMapsIfKey();
  const f = state.facilities.find((x) => x.id === id);
  state.selectedFacility = f;

  $("#facilityCard").classList.remove("hidden");
  $("#selectors").classList.remove("hidden");
  $("#booking").classList.remove("hidden");
  $("#calendar").classList.remove("hidden");
  $("#templatesList").classList.add("hidden");

  $("#facilityImg").src = f.image_url || "https://picsum.photos/800/400";
  $("#facilityName").textContent = `${f.name} ${f.postal_code ? "(" + f.postal_code + ")" : ""}`;
  $("#facilityDesc").textContent = f.description || "";
  const address = `${f.address_line1 || ""}${f.address_line2 ? ", " + f.address_line2 : ""}, ${f.postal_code || ""} ${f.city || ""}`;
  $("#facilityAddr").textContent = address;
  $("#facilityCap").textContent = f.capacity ? `Pojemność: ${f.capacity}` : "";
  $("#facilityPrices").textContent = [
    f.price_per_hour ? `Cena/h: ${Number(f.price_per_hour).toFixed(2)} zł` : null,
    f.price_per_day ? `Cena/doba: ${Number(f.price_per_day).toFixed(2)} zł` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { data: joins } = await supabase.from("facility_amenities").select("amenity_id").eq("facility_id", f.id);
  $("#facilityAmenities").innerHTML = (joins || [])
    .map((j) => `<span class="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">${state.amenities[j.amenity_id] || "—"}</span>`)
    .join("");

  state.currentDate = new Date();
  setDayPickerFromCurrent();
  initHourSliderDefaults();
  await renderDay();
  await loadTemplatesForFacility();
  renderMap();
}

/* === Kontrolki daty/godzin === */
function setDayPickerFromCurrent() {
  const d = state.currentDate;
  $("#dayPicker").value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  document.querySelector('input[name="day_only"]').value = $("#dayPicker").value;
  $("#dateLabel").textContent = fmtDateLabel(d);
}

function initHourSliderDefaults() {
  $("#hourStart").value = 12;
  $("#hourEnd").value = 14;
  updateHourLabels();
}

function updateHourLabels() {
  let s = parseInt($("#hourStart").value, 10);
  let e = parseInt($("#hourEnd").value, 10);
  if (e <= s) {
    e = s + 1;
    $("#hourEnd").value = e;
  }
  $("#hourStartLabel").textContent = `${pad2(s)}:00`;
  $("#hourEndLabel").textContent = `${pad2(e)}:00`;
  const day = $("#dayPicker").value;
  document.querySelector('input[name="start_time"]').value = `${day}T${pad2(s)}:00`;
  document.querySelector('input[name="end_time"]').value = `${day}T${pad2(e)}:00`;
}

/* === Kalendarz dzienny === */
async function fetchBookingsForDay(facilityId, date) {
  const key = facilityId + ymd(date);
  if (state.bookingsCache.has(key)) return state.bookingsCache.get(key);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const { data } = await supabase
    .from("public_bookings")
    .select("*")
    .eq("facility_id", facilityId)
    .gte("start_time", start.toISOString())
    .lte("end_time", end.toISOString())
    .order("start_time");
  state.bookingsCache.set(key, data || []);
  return data || [];
}

async function renderDay() {
  const d = state.currentDate;
  $("#dateLabel").textContent = fmtDateLabel(d);
  const hoursEl = $("#hours");
  hoursEl.innerHTML = "";
  const bookings = await fetchBookingsForDay(state.selectedFacility.id, d);
  const busy = new Array(24).fill(null);
  bookings.forEach((b) => {
    const s = new Date(b.start_time);
    const e = new Date(b.end_time);
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    const from = Math.max(0, Math.floor((Math.max(s, dayStart) - dayStart) / 3600000));
    const to = Math.min(24, Math.ceil((Math.min(e, dayEnd) - dayStart) / 3600000));
    for (let h = from; h < to; h++) busy[h] = b.title || "Zajęte";
  });
  for (let h = 0; h < 24; h++) {
    const label = `${pad2(h)}:00`;
    const booked = !!busy[h];
    const title = busy[h] || "";
    const cell = document.createElement("div");
    cell.className = `border rounded-xl p-3 ${booked ? "bg-red-50 border-red-200 text-red-800" : "bg-white"}`;
    cell.innerHTML =
      `<div class="font-mono text-sm">${label}</div>` +
      (booked ? `<div class="text-xs">${title}</div>` : `<div class="text-xs text-gray-500">wolne</div>`);
    hoursEl.appendChild(cell);
  }
  // domyślne pola formularza
  const yyyy = d.getFullYear(),
    mm = pad2(d.getMonth() + 1),
    dd = pad2(d.getDate());
  document.querySelector('input[name="start_time"]').value = `${yyyy}-${mm}-${dd}T12:00`;
  document.querySelector('input[name="end_time"]').value = `${yyyy}-${mm}-${dd}T14:00`;
  document.querySelector('input[name="day_only"]').value = `${yyyy}-${mm}-${dd}`;
}

/* === Zdarzenia UI selektorów === */
document.addEventListener("click", (e) => {
  const id = e.target.id;
  if (id === "prevDay") {
    state.currentDate.setDate(state.currentDate.getDate() - 1);
    setDayPickerFromCurrent();
    renderDay();
    updateHourLabels();
  }
  if (id === "nextDay") {
    state.currentDate.setDate(state.currentDate.getDate() + 1);
    setDayPickerFromCurrent();
    renderDay();
    updateHourLabels();
  }
  if (id === "todayBtn") {
    state.currentDate = new Date();
    setDayPickerFromCurrent();
    renderDay();
    updateHourLabels();
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "dayPicker") {
    const d = new Date(e.target.value + "T00:00");
    if (!isNaN(d)) {
      state.currentDate = d;
      renderDay();
      updateHourLabels();
    }
  }
  if (e.target.name === "mode") {
    state.mode = e.target.value;
    $$('[data-hour-fields]').forEach((el) => el.classList.toggle("hidden", state.mode === "day"));
    $$('[data-day-fields]').forEach((el) => el.classList.toggle("hidden", state.mode !== "day"));
    $("#hourSliderWrap").classList.toggle("hidden", state.mode !== "hour");
  }
  if (e.target.id === "hourStart" || e.target.id === "hourEnd") {
    updateHourLabels();
  }
});

/* === Formularz rezerwacji === */
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "bookingForm") return;
  e.preventDefault();
  const form = e.target;
  const msg = $("#formMsg");
  msg.textContent = "Trwa zapisywanie...";

  let startIso, endIso;
  if (state.mode === "day") {
    const d = form.day_only.value;
    if (!d) {
      msg.textContent = "Wybierz dzień.";
      return;
    }
    startIso = new Date(d + "T00:00").toISOString();
    endIso = new Date(d + "T23:59:59").toISOString();
  } else {
    const day = $("#dayPicker").value;
    const sH = pad2(parseInt($("#hourStart").value, 10));
    const eH = pad2(parseInt($("#hourEnd").value, 10));
    startIso = new Date(`${day}T${sH}:00`).toISOString();
    endIso = new Date(`${day}T${eH}:00`).toISOString();
    if (new Date(endIso) <= new Date(startIso)) {
      msg.textContent = "Koniec musi być po początku.";
      return;
    }
  }

  const payload = {
    facility_id: state.selectedFacility.id,
    title: form.title.value.trim(),
    event_type_id: form.event_type_id.value || null,
    start_time: startIso,
    end_time: endIso,
    renter_name: form.renter_name.value.trim(),
    renter_email: form.renter_email.value.trim(),
    notes: form.notes.value.trim() || null,
    is_public: $("#is_public").checked,
  };

  const { data, error } = await supabase.from("bookings").insert(payload).select();
  if (error) {
    console.error(error);
    msg.textContent = "Błąd: " + (error.message || "nie udało się utworzyć rezerwacji.");
    return;
  }
  msg.textContent = "Zarezerwowano!";
  state.lastBooking = data && data[0] ? data[0] : null;
  state.bookingsCache.clear();
  await renderDay();
  $("#genDocsLink").classList.remove("hidden");
  $("#cancelThisBooking").classList.remove("hidden");

  if (state.lastBooking) {
    const cancelUrl = new URL(window.location.href);
    cancelUrl.searchParams.set("cancel", state.lastBooking.cancel_token);
    console.log("Cancel URL (do e-maila):", cancelUrl.toString());
  }
});

/* === Anulowanie z przycisku === */
document.addEventListener("click", async (e) => {
  if (e.target.id !== "cancelThisBooking") return;
  if (!state.lastBooking) {
    alert("Brak ostatniej rezerwacji.");
    return;
  }
  if (!confirm("Na pewno anulować tę rezerwację?")) return;
  const { data, error } = await supabase.rpc("cancel_booking", { p_token: state.lastBooking.cancel_token });
  if (error) {
    alert("Błąd anulowania: " + (error.message || ""));
    return;
  }
  if (data) {
    alert("Rezerwacja anulowana.");
    state.bookingsCache.clear();
    await renderDay();
  } else {
    alert("Nie znaleziono lub już anulowana.");
  }
});

/* === Dokumenty — lista szablonów i druk HTML === */
async function loadTemplatesForFacility() {
  const f = state.selectedFacility;
  if (!f) return;
  const { data: local } = await supabase
    .from("document_templates")
    .select("*")
    .eq("is_active", true)
    .eq("facility_id", f.id)
    .order("name");
  const { data: global } = await supabase
    .from("document_templates")
    .select("*")
    .eq("is_active", true)
    .is("facility_id", null)
    .order("name");

  const codes = new Set((local || []).map((t) => t.code));
  const merged = [...(local || []), ...(global || []).filter((t) => !codes.has(t.code))];
  state.templates = merged;

  const ul = $("#templateItems");
  ul.innerHTML = merged
    .map(
      (t) => `
      <li class="flex items-center justify-between border rounded-xl p-3">
        <div>
          <div class="font-medium">${t.name}</div>
          <div class="text-xs text-gray-500">${t.code}${t.facility_id ? " • lokalny" : " • globalny"}</div>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-2 border rounded-xl" data-action="preview" data-id="${t.id}">Otwórz</button>
          <button class="px-3 py-2 border rounded-xl" data-action="print" data-id="${t.id}">Drukuj</button>
        </div>
      </li>`
    )
    .join("");
  $("#templatesList").classList.remove("hidden");

  ul.querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", async (ev) => {
      const id = ev.currentTarget.dataset.id;
      const act = ev.currentTarget.dataset.action;
      const tpl = merged.find((x) => x.id === id);
      if (!tpl) return;
      const html = await renderTemplateHTML(tpl.html);
      if (act === "preview") openPreviewWindow(html);
      if (act === "print") openPreviewWindow(html, true);
    })
  );
}

function getBookingContext() {
  if (state.lastBooking) {
    return {
      title: state.lastBooking.title,
      start_time: state.lastBooking.start_time,
      end_time: state.lastBooking.end_time,
      renter_name: state.lastBooking.renter_name,
      renter_email: state.lastBooking.renter_email,
      notes: state.lastBooking.notes || "",
    };
  }
  const form = $("#bookingForm");
  return {
    title: form.title.value.trim(),
    start_time: new Date(form.start_time.value).toISOString(),
    end_time: new Date(form.end_time.value).toISOString(),
    renter_name: form.renter_name.value.trim(),
    renter_email: form.renter_email.value.trim(),
    notes: form.notes.value.trim() || "",
  };
}

function getFacilityContext() {
  const f = state.selectedFacility || {};
  const address = `${f.address_line1 || ""}${f.address_line2 ? ", " + f.address_line2 : ""}, ${f.postal_code || ""} ${f.city || ""}`.trim();
  return {
    name: f.name || "",
    address,
    city: f.city || "",
    postal_code: f.postal_code || "",
    capacity: f.capacity || "",
    price_per_hour: f.price_per_hour || "",
    price_per_day: f.price_per_day || "",
  };
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pl-PL");
}
function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

async function renderTemplateHTML(templateHtml) {
  const booking = getBookingContext();
  const facility = getFacilityContext();
  let html = templateHtml;

  const map = {
    "{{booking.title}}": booking.title || "",
    "{{booking.renter_name}}": booking.renter_name || "",
    "{{booking.renter_email}}": booking.renter_email || "",
    "{{booking.notes}}": booking.notes || "",
    "{{facility.name}}": facility.name || "",
    "{{facility.address}}": facility.address || "",
    "{{facility.city}}": facility.city || "",
    "{{facility.postal_code}}": facility.postal_code || "",
    "{{facility.capacity}}": facility.capacity || "",
    "{{facility.price_per_hour}}": facility.price_per_hour || "",
    "{{facility.price_per_day}}": facility.price_per_day || "",
  };
  for (const [k, v] of Object.entries(map)) {
    html = html.split(k).join(escapeHtml(String(v)));
  }
  html = html.replace(/\{\{\s*date\s+booking\.start_time\s*\}\}/g, formatDate(booking.start_time));
  html = html.replace(/\{\{\s*date\s+booking\.end_time\s*\}\}/g, formatDate(booking.end_time));
  html = html.replace(/\{\{\s*time\s+booking\.start_time\s*\}\}/g, formatTime(booking.start_time));
  html = html.replace(/\{\{\s*time\s+booking\.end_time\s*\}\}/g, formatTime(booking.end_time));

  const style = `<style id="print-styles">
    body{font-family:system-ui, sans-serif; padding:24px}
    h1{font-size:20px;margin:0 0 8px 0}
    h2{font-size:14px;margin:0 0 10px 0;color:#666}
    h3{font-size:12px;margin:12px 0 6px 0}
    .doc table{width:100%;border-collapse:collapse}
    .doc table td,.doc table th{border:1px solid #ccc;padding:6px}
    .signs{display:flex;gap:40px;justify-content:space-between;margin-top:30px}
    @page { size: A4; margin: 15mm }
  </style>`;

  return `<!doctype html><html><head><meta charset="utf-8" />${style}<title>Dokument</title></head><body>${html}</body></html>`;
}

function openPreviewWindow(html, doPrint = false) {
  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  if (doPrint) w.print();
}

/* === URL: anulowanie po tokenie (?cancel=...) === */
async function tryCancelFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("cancel");
  if (!token) return;
  if (!confirm("Wykryto link anulowania rezerwacji. Czy chcesz kontynuować?")) return;
  const { data, error } = await supabase.rpc("cancel_booking", { p_token: token });
  if (error) {
    alert("Błąd anulowania: " + (error.message || ""));
    return;
  }
  if (data) {
    alert("Rezerwacja anulowana.");
    state.bookingsCache.clear();
    if (state.selectedFacility) await renderDay();
  } else {
    alert("Nie znaleziono lub już anulowana.");
  }
}

/* === Inicjalizacja === */
async function init() {
  renderSidebar();
  renderMain();
  await loadDictionaries();
  await loadFacilities();

  // Zdarzenia dla dokumentów (link pokaże listę po zapisie rezerwacji)
  $("#genDocsLink")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await loadTemplatesForFacility();
    const top = $("#templatesList").offsetTop;
    window.scrollTo({ top: top - 20, behavior: "smooth" });
  });

  await tryCancelFromUrl();
}
init();
