import { loadMyFacilityIds, getMyFacilitiesClient } from '../caretakers/myFacilities.js';
import { escapeHtml, formatDate, formatTime } from '../utils/format.js';

const openModalButton = document.getElementById('openCaretakerBookingsModal');
const modalElement = document.getElementById('caretakerBookingsModal');
const modalCloseButtons = document.querySelectorAll('[data-caretaker-bookings-modal-close]');
const modalStatusElement = document.getElementById('caretakerBookingsModalStatus');
const modalListElement = document.getElementById('caretakerBookingsModalList');

const STATUS_STYLES = {
  pending: {
    label: 'Oczekuje na decyzję',
    classes: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: '⏳',
  },
  active: {
    label: 'Potwierdzona',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: '✅',
  },
  cancelled: {
    label: 'Anulowana',
    classes: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: '❌',
  },
  rejected: {
    label: 'Odrzucona',
    classes: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: '🚫',
  },
  declined: {
    label: 'Odrzucona',
    classes: 'border-rose-200 bg-rose-50 text-rose-700',
    icon: '🚫',
  },
  completed: {
    label: 'Zakończona',
    classes: 'border-blue-200 bg-blue-50 text-blue-700',
    icon: '🏁',
  },
};

const state = {
  supabase: null,
  isLoading: false,
  loadSeq: 0,
  lastFocused: null,
  escapeListenerAttached: false,
};

function describeFacility(facility) {
  if (!facility || typeof facility !== 'object') {
    return { name: 'Świetlica', location: '' };
  }
  const name = facility.name || 'Świetlica';
  const locationParts = [];
  const cityLine = [facility.postal_code, facility.city].filter(Boolean).join(' ');
  if (cityLine) {
    locationParts.push(cityLine);
  }
  const addressLine = [facility.address_line1, facility.address_line2].filter(Boolean).join(', ');
  if (addressLine) {
    locationParts.push(addressLine);
  }
  return { name, location: locationParts.join(' · ') };
}

function formatDateTimeRange(startValue, endValue) {
  const startDate = formatDate(startValue);
  const startTime = formatTime(startValue);
  const endDate = formatDate(endValue);
  const endTime = formatTime(endValue);
  if (!startDate && !startTime) {
    return '';
  }
  if (!endDate && !endTime) {
    return `${startDate || ''}${startTime ? `, ${startTime}` : ''}`.trim();
  }
  if (startDate && endDate && startDate === endDate) {
    return `${startDate}${startTime ? `, ${startTime}` : ''}${endTime ? ` – ${endTime}` : ''}`;
  }
  const left = `${startDate || ''}${startTime ? `, ${startTime}` : ''}`.trim();
  const right = `${endDate || ''}${endTime ? `, ${endTime}` : ''}`.trim();
  return `${left} → ${right}`;
}

function setStatus(text, tone = 'info') {
  if (!modalStatusElement) {
    return;
  }
  modalStatusElement.textContent = text || '';
  modalStatusElement.classList.remove('text-gray-500', 'text-red-600', 'text-emerald-600');
  if (!text) {
    return;
  }
  if (tone === 'error') {
    modalStatusElement.classList.add('text-red-600');
  } else if (tone === 'success') {
    modalStatusElement.classList.add('text-emerald-600');
  } else {
    modalStatusElement.classList.add('text-gray-500');
  }
}

function renderLoading() {
  if (!modalListElement) {
    return;
  }
  modalListElement.innerHTML = '<p class="text-sm text-gray-500">Ładowanie listy rezerwacji...</p>';
}

function renderEmpty(message) {
  if (!modalListElement) {
    return;
  }
  modalListElement.innerHTML = `<p class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">${escapeHtml(
    message,
  )}</p>`;
}

function buildStatusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  const definition = STATUS_STYLES[normalized] || {
    label: normalized ? `Status: ${normalized}` : 'Nieznany status',
    classes: 'border-gray-200 bg-gray-100 text-gray-600',
    icon: 'ℹ️',
  };
  return `
    <span class="inline-flex items-center gap-1 rounded-full border ${definition.classes} px-3 py-1 text-xs font-semibold">
      ${definition.icon} ${escapeHtml(definition.label)}
    </span>
  `;
}

function renderBookings(bookings) {
  if (!modalListElement) {
    return;
  }
  if (!bookings.length) {
    renderEmpty('Brak rezerwacji dla przypisanych obiektów.');
    return;
  }
  const items = bookings
    .map((booking) => {
      const { name: facilityName, location } = describeFacility(booking.facility);
      const timeRange = formatDateTimeRange(booking.start_time, booking.end_time);
      const renterName = booking.renter_name ? escapeHtml(booking.renter_name) : '—';
      const renterEmail = booking.renter_email
        ? `<a class="text-blue-600 hover:underline" href="mailto:${escapeHtml(booking.renter_email)}">${escapeHtml(
            booking.renter_email,
          )}</a>`
        : '';
      const statusBadge = buildStatusBadge(booking.status);
      const locationLine = location ? `<p class="text-xs text-gray-500">${escapeHtml(location)}</p>` : '';
      const submittedBlock = booking.created_at
        ? `<div><dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Zgłoszenie</dt><dd class="text-sm text-gray-900">${escapeHtml(
            formatDate(booking.created_at),
          )}${formatTime(booking.created_at) ? `, ${escapeHtml(formatTime(booking.created_at))}` : ''}</dd></div>`
        : '';
      return `
        <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <header class="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 class="text-base font-semibold text-gray-800">${escapeHtml(facilityName)}</h3>
              ${locationLine}
            </div>
            ${statusBadge}
          </header>
          ${booking.title ? `<p class="text-sm font-medium text-gray-700">${escapeHtml(booking.title)}</p>` : ''}
          ${timeRange ? `<p class="text-sm text-gray-700">📅 ${escapeHtml(timeRange)}</p>` : ''}
          <dl class="grid gap-4 text-sm text-gray-700 md:grid-cols-2">
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Zgłaszający</dt>
              <dd class="space-y-0.5">
                <span class="block text-sm text-gray-900">${renterName}</span>
                ${renterEmail ? `<span class="block text-xs text-gray-500">${renterEmail}</span>` : ''}
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">ID rezerwacji</dt>
              <dd class="text-sm text-gray-900">${escapeHtml(String(booking.id))}</dd>
            </div>
            ${submittedBlock}
          </dl>
        </article>
      `;
    })
    .join('');
  modalListElement.innerHTML = items;
}

function isPermissionError(error) {
  if (!error) {
    return false;
  }
  const code = String(error.code || '').toUpperCase();
  if (code === '42501' || code === 'PGRST301') {
    return true;
  }
  if (typeof error.message === 'string' && /permission denied/i.test(error.message)) {
    return true;
  }
  return false;
}

