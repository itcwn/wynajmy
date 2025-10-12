export function createDayView({ state, supabase, domUtils, formatUtils }) {
  const { $, $$ } = domUtils;
  const { pad2, fmtDateLabel, ymd, escapeHtml } = formatUtils;

  let listenersAttached = false;
  const dateChangeListeners = new Set();

  function notifyDateChange(date = state.currentDate) {
    const safeDate = date instanceof Date ? new Date(date) : new Date(state.currentDate);
    dateChangeListeners.forEach((listener) => {
      if (typeof listener === 'function') {
        try {
          listener(new Date(safeDate));
        } catch (error) {
          console.warn('Błąd listenera zmiany daty:', error);
        }
      }
    });
  }

  function setDayPickerFromCurrent() {
    const d = state.currentDate;
    const value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const picker = $('#dayPicker');
    if (picker) {
      picker.value = value;
    }
    const dayInput = $('#bookingForm input[name="day_only"]');
    if (dayInput) {
      dayInput.value = value;
    }
    const label = $('#dateLabel');
    if (label) {
      label.textContent = fmtDateLabel(d);
    }
    notifyDateChange(state.currentDate);
  }

  function getVisibleHourRange() {
    if (state.mode !== 'hour') {
      return { start: 0, end: 24 };
    }
    const startEl = $('#hourStart');
    const endEl = $('#hourEnd');
    if (!startEl || !endEl) {
      return { start: 0, end: 24 };
    }
    let start = parseInt(startEl.value, 10);
    let end = parseInt(endEl.value, 10);
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end)) end = 24;
    if (end <= start) {
      end = start + 1;
      endEl.value = String(end);
    }
    return { start, end };
  }

  function isAllDayRange(startDate, endDate) {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      return false;
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      return false;
    }
    const startIsMidnight = startDate.getHours() === 0 && startDate.getMinutes() === 0;
    const endIsBeforeMidnight = endDate.getHours() === 23 && endDate.getMinutes() >= 59;
    const endIsMidnightNextDay = endDate.getHours() === 0 && endDate.getMinutes() === 0 && endDate > startDate;
    const msInDay = 24 * 60 * 60 * 1000;
    const duration = endDate.getTime() - startDate.getTime();
    const almostDay = Math.abs(duration - msInDay) <= 60 * 1000 || Math.abs(duration - (msInDay - 1000)) <= 60 * 1000;
    return startIsMidnight && (endIsBeforeMidnight || (endIsMidnightNextDay && almostDay));
  }

  function updateHourLabels(triggerRender = true) {
    const startEl = $('#hourStart');
    const endEl = $('#hourEnd');
    if (!startEl || !endEl) {
      return;
    }
    let start = parseInt(startEl.value, 10);
    let end = parseInt(endEl.value, 10);
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end)) end = 24;
    if (end <= start) {
      end = start + 1;
      endEl.value = String(end);
    }
    const startLabel = $('#hourStartLabel');
    if (startLabel) {
      startLabel.textContent = `${pad2(start)}:00`;
    }
    const endLabel = $('#hourEndLabel');
    if (endLabel) {
      endLabel.textContent = `${pad2(end)}:00`;
    }
    const dayValue = $('#dayPicker')?.value;
    const startField = $('#bookingForm input[name="start_time"]');
    const endField = $('#bookingForm input[name="end_time"]');
    if (dayValue) {
      if (startField) startField.value = `${dayValue}T${pad2(start)}:00`;
      if (endField) endField.value = `${dayValue}T${pad2(end)}:00`;
    }
    if (triggerRender) {
      void renderDay();
    }
  }

  function initHourSliderDefaults() {
    const startEl = $('#hourStart');
    const endEl = $('#hourEnd');
    if (!startEl || !endEl) {
      return;
    }
    startEl.value = '12';
    endEl.value = '14';
    updateHourLabels(false);
  }

  async function fetchBookingsForDay(facilityId, date) {
    const key = `${facilityId}${ymd(date)}`;
    if (state.bookingsCache.has(key)) {
      return state.bookingsCache.get(key);
    }
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from('public_bookings')
      .select('*')
      .eq('facility_id', facilityId)
      .gte('start_time', start.toISOString())
      .lte('end_time', end.toISOString())
      .order('start_time');
    const bookings = data || [];
    state.bookingsCache.set(key, bookings);
    return bookings;
  }

  function statusClasses(status) {
    switch ((status || '').toLowerCase()) {
      case 'active':
        return {
          bg: 'bg-red-50',
          border: 'border-red-300',
          text: 'text-red-900',
          chipBg: 'bg-red-100',
          chipText: 'text-red-800',
          chipBorder: 'border-red-200',
          chipLabel: 'zajęte',
        };
      case 'pending':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-300',
          text: 'text-amber-900',
          chipBg: 'bg-amber-100',
          chipText: 'text-amber-800',
          chipBorder: 'border-amber-200',
          chipLabel: 'wstępna',
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700',
          chipBg: 'bg-gray-100',
          chipText: 'text-gray-700',
          chipBorder: 'border-gray-200',
          chipLabel: '',
        };
    }
  }

  async function renderDay() {
    if (!state.selectedFacility) {
      return;
    }
    state.renderSeq = (state.renderSeq || 0) + 1;
    const mySeq = state.renderSeq;
    const d = state.currentDate;
    const label = $('#dateLabel');
    if (label) {
      label.textContent = fmtDateLabel(d);
    }
    const hoursEl = $('#hours');
    if (!hoursEl) {
      return;
    }
    hoursEl.innerHTML = '';
    const bookings = await fetchBookingsForDay(state.selectedFacility.id, d);
    if (mySeq !== state.renderSeq) {
      return;
    }
    if (state.mode === 'day') {
      if (!bookings.length) {
        const empty = document.createElement('div');
        empty.className = 'rounded-xl border border-gray-200 bg-gray-50 text-gray-700 p-3';
        empty.textContent = 'Brak rezerwacji w tym dniu.';
        hoursEl.appendChild(empty);
        return;
      }
      const activeCount = bookings.filter((b) => (b.status || '').toLowerCase() === 'active').length;
      const pendingCount = bookings.filter((b) => (b.status || '').toLowerCase() === 'pending').length;
      const info = document.createElement('div');
      info.className = 'rounded-xl border bg-white shadow-sm p-3 flex gap-2 text-sm';
      info.innerHTML = `
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 bg-red-50 text-red-800">🔴 zajęte: ${activeCount}</span>
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-200 bg-amber-50 text-amber-800">🟡 wstępne: ${pendingCount}</span>
      `;
      hoursEl.appendChild(info);
      bookings.forEach((b) => {
        const item = document.createElement('div');
        const C = statusClasses(b.status);
        item.className = `rounded-xl border ${C.border} ${C.bg} ${C.text} shadow-sm p-3`;
        const s = new Date(b.start_time);
        const e = new Date(b.end_time);
        const timeLabel = isAllDayRange(s, e)
          ? 'Cały dzień'
          : `${s.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
            + `–${e.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
        item.innerHTML = `
          <div class="flex items-start justify-between">
            <div>
              <div class="text-sm font-semibold">${escapeHtml(b.title || 'Rezerwacja')}</div>
              <div class="text-xs text-gray-600">${timeLabel}</div>
            </div>
            <span class="text-[11px] px-2 py-1 rounded ${C.chipBg} ${C.chipText} border ${C.chipBorder}">${C.chipLabel}</span>
          </div>
        `;
        hoursEl.appendChild(item);
      });
      return;
    }

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
      for (let h = from; h < to; h += 1) {
        busy[h] = { title: b.title || 'Rezerwacja', status: (b.status || '').toLowerCase() };
      }
    });

    const { start, end } = getVisibleHourRange();
    for (let h = start; h < end; h += 1) {
      const labelHour = `${pad2(h)}:00`;
      const info = busy[h];
      const cell = document.createElement('div');
      let cls = 'rounded-xl p-3 border ';
      let html = `<div class="font-mono text-sm">${labelHour}</div>`;
      if (info) {
        const C = statusClasses(info.status);
        cls += `${C.bg} ${C.border} ${C.text} shadow-sm`;
        html += `<div class="text-xs">${escapeHtml(info.title)}</div>`;
        html += `<div class="text-[11px] mt-1 inline-block px-2 py-0.5 rounded ${C.chipBg} ${C.chipText} border ${C.chipBorder}">${info.status === 'active' ? 'zajęte' : 'wstępna'}</div>`;
      } else {
        cls += 'bg-emerald-50 border-emerald-200 text-emerald-700';
        html += '<div class="text-xs font-semibold text-emerald-700">Termin dostępny</div>';
      }
      cell.className = cls;
      cell.innerHTML = html;
      hoursEl.appendChild(cell);
    }
  }

  function attachDayViewListeners() {
    if (listenersAttached) {
      return;
    }
    listenersAttached = true;
    const prev = $('#prevDay');
    if (prev) {
      prev.addEventListener('click', () => {
        state.currentDate.setDate(state.currentDate.getDate() - 1);
        setDayPickerFromCurrent();
        updateHourLabels(false);
        void renderDay();
      });
    }
    const next = $('#nextDay');
    if (next) {
      next.addEventListener('click', () => {
        state.currentDate.setDate(state.currentDate.getDate() + 1);
        setDayPickerFromCurrent();
        updateHourLabels(false);
        void renderDay();
      });
    }
    const today = $('#todayBtn');
    if (today) {
      today.addEventListener('click', () => {
        state.currentDate = new Date();
        setDayPickerFromCurrent();
        updateHourLabels(false);
        void renderDay();
      });
    }
    const picker = $('#dayPicker');
    if (picker) {
      picker.addEventListener('change', (event) => {
        const value = event.target.value;
        if (!value) return;
        const d = new Date(`${value}T00:00`);
        if (!Number.isNaN(d.getTime())) {
          state.currentDate = d;
          setDayPickerFromCurrent();
          updateHourLabels(false);
          void renderDay();
        }
      });
    }
    $$('input[name="mode"]').forEach((el) => {
      el.addEventListener('change', (event) => {
        state.mode = event.target.value;
        $$('[data-hour-fields]').forEach((node) => node.classList.toggle('hidden', state.mode === 'day'));
        $$('[data-day-fields]').forEach((node) => node.classList.toggle('hidden', state.mode !== 'day'));
        const wrap = $('#hourSliderWrap');
        if (wrap) {
          wrap.classList.toggle('hidden', state.mode !== 'hour');
        }
        void renderDay();
      });
    });
    const startEl = $('#hourStart');
    if (startEl) {
      startEl.addEventListener('input', () => updateHourLabels());
      startEl.addEventListener('change', () => updateHourLabels());
    }
    const endEl = $('#hourEnd');
    if (endEl) {
      endEl.addEventListener('input', () => updateHourLabels());
      endEl.addEventListener('change', () => updateHourLabels());
    }
  }

  return {
    attachDayViewListeners,
    fetchBookingsForDay,
    initHourSliderDefaults,
    renderDay,
    setDayPickerFromCurrent,
    statusClasses,
    onDateChange: (listener) => {
      if (typeof listener === 'function') {
        dateChangeListeners.add(listener);
        return () => dateChangeListeners.delete(listener);
      }
      return () => {};
    },
  };
}
