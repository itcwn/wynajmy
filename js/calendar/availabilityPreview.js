import { refreshLayoutAlignment } from '../ui/layout.js';

const PREVIEW_DAYS = 14;
const PREVIEW_STEP = 7;

const STATUS_META = {
  available: {
    className: 'availability-tile availability-tile--available',
    label: 'Termin dostępny',
  },
  pending: {
    className: 'availability-tile availability-tile--pending',
    label: 'Termin wstępnie zajęty',
  },
  busy: {
    className: 'availability-tile availability-tile--busy',
    label: 'Termin zajęty',
  },
};

export function createAvailabilityPreview({ state, dayView, domUtils, formatUtils }) {
  const { $ } = domUtils;
  const { ymd } = formatUtils;

  let currentFacilityId = null;
  let renderSeq = 0;
  let previewAnchorDate = null;
  let unsubscribeDateChange = null;

  function normalizeDate(input) {
    if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
      return null;
    }
    const normalized = new Date(input);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  function getDefaultAnchorDate() {
    const candidate = normalizeDate(state.currentDate || new Date());
    if (candidate) {
      return candidate;
    }
    const fallback = normalizeDate(new Date());
    return fallback || new Date();
  }

  function setPreviewAnchor(date) {
    const normalized = normalizeDate(date);
    previewAnchorDate = normalized ? new Date(normalized) : null;
  }

  function getPreviewAnchor() {
    return previewAnchorDate ? new Date(previewAnchorDate) : getDefaultAnchorDate();
  }

  function shiftAnchorBy(days) {
    const anchor = getPreviewAnchor();
    anchor.setDate(anchor.getDate() + days);
    setPreviewAnchor(anchor);
    return getPreviewAnchor();
  }

  function getStatus(bookings = []) {
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return 'available';
    }
    const hasActive = bookings.some((booking) => (booking.status || '').toLowerCase() === 'active');
    if (hasActive) {
      return 'busy';
    }
    const hasPending = bookings.some((booking) => (booking.status || '').toLowerCase() === 'pending');
    if (hasPending) {
      return 'pending';
    }
    return 'available';
  }

  function formatMonthLabel(date) {
    return date.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '');
  }

  function formatWeekdayLabel(date) {
    return date.toLocaleDateString('pl-PL', { weekday: 'short' }).replace('.', '');
  }

  function updateMonthHeading(date) {
    const monthEl = $('#availabilityPreviewMonth');
    if (!monthEl) {
      return;
    }
    let base = null;
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      base = date;
    } else if (state.currentDate instanceof Date && !Number.isNaN(state.currentDate.getTime())) {
      base = state.currentDate;
    } else {
      base = new Date();
    }
    monthEl.textContent = base
      .toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
      .replace('.', '');
  }

  function ensureContainerMessage(container, message) {
    if (container) {
      container.innerHTML = `<p class="text-xs text-slate-500">${message}</p>`;
    }
  }

  function createNavButton(direction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `availability-preview-nav availability-preview-nav--${direction}`;
    const label =
      direction === 'prev' ? 'Pokaż wcześniejsze terminy' : 'Pokaż kolejne terminy';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = direction === 'prev' ? '<span aria-hidden="true">◀</span>' : '<span aria-hidden="true">▶</span>';
    button.addEventListener('click', () => {
      const delta = direction === 'prev' ? -PREVIEW_STEP : PREVIEW_STEP;
      const nextAnchor = shiftAnchorBy(delta);
      void render({ anchorDate: nextAnchor });
    });
    return button;
  }

  function highlightActiveTile(container) {
    if (!container) {
      return;
    }
    const activeDate = state.currentDate instanceof Date ? ymd(state.currentDate) : null;
    container.querySelectorAll('[data-preview-date]').forEach((node) => {
      if (!activeDate) {
        node.classList.remove('availability-tile--active');
        return;
      }
      if (node.dataset.previewDate === activeDate) {
        node.classList.add('availability-tile--active');
      } else {
        node.classList.remove('availability-tile--active');
      }
    });
  }

  async function render({ anchorDate } = {}) {
    const container = $('#availabilityPreviewGrid');
    if (!container) {
      return;
    }
    const baseDate = normalizeDate(anchorDate) || getPreviewAnchor();
    setPreviewAnchor(baseDate);
    updateMonthHeading(baseDate);
    if (!currentFacilityId) {
      ensureContainerMessage(container, 'Wybierz obiekt, aby zobaczyć dostępność.');
      return;
    }
    if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) {
      ensureContainerMessage(container, 'Brak danych o dacie.');
      return;
    }
    container.innerHTML = '';
    const loadingMessage = document.createElement('p');
    loadingMessage.className = 'text-xs text-slate-500';
    loadingMessage.textContent = 'Ładowanie dostępności…';
    container.appendChild(loadingMessage);
    const dates = Array.from({ length: PREVIEW_DAYS }, (_, index) => {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + index);
      return d;
    });

    const sequence = ++renderSeq;
    updateMonthHeading(baseDate);

    try {
      const facilityId = currentFacilityId;
      const results = await Promise.all(
        dates.map(async (date) => {
          const bookings = await dayView.fetchBookingsForDay(facilityId, date);
          return { date, bookings };
        }),
      );
      if (sequence !== renderSeq) {
        return;
      }
      container.innerHTML = '';
      container.appendChild(createNavButton('prev'));
      results.forEach(({ date, bookings }) => {
        const status = getStatus(bookings);
        const meta = STATUS_META[status] || STATUS_META.available;
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = meta.className;
        tile.dataset.previewDate = ymd(date);
        tile.setAttribute('aria-label', `${date.toLocaleDateString('pl-PL')} – ${meta.label}`);
        tile.title = meta.label;
        tile.innerHTML = `
          <span class="availability-tile__weekday">${formatWeekdayLabel(date)}</span>
          <span class="availability-tile__badge">${date.getDate()}</span>
          <span class="availability-tile__month">${formatMonthLabel(date)}</span>
        `;
        tile.addEventListener('click', () => {
          state.currentDate = new Date(date);
          dayView.setDayPickerFromCurrent();
          void dayView.renderDay();
        });
        container.appendChild(tile);
      });
      container.appendChild(createNavButton('next'));
      highlightActiveTile(container);
      refreshLayoutAlignment();
    } catch (error) {
      console.warn('Nie udało się wczytać podglądu dostępności.', error);
      ensureContainerMessage(container, 'Nie udało się wczytać dostępności. Spróbuj ponownie.');
    }
  }

  function init() {
    const container = $('#availabilityPreviewGrid');
    if (container) {
      ensureContainerMessage(container, 'Wybierz obiekt, aby zobaczyć dostępność.');
    }
    updateMonthHeading(state.currentDate);
    if (typeof dayView.onDateChange === 'function') {
      unsubscribeDateChange = dayView.onDateChange((date) => {
        const normalized = normalizeDate(date);
        if (!normalized) {
          return;
        }
        const anchor = getPreviewAnchor();
        const rangeStart = new Date(anchor);
        const rangeEnd = new Date(anchor);
        rangeEnd.setDate(rangeEnd.getDate() + PREVIEW_DAYS - 1);
        if (normalized < rangeStart || normalized > rangeEnd) {
          let newStart = new Date(rangeStart);
          let newEnd = new Date(rangeEnd);
          while (normalized < newStart) {
            newStart.setDate(newStart.getDate() - PREVIEW_STEP);
            newEnd.setDate(newEnd.getDate() - PREVIEW_STEP);
          }
          while (normalized > newEnd) {
            newStart.setDate(newStart.getDate() + PREVIEW_STEP);
            newEnd.setDate(newEnd.getDate() + PREVIEW_STEP);
          }
          setPreviewAnchor(newStart);
          void render({ anchorDate: getPreviewAnchor() });
          return;
        }
        highlightActiveTile($('#availabilityPreviewGrid'));
        refreshLayoutAlignment();
      });
    }
  }

  function setFacility(facility) {
    currentFacilityId = facility ? facility.id || facility : null;
    renderSeq += 1; // reset pending renders
    setPreviewAnchor(state.currentDate || new Date());
    void render();
  }

  function refresh(options) {
    return render(options);
  }

  function destroy() {
    if (typeof unsubscribeDateChange === 'function') {
      unsubscribeDateChange();
      unsubscribeDateChange = null;
    }
    previewAnchorDate = null;
  }

  return {
    init,
    setFacility,
    refresh,
    destroy,
  };
}