async function loadBookings({ forceRefresh = false } = {}) {
  if (!modalElement || state.isLoading) {
    return;
  }
  state.isLoading = true;
  state.loadSeq += 1;
  const seq = state.loadSeq;
  renderLoading();
  setStatus('Ładowanie listy rezerwacji...', 'info');
  try {
    const facilityIds = await loadMyFacilityIds({ forceRefresh });
    if (seq !== state.loadSeq) {
      return;
    }
    if (!facilityIds.length) {
      renderEmpty('Nie przypisano Ci żadnych obiektów.');
      setStatus('Nie przypisano Ci żadnych obiektów.', 'info');
      return;
    }
    const client = getMyFacilitiesClient() || state.supabase;
    if (!client) {
      renderEmpty('Brak konfiguracji połączenia z bazą danych.');
      setStatus('Brak konfiguracji połączenia z bazą danych.', 'error');
      return;
    }
    const { data, error } = await client
      .from('bookings')
      .select(
        `id, facility_id, title, renter_name, renter_email, start_time, end_time, status, created_at,
         facility:facility_id (id, name, city, postal_code, address_line1, address_line2)`
      )
      .in('facility_id', facilityIds)
      .order('start_time', { ascending: false });
    if (error) {
      throw error;
    }
    if (seq !== state.loadSeq) {
      return;
    }
    const bookings = (data || []).map((row) => ({
      ...row,
      facility: row.facility || null,
    }));
    renderBookings(bookings);
    if (!bookings.length) {
      setStatus('Brak rezerwacji dla przypisanych obiektów.', 'info');
    } else {
      const countText =
        bookings.length === 1
          ? 'Znaleziono 1 rezerwację przypisaną do Twoich obiektów.'
          : `Znaleziono ${bookings.length} rezerwacje przypisane do Twoich obiektów.`;
      setStatus(countText, 'success');
    }
  } catch (error) {
    console.error('Błąd ładowania rezerwacji opiekuna:', error);
    const permissionIssue = isPermissionError(error);
    if (permissionIssue) {
      renderEmpty('Brak uprawnień do odczytu rezerwacji. Skontaktuj się z administratorem.');
      setStatus('Brak uprawnień do odczytu rezerwacji.', 'error');
    } else {
      renderEmpty('Nie udało się pobrać rezerwacji. Spróbuj ponownie później.');
      setStatus(error?.message || 'Nie udało się pobrać rezerwacji.', 'error');
    }
  } finally {
    if (seq === state.loadSeq) {
      state.isLoading = false;
    }
  }
}

function trapBodyScroll(enable) {
  const classList = document.body?.classList;
  if (!classList) {
    return;
  }
  if (enable) {
    classList.add('overflow-hidden');
  } else {
    classList.remove('overflow-hidden');
  }
}

function isModalOpen() {
  return modalElement && !modalElement.classList.contains('hidden');
}

function attachEscapeListener() {
  if (state.escapeListenerAttached) {
    return;
  }
  document.addEventListener('keydown', handleEscape);
  state.escapeListenerAttached = true;
}

function detachEscapeListener() {
  if (!state.escapeListenerAttached) {
    return;
  }
  document.removeEventListener('keydown', handleEscape);
  state.escapeListenerAttached = false;
}

function openModal() {
  if (!modalElement || isModalOpen()) {
    return;
  }
  state.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modalElement.classList.remove('hidden');
  modalElement.classList.add('flex');
  trapBodyScroll(true);
  const focusTarget = modalElement.querySelector('[data-caretaker-bookings-modal-close]');
  if (focusTarget instanceof HTMLElement) {
    window.setTimeout(() => {
      focusTarget.focus();
    }, 50);
  }
  attachEscapeListener();
  void loadBookings({ forceRefresh: true });
}

function closeModal({ restoreFocus = true } = {}) {
  if (!modalElement || !isModalOpen()) {
    return;
  }
  modalElement.classList.add('hidden');
  modalElement.classList.remove('flex');
  trapBodyScroll(false);
  detachEscapeListener();
  if (restoreFocus && state.lastFocused && typeof state.lastFocused.focus === 'function') {
    state.lastFocused.focus();
  }
  state.lastFocused = null;
}

function handleEscape(event) {
  if (event.key !== 'Escape' || !isModalOpen()) {
    return;
  }
  event.preventDefault();
  closeModal({ restoreFocus: true });
}

function setupModalInteractions() {
  if (!modalElement) {
    return;
  }
  modalElement.addEventListener('click', (event) => {
    if (event.target === modalElement) {
      closeModal({ restoreFocus: true });
    }
  });
  modalCloseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeModal({ restoreFocus: true });
    });
  });
}

export function initCaretakerBookingsModal({ session } = {}) {
  if (!openModalButton || !modalElement || !modalListElement) {
    return;
  }
  state.supabase = session?.supabase || session?.baseSupabase || null;
  setupModalInteractions();
  openModalButton.addEventListener('click', () => {
    openModal();
  });
}

