/* app.js — MVP v3 (układ poziomy, slider godzin filtruje kalendarz) */

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
const fmtDateLabel = (d) =>
  d.toLocaleDateString("pl-PL", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

/* --- tu pomijam wcześniejsze funkcje, np. renderSidebar(), renderMain(), loadFacilities() itd.
     (zostały bez zmian w stosunku do poprzedniej wersji) --- */

/* === NOWE: zakres godzin do wyświetlenia w kalendarzu === */
function getVisibleHourRange() {
  if (state.mode !== "hour") return { start: 0, end: 24 }; // cały dzień
  let s = parseInt($("#hourStart").value, 10);
  let e = parseInt($("#hourEnd").value, 10);
  if (e <= s) e = s + 1; // min. 1 godzina
  return { start: s, end: e };
}

/* === Kalendarz dzienny === */
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
    const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(d); dayEnd.setHours(23,59,59,999);
    const from = Math.max(0, Math.floor((Math.max(s, dayStart) - dayStart) / 3600000));
    const to   = Math.min(24, Math.ceil((Math.min(e, dayEnd)   - dayStart) / 3600000));
    for (let h = from; h < to; h++) busy[h] = b.title || "Zajęte";
  });

  // użyj zakresu z suwaka
  const { start, end } = getVisibleHourRange();

  for (let h = start; h < end; h++) {
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
}

/* === Suwaki godzinowe === */
function updateHourLabels() {
  let s = parseInt($("#hourStart").value, 10);
  let e = parseInt($("#hourEnd").value, 10);
  if (e <= s) {
    e = s + 1;
    $("#hourEnd").value = e;
  }
  $("#hourStartLabel").textContent = `${pad2(s)}:00`;
  $("#hourEndLabel").textContent   = `${pad2(e)}:00`;

  // odśwież kalendarz wg nowego zakresu
  renderDay();
}

/* === Przełączanie trybu Dni/Godziny === */
document.addEventListener("change", (e) => {
  if (e.target.name === "mode") {
    state.mode = e.target.value;
    $$('[data-hour-fields]').forEach(el => el.classList.toggle("hidden", state.mode === "day"));
    $$('[data-day-fields]').forEach(el => el.classList.toggle("hidden", state.mode !== "day"));
    $("#hourSliderWrap").classList.toggle("hidden", state.mode !== "hour");
    renderDay(); // ⬅️ odświeżenie po zmianie trybu
  }
  if (e.target.id === "hourStart" || e.target.id === "hourEnd") {
    updateHourLabels();
  }
});

/* === Reszta kodu app.js (formularz, anulowanie, dokumenty, inicjalizacja) pozostaje jak poprzednio === */
