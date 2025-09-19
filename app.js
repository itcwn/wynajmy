// app.js
// ===============================
// Konfiguracja Supabase
// ===============================
const supabaseUrl = window.__SUPA?.SUPABASE_URL;
const supabaseKey = window.__SUPA?.SUPABASE_ANON_KEY;
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// ===============================
// Stan globalny
// ===============================
const state = {
  facilities: [],
  bookings: [],
  eventTypes: [],
  selectedFacility: null,
  currentDate: new Date(),
  mode: "day",
};

// ===============================
// Init
// ===============================
async function init() {
  await loadFacilities();
  await loadEventTypes();
  renderSidebar();
  renderCalendar();
}
document.addEventListener("DOMContentLoaded", init);

// ===============================
// Ładowanie danych
// ===============================
async function loadFacilities() {
  const { data, error } = await supabase.from("facilities").select("*").order("name");
  if (!error) state.facilities = data || [];
}

async function loadEventTypes() {
  const { data, error } = await supabase.from("event_types").select("*").order("name");
  if (!error) state.eventTypes = data || [];
}

async function loadBookings(facilityId, day) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("facility_id", facilityId)
    .gte("start_time", start.toISOString())
    .lt("end_time", end.toISOString())
    .eq("status", "active")
    .order("start_time");

  state.bookings = !error ? data : [];
}

// ===============================
// Sidebar
// ===============================
function renderSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  sidebar.innerHTML = `
    <h2 class="font-bold mb-2">Świetlica</h2>
    <select id="facilitySelect" class="w-full border rounded px-2 py-1 mb-4">
      <option value="">Wybierz świetlicę</option>
      ${state.facilities
        .map(f => `<option value="${f.id}">${f.name} (${f.postal_code || ""})</option>`)
        .join("")}
    </select>

    <h2 class="font-bold mb-2">Tryb</h2>
    <div class="mb-4">
      <label><input type="radio" name="mode" value="day" ${state.mode === "day" ? "checked" : ""}> Dni</label>
      <label class="ml-4"><input type="radio" name="mode" value="hour" ${state.mode === "hour" ? "checked" : ""}> Godziny</label>
    </div>

    <h2 class="font-bold mb-2">Data</h2>
    <input type="date" id="dayPicker" class="border rounded px-2 py-1 w-full mb-4" value="${state.currentDate.toISOString().slice(0, 10)}">

    <div id="formContainer"></div>
  `;

  document.getElementById("facilitySelect").addEventListener("change", async (e) => {
    const id = e.target.value;
    state.selectedFacility = state.facilities.find(f => f.id == id);
    renderBookingForm();
    await refreshBookings();
  });

  document.querySelectorAll("input[name=mode]").forEach(r => {
    r.addEventListener("change", (e) => {
      state.mode = e.target.value;
      renderCalendar();
    });
  });

  document.getElementById("dayPicker").addEventListener("change", async (e) => {
    state.currentDate = new Date(e.target.value);
    await refreshBookings();
  });
}

// ===============================
// Kalendarz
// ===============================
async function refreshBookings() {
  if (!state.selectedFacility) return;
  await loadBookings(state.selectedFacility.id, state.currentDate);
  renderCalendar();
}

function renderCalendar() {
  const cal = document.getElementById("calendar");
  if (!cal) return;
  cal.innerHTML = "";

  if (state.mode === "day") {
    renderDay();
  } else {
    renderHour();
  }
}

function renderDay() {
  const cal = document.getElementById("calendar");
  if (!cal) return;
  cal.innerHTML = "";

  if (state.bookings.length === 0) {
    cal.innerHTML = `<div class="p-4 bg-white border rounded">Brak rezerwacji w tym dniu.</div>`;
    return;
  }

  state.bookings.forEach(b => {
    const s = new Date(b.start_time);
    const e = new Date(b.end_time);
    const div = document.createElement("div");
    div.className = "p-3 bg-white border rounded mb-2";
    div.innerHTML = `
      <div class="font-semibold">${b.title || "Rezerwacja"}</div>
      <div class="text-sm text-gray-600">${s.toLocaleString("pl-PL")} – ${e.toLocaleString("pl-PL")}</div>
    `;
    cal.appendChild(div);
  });
}

