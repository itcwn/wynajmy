import { refreshLayoutAlignment } from '../ui/layout.js';

const PREVIEW_DAYS = 14;

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
  let unsubscribeDateChange = null;

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

  function ensureContainerMessage(container, message) {
    if (container) {
      container.innerHTML = `<p class="text-xs text-slate-500">${message}</p>`;
    }
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
    if (!currentFacilityId) {
      ensureContainerMessage(container, 'Wybierz świetlicę, aby zobaczyć dostępność.');
      return;
    }
    const baseDate = anchorDate instanceof Date ? new Date(anchorDate) : new Date(state.currentDate || new Date());
    if (Number.isNaN(baseDate.getTime())) {
      ensureContainerMessage(container, 'Brak danych o dacie.');
      return;
    }
    baseDate.setHours(0, 0, 0, 0);
    const dates = Array.from({ length: PREVIEW_DAYS }, (_, index) => {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() + index);
      return d;
    });

    const sequence = ++renderSeq;
    ensureContainerMessage(container, 'Ładowanie dostępności…');

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
          <span class="availability-tile__badge">${date.getDate()}</span>
          <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">${formatMonthLabel(date)}</span>
        `;
        tile.addEventListener('click', () => {
          state.currentDate = new Date(date);
          dayView.setDayPickerFromCurrent();
          void dayView.renderDay();
        });
        container.appendChild(tile);
      });
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
      ensureContainerMessage(container, 'Wybierz świetlicę, aby zobaczyć dostępność.');
    }
    if (typeof dayView.onDateChange === 'function') {
      unsubscribeDateChange = dayView.onDateChange((date) => {
        void render({ anchorDate: date });
      });
    }
  }

  function setFacility(facility) {
    currentFacilityId = facility ? facility.id || facility : null;
    renderSeq += 1; // reset pending renders
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
  }

  return {
    init,
    setFacility,
    refresh,
    destroy,
  };
}
