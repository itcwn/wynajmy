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
  mode: "day", // 'day' albo 'hour'
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

  // events
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
    if (error) {
      document.getElementById("msg").textContent = "❌ " + error.message;
    } else {
      document.getElementById("msg").textContent = "✅ Rezerwacja dodana!";
      await refreshBookings();
      showTemplateSelector(data.id); // po rezerwacji pokaż wybór szablonu
    }
  });
}

// ===============================
// Szablony dokumentów
// ===============================
async function showTemplateSelector(newBookingId) {
  const { data: templates } = await supabase.from("document_templates").select("*").eq("is_active", true);

  const container = document.createElement("div");
  container.className = "mt-6 p-4 border rounded bg-gray-50";
  container.innerHTML = `<h3 class="font-bold mb-3">Wybierz szablon i uzupełnij pola do dokumentu</h3>`;

  const list = document.createElement("div");
  list.className = "grid gap-3 mb-4";

  let selectedTpl = null;
  let fieldsForm = document.createElement("div");

  templates.forEach(tpl => {
    const btn = document.createElement("div");
    btn.className = "p-3 border rounded cursor-pointer hover:bg-gray-100";
    btn.innerHTML = `<div class="font-semibold">${tpl.name}</div><div class="text-sm text-gray-600">${tpl.code}</div>`;
    btn.addEventListener("click", () => {
      [...list.children].forEach(el => el.classList.remove("border-red-500"));
      btn.classList.add("border-red-500");
      selectedTpl = tpl;
      renderFieldsForm(tpl.html);
    });
    list.appendChild(btn);
  });

  container.appendChild(list);
  container.appendChild(fieldsForm);

  function renderFieldsForm(html) {
    fieldsForm.innerHTML = "";
    const matches = [...html.matchAll(/\{\{booking\.extra\.([a-zA-Z0-9_]+)\}\}/g)];
    const uniqueKeys = [...new Set(matches.map(m => m[1]))];

    if (uniqueKeys.length === 0) {
      fieldsForm.innerHTML = "<p class='text-sm text-gray-600'>Ten szablon nie wymaga dodatkowych pól.</p>";
      return;
    }

    const table = document.createElement("table");
    table.className = "table-auto w-full border border-gray-300";
    table.innerHTML = "<thead><tr class='bg-gray-100'><th class='border p-2'>Pole</th><th class='border p-2'>Wartość</th></tr></thead>";
    const tbody = document.createElement("tbody");

    uniqueKeys.forEach(k => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="border p-2">${k}</td>
        <td class="border p-2"><input type="text" data-extra="${k}" class="w-full border rounded px-2 py-1" /></td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    fieldsForm.appendChild(table);

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "💾 Zapisz dane do dokumentu";
    saveBtn.className = "mt-3 px-3 py-2 bg-green-600 text-white rounded";
    saveBtn.addEventListener("click", async () => {
      const extras = {};
      fieldsForm.querySelectorAll("input[data-extra]").forEach(inp => {
        extras[inp.dataset.extra] = inp.value;
      });
      await supabase.from("bookings").update({ extra: extras }).eq("id", newBookingId);
      alert("Dane do dokumentu zapisane.");
    });

    fieldsForm.appendChild(saveBtn);
  }

  const formContainer = document.getElementById("formContainer");
  if (formContainer) formContainer.appendChild(container);
}

// ===============================
// Podmiana placeholderów
// ===============================
function fillTemplate(html, booking, facility) {
  let out = html;

  // standardowe pola
  out = out.replace(/\{\{booking\.renter_name\}\}/g, booking.renter_name || "__________");
  out = out.replace(/\{\{booking\.renter_email\}\}/g, booking.renter_email || "__________");
  out = out.replace(/\{\{facility\.name\}\}/g, facility.name || "__________");
  out = out.replace(/\{\{facility\.address\}\}/g, facility.address || "__________");

  // extra pola
  out = out.replace(/\{\{booking\.extra\.([a-zA-Z0-9_]+)\}\}/g, (m, key) => {
    return booking.extra?.[key] || "__________";
  });

  return out;
}