function renderHour() {
  const cal = document.getElementById("calendar");
  if (!cal) return;
  cal.innerHTML = "";

  for (let h = 8; h <= 20; h++) {
    const hourDiv = document.createElement("div");
    hourDiv.className = "border-b py-2 text-sm";
    const label = `${h}:00`;
    const booking = state.bookings.find(b => new Date(b.start_time).getHours() === h);
    hourDiv.textContent = booking ? `${label} – ${booking.title}` : label;
    cal.appendChild(hourDiv);
  }
}

// ===============================
// Formularz rezerwacji
// ===============================
function renderBookingForm() {
  const container = document.getElementById("formContainer");
  if (!container) return;

  if (!state.selectedFacility) {
    container.innerHTML = `<div class="text-sm text-gray-600">Wybierz świetlicę, aby dodać rezerwację.</div>`;
    return;
  }

  container.innerHTML = `
    <h3 class="font-bold mb-2">Nowa rezerwacja</h3>
    <form id="bookingForm" class="space-y-2">
      <input type="text" name="title" placeholder="Tytuł wydarzenia" class="w-full border rounded px-2 py-1" required>
      <input type="text" name="renter_name" placeholder="Imię i nazwisko" class="w-full border rounded px-2 py-1" required>
      <input type="email" name="renter_email" placeholder="E-mail" class="w-full border rounded px-2 py-1">
      <input type="tel" name="renter_phone" placeholder="Telefon" class="w-full border rounded px-2 py-1">
      <label>Od: <input type="datetime-local" name="start_time" class="border rounded px-2 py-1"></label>
      <label>Do: <input type="datetime-local" name="end_time" class="border rounded px-2 py-1"></label>
      <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded">Zarezerwuj</button>
    </form>
    <div id="msg" class="text-sm text-gray-600 mt-2"></div>
  `;

  document.getElementById("bookingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const payload = {
      title: f.title.value,
      renter_name: f.renter_name.value,
      renter_email: f.renter_email.value,
      renter_phone: f.renter_phone.value,
      start_time: f.start_time.value,
      end_time: f.end_time.value,
      facility_id: state.selectedFacility.id,
      status: "active",
    };
    const { data, error } = await supabase.from("bookings").insert(payload).select().single();
    const msg = document.getElementById("msg");
    if (error) {
      msg.textContent = "❌ " + error.message;
    } else {
      msg.textContent = "✅ Rezerwacja dodana!";
      await refreshBookings();

      // ⬇️ DODANE: miejsce na generowanie dokumentów pod formularzem
      let docMount = document.getElementById("docGen");
      if (!docMount) {
        docMount = document.createElement("div");
        docMount.id = "docGen";
        docMount.className = "mt-6";
        container.appendChild(docMount);
      }
      showTemplateSelector(data.id, docMount);
    }
  });
}

// ===============================
// Szablony dokumentów
// ===============================
async function showTemplateSelector(bookingId, mountEl) {
  if (!mountEl) return;

  const { data: booking } = await supabase.from("bookings").select("*").eq("id", bookingId).single();

  const facilityId = booking?.facility_id;
  const { data: templates, error } = await supabase
    .from("document_templates")
    .select("*")
    .in("facility_id", [facilityId, null])
    .eq("is_active", true)
    .order("name");

  if (error) {
    mountEl.innerHTML = `<div class="p-3 border rounded bg-red-50 text-red-800">Błąd pobierania szablonów: ${error.message}</div>`;
    return;
  }

  mountEl.innerHTML = `
    <div class="p-4 border rounded bg-gray-50">
      <h3 class="font-bold mb-3">Wybierz szablon i uzupełnij pola, aby wygenerować/ wydrukować wniosek</h3>
      <div id="tplList" class="grid gap-2 mb-4"></div>
      <div id="tplFields"></div>
    </div>
  `;

  const list = mountEl.querySelector("#tplList");
  const fieldsWrap = mountEl.querySelector("#tplFields");

  (templates || []).forEach(t => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "text-left p-3 border rounded bg-white hover:bg-gray-100";
    el.innerHTML = `
      <div class="font-semibold">${t.name}</div>
      <div class="text-xs text-gray-600">${t.facility_id ? "szablon lokalny" : "szablon ogólny"} • ${t.code}</div>
    `;
    el.addEventListener("click", () => {
      [...list.children].forEach(n => n.classList.remove("ring-2","ring-red-500"));
      el.classList.add("ring-2","ring-red-500");
      renderFieldsForTemplate(t, booking);
    });
    list.appendChild(el);
  });

  function renderFieldsForTemplate(tpl, bookingRow) {
    fieldsWrap.innerHTML = "";

    const matches = [...tpl.html.matchAll(/\{\{booking\.extra\.([a-zA-Z0-9_]+)\}\}/g)];
    const keys = [...new Set(matches.map(m => m[1]))];

    const head = document.createElement("div");
    head.className = "mb-2 text-sm text-gray-700";
    head.textContent = keys.length
      ? "Uzupełnij pola dla wybranego szablonu:"
      : "Ten szablon nie ma dodatkowych pól do uzupełnienia.";
    fieldsWrap.appendChild(head);

    let form;
    if (keys.length) {
      form = document.createElement("form");
      form.className = "border rounded bg-white";
      form.innerHTML = `
        <table class="table-auto w-full">
          <thead>
            <tr class="bg-gray-100">
              <th class="border p-2 text-left w-1/3">Pole</th>
              <th class="border p-2 text-left">Wartość</th>
            </tr>
          </thead>
          <tbody>
            ${keys.map(k => `
              <tr>
                <td class="border p-2 align-top"><code>${k}</code></td>
                <td class="border p-2">
                  <input type="text" class="w-full border rounded px-2 py-1" name="${k}" value="${escapeHtml(bookingRow?.extra?.[k] ?? '')}">
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div class="p-3 flex gap-2">
          <button type="submit" class="px-3 py-2 rounded bg-green-600 text-white">💾 Zapisz dane</button>
          <button type="button" id="previewDoc" class="px-3 py-2 rounded border">👁️ Podgląd</button>
          <button type="button" id="printDoc" class="px-3 py-2 rounded border">🖨️ Drukuj</button>
        </div>
      `;
      fieldsWrap.appendChild(form);
    } else {
      const actions = document.createElement("div");
      actions.className = "flex gap-2";
      actions.innerHTML = `
        <button type="button" id="previewDoc" class="px-3 py-2 rounded border">👁️ Podgląd</button>
        <button type="button" id="printDoc" class="px-3 py-2 rounded border">🖨️ Drukuj</button>
      `;
      fieldsWrap.appendChild(actions);
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const extra = {};
        for (const [k,v] of fd.entries()) extra[k] = v;
        await supabase.from("bookings").update({ extra }).eq("id", bookingId);
        alert("Zapisano dane do dokumentu.");
      });
    }

    const doPreview = async (toPrint=false) => {
      const { data: b } = await supabase.from("bookings").select("*, facilities(*)").eq("id", bookingId).single();
      let html = tpl.html;
      html = replacePlaceholders(html, b, b.facilities || {});
      const w = window.open("", "_blank");
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Dokument</title></head><body>${html}</body></html>`);
      w.document.close(); w.focus();
      if (toPrint) w.print();
    };

    fieldsWrap.querySelector("#previewDoc")?.addEventListener("click", () => doPreview(false));
    fieldsWrap.querySelector("#printDoc")?.addEventListener("click", () => doPreview(true));
  }

  function escapeHtml(s){ return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

  function replacePlaceholders(html, booking, facility) {
    let out = html;
    const map = {
      "{{facility.name}}": facility?.name ?? "",
      "{{facility.address}}": facility?.address ?? "",
      "{{booking.renter_name}}": booking?.renter_name ?? "",
      "{{booking.renter_email}}": booking?.renter_email ?? "",
      "{{booking.renter_phone}}": booking?.renter_phone ?? "",
    };
    for (const [k,v] of Object.entries(map)) out = out.split(k).join(escapeHtml(v));

    const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("pl-PL") : "";
    const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"}) : "";
    out = out.replace(/\{\{\s*date\s+booking\.start_time\s*\}\}/g, fmtDate(booking?.start_time));
    out = out.replace(/\{\{\s*date\s+booking\.end_time\s*\}\}/g, fmtDate(booking?.end_time));
    out = out.replace(/\{\{\s*time\s+booking\.start_time\s*\}\}/g, fmtTime(booking?.start_time));
    out = out.replace(/\{\{\s*time\s+booking\.end_time\s*\}\}/g, fmtTime(booking?.end_time));
    out = out.replace(/\{\{\s*date\s+booking\.request_date\s*\}\}/g, fmtDate(booking?.request_date));

    out = out.replace(/\{\{booking\.extra\.([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
      const val = booking?.extra?.[key];
      return val == null ? "" : escapeHtml(String(val));
    });
    return out;
  }
}
