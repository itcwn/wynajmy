import { requireCaretakerSession } from '../caretakers/session.js';
import { getMyFacilitiesClient, loadMyFacilityIds } from '../caretakers/myFacilities.js';
import { escapeHtml, formatDate, formatTime } from '../utils/format.js';

const sectionEl = document.getElementById('caretakerBookingsSection');
const listEl = document.getElementById('caretakerBookingsList');
const messageEl = document.getElementById('caretakerBookingsMessage');
const refreshBtn = document.getElementById('caretakerBookingsRefresh');

const COMMENT_COLUMN_CANDIDATES = [
  'decision_comment',
  'caretaker_comment',
  'response_comment',
  'manager_comment',
  'admin_comment',
  'notes_admin',
];

const DECISION_STATUS_MAP = {
  approve: { statuses: ['active'], label: 'zatwierdzono' },
  reject: { statuses: ['cancelled', 'rejected', 'declined'], label: 'odrzucono' },
};

const state = {
  supabase: null,
  baseSupabase: null,
  session: null,
  bookings: [],
  facilitiesById: new Map(),
  isLoading: false,
  loadSeq: 0,
  preferredCommentColumn: null,
};

function setTone(element, tone) {
  if (!element) {
    return;
  }
  element.classList.remove('text-red-600', 'text-emerald-600', 'text-gray-500');
  if (!tone) {
    return;
  }
  if (tone === 'error') {
    element.classList.add('text-red-600');
  } else if (tone === 'success') {
    element.classList.add('text-emerald-600');
  } else {
    element.classList.add('text-gray-500');
  }
}

function setMessage(text, tone = 'info') {
  if (!messageEl) {
    return;
  }
  messageEl.textContent = text || '';
  setTone(messageEl, text ? tone : null);
}

function setFormStatus(form, text, tone = 'info') {
  if (!form) {
    return;
  }
  const statusEl = form.querySelector('[data-role="form-status"]');
  if (!statusEl) {
    return;
  }
  statusEl.textContent = text || '';
  setTone(statusEl, text ? tone : null);
}

function describeFacility(facility) {
  if (!facility || typeof facility !== 'object') {
    return { name: '', location: '' };
  }
  const name = facility.name || '';
  const locationParts = [];
  if (facility.postal_code || facility.city) {
    locationParts.push([facility.postal_code, facility.city].filter(Boolean).join(' '));
  }
  if (facility.address_line1 || facility.address_line2) {
    locationParts.push([facility.address_line1, facility.address_line2].filter(Boolean).join(', '));
  }
  return {
    name,
    location: locationParts.filter(Boolean).join(' · '),
  };
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

function formatDateTime(value) {
  const date = formatDate(value);
  const time = formatTime(value);
  if (date && time) {
    return `${date}, ${time}`;
  }
  return date || time || '';
}

function renderBookings({ loading = false, emptyMessage } = {}) {
  if (!listEl) {
    return;
  }
  if (loading) {
    listEl.innerHTML = '<p class="text-sm text-gray-500">Ładowanie zgłoszeń...</p>';
    return;
  }
  if (!state.bookings.length) {
    const message = emptyMessage || 'Brak rezerwacji oczekujących na decyzję.';
    listEl.innerHTML = `<p class="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">${escapeHtml(
      message,
    )}</p>`;
    return;
  }
  const cards = state.bookings.map((booking) => createBookingCard(booking)).join('');
  listEl.innerHTML = cards;
  attachFormHandlers();
}

function createBookingCard(booking) {
  const facility =
    booking.facility || state.facilitiesById.get(String(booking.facility_id)) || null;
  const { name: facilityNameRaw, location } = describeFacility(facility);
  const facilityName = facilityNameRaw || `Świetlica ID ${booking.facility_id}`;
  const timeRange = formatDateTimeRange(booking.start_time, booking.end_time);
  const submittedAt = formatDateTime(booking.created_at);
  const renterName = booking.renter_name ? escapeHtml(booking.renter_name) : '—';
  const renterEmail = booking.renter_email
    ? `<a class="text-blue-600 hover:underline" href="mailto:${escapeHtml(booking.renter_email)}">${escapeHtml(
        booking.renter_email,
      )}</a>`
    : '';
  const notesBlock = booking.notes
    ? `
      <div class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p class="font-medium">Uwagi zgłaszającego:</p>
        <p>${escapeHtml(booking.notes)}</p>
      </div>
    `
    : '';
  const commentFieldId = `booking-comment-${String(booking.id)}`;
  const locationLine = location ? `<p class="text-sm text-gray-500">${escapeHtml(location)}</p>` : '';
  const submittedBlock = submittedAt
    ? `
        <div>
          <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Zgłoszenie</dt>
          <dd class="text-sm text-gray-900">${escapeHtml(submittedAt)}</dd>
        </div>
      `
    : '';
  const renterBlock = `
    <div>
      <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Zgłaszający</dt>
      <dd class="text-sm text-gray-900 space-y-0.5">
        <span class="block font-medium">${renterName}</span>
        ${renterEmail ? `<span class="block text-xs text-gray-500">${renterEmail}</span>` : ''}
      </dd>
    </div>
  `;
  const titleBlock = `
    <div>
      <dt class="text-xs font-medium uppercase tracking-wide text-gray-500">Tytuł rezerwacji</dt>
      <dd class="text-sm text-gray-900">${escapeHtml(booking.title || 'Rezerwacja')}</dd>
    </div>
  `;

  return `
    <article class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4" data-booking-id="${escapeHtml(
      String(booking.id),
    )}">
      <header class="space-y-2">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 class="text-lg font-semibold text-gray-800">${escapeHtml(facilityName)}</h3>
            ${locationLine}
          </div>
          <span class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
            ⏳ oczekuje
          </span>
        </div>
        ${timeRange ? `<p class="text-sm text-gray-700">${escapeHtml(timeRange)}</p>` : ''}
        <p class="text-xs text-gray-400">ID rezerwacji: ${escapeHtml(String(booking.id))}</p>
      </header>
      <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        ${titleBlock}
        ${renterBlock}
        ${submittedBlock}
      </dl>
      ${notesBlock}
      <form class="space-y-3" data-role="decision-form" data-booking-id="${escapeHtml(String(booking.id))}">
        <fieldset class="space-y-2">
          <legend class="text-sm font-medium text-gray-700">Wybierz decyzję</legend>
          <div class="flex flex-wrap gap-4 text-sm">
            <label class="inline-flex items-center gap-2">
              <input type="radio" name="decision" value="approve" class="accent-emerald-600" />
              <span>Zatwierdź rezerwację</span>
            </label>
            <label class="inline-flex items-center gap-2">
              <input type="radio" name="decision" value="reject" class="accent-red-600" />
              <span>Odrzuć wniosek</span>
            </label>
          </div>
        </fieldset>
        <div>
          <label class="block text-sm font-medium text-gray-700" for="${escapeHtml(commentFieldId)}">
            Komentarz dla zgłaszającego (opcjonalnie)
          </label>
          <textarea
            id="${escapeHtml(commentFieldId)}"
            name="comment"
            rows="3"
            class="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Dodaj uzasadnienie decyzji lub informacje organizacyjne"
          ></textarea>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Zapisz decyzję
          </button>
          <span data-role="form-status" class="text-sm text-gray-500"></span>
        </div>
      </form>
    </article>
  `;
}

function attachFormHandlers() {
  if (!listEl) {
    return;
  }
  listEl.querySelectorAll('form[data-role="decision-form"]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void handleDecisionSubmit(form);
    });
  });
}

function disableForm(form, disabled) {
  if (!form) {
    return;
  }
  form.querySelectorAll('input, textarea, button').forEach((element) => {
    element.disabled = disabled;
  });
}

async function loadFacilitiesDetails(facilityIds) {
  const unique = Array.from(new Set(facilityIds)).filter(Boolean);
  if (!unique.length) {
    state.facilitiesById = new Map();
    return state.facilitiesById;
  }
  const { data, error } = await state.supabase
    .from('facilities')
    .select('id, name, city, postal_code, address_line1, address_line2')
    .in('id', unique);
  if (error) {
    throw error;
  }
  const map = new Map();
  (data || []).forEach((facility) => {
    map.set(String(facility.id), facility);
  });
  state.facilitiesById = map;
  return map;
}

async function fetchPendingBookings(facilityIds) {
  const unique = Array.from(new Set(facilityIds)).filter(Boolean);
  if (!unique.length) {
    return [];
  }
  const { data, error } = await state.supabase
    .from('bookings')
    .select(
      `id, facility_id, title, renter_name, renter_email, notes, start_time, end_time, status, created_at,
       facility:facility_id (id, name, city, postal_code, address_line1, address_line2)`
    )
    .eq('status', 'pending')
    .in('facility_id', unique)
    .order('start_time', { ascending: true });
  if (error) {
    throw error;
  }
  return (data || []).map((row) => ({
    ...row,
    facility: row.facility || state.facilitiesById.get(String(row.facility_id)) || null,
  }));
}

function getCommentColumns() {
  if (!state.preferredCommentColumn) {
    return COMMENT_COLUMN_CANDIDATES;
  }
  const rest = COMMENT_COLUMN_CANDIDATES.filter((column) => column !== state.preferredCommentColumn);
  return [state.preferredCommentColumn, ...rest];
}

function isMissingColumnError(error) {
  if (!error) {
    return false;
  }
  if (error.code === '42703') {
    return true;
  }
  if (!error.code && error.message && /column/i.test(error.message)) {
    return true;
  }
  return false;
}

function isStatusConstraintError(error) {
  if (!error) {
    return false;
  }
  if (error.code === '23514' || error.code === '22P02') {
    return true;
  }
  if (error.message && /status|constraint|enum/i.test(error.message)) {
    return true;
  }
  return false;
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

async function attemptDecisionUpdate(bookingId, status, column, commentValue) {
  const payload = { status };
  if (column) {
    payload[column] = commentValue ?? null;
  }
  const { error } = await state.supabase.from('bookings').update(payload).eq('id', bookingId);
  if (error) {
    return { success: false, error };
  }
  return { success: true };
}

async function persistDecision({ bookingId, statuses, comment }) {
  if (!state.supabase) {
    throw new Error('Brak połączenia z bazą danych.');
  }
  const statusCandidates = Array.isArray(statuses) && statuses.length ? statuses : ['active'];
  const trimmedComment = comment?.trim() || '';
  let lastStatusError = null;

  for (const status of statusCandidates) {
    if (trimmedComment) {
      let columnMissing = false;
      let statusRejected = false;
      for (const column of getCommentColumns()) {
        const attempt = await attemptDecisionUpdate(bookingId, status, column, trimmedComment);
        if (attempt.success) {
          state.preferredCommentColumn = column;
          return { commentSaved: true, column, appliedStatus: status };
        }
        if (isMissingColumnError(attempt.error)) {
          columnMissing = true;
          continue;
        }
        if (isStatusConstraintError(attempt.error)) {
          lastStatusError = attempt.error;
          statusRejected = true;
          break;
        }
        throw attempt.error;
      }
      if (statusRejected) {
        continue;
      }
      if (columnMissing) {
        const attempt = await attemptDecisionUpdate(bookingId, status, null, null);
        if (attempt.success) {
          return { commentSaved: false, column: null, appliedStatus: status };
        }
        if (isStatusConstraintError(attempt.error)) {
          lastStatusError = attempt.error;
          continue;
        }
        throw attempt.error;
      }
    } else {
      const attempt = await attemptDecisionUpdate(bookingId, status, null, null);
      if (attempt.success) {
        return { commentSaved: false, column: null, appliedStatus: status };
      }
      if (isStatusConstraintError(attempt.error)) {
        lastStatusError = attempt.error;
        continue;
      }
      throw attempt.error;
    }
  }

  if (lastStatusError) {
    throw lastStatusError;
  }
  throw new Error('Nie udało się zapisać decyzji dla wskazanej rezerwacji.');
}

async function refreshBookings({ showLoading = false, forceFacilitiesRefresh = false } = {}) {
  if (!state.supabase || !state.session) {
    return;
  }
  state.loadSeq += 1;
  const seq = state.loadSeq;
  state.isLoading = true;
  if (refreshBtn) {
    refreshBtn.disabled = true;
  }
  if (showLoading) {
    renderBookings({ loading: true });
    setMessage('Ładowanie listy rezerwacji...', 'info');
  }
  try {
    const facilityIds = await loadMyFacilityIds({ forceRefresh: forceFacilitiesRefresh });
    const facilitiesClient = getMyFacilitiesClient();
    if (facilitiesClient && facilitiesClient !== state.supabase) {
      state.supabase = facilitiesClient;
    }
    if (seq !== state.loadSeq) {
      return;
    }
    if (!facilityIds.length) {
      state.bookings = [];
      renderBookings({ emptyMessage: 'Nie przypisano Ci żadnych świetlic.' });
      setMessage('Nie przypisano Ci żadnych świetlic lub brak oczekujących zgłoszeń.', 'info');
      return;
    }
    await loadFacilitiesDetails(facilityIds);
    if (seq !== state.loadSeq) {
      return;
    }
    const bookings = await fetchPendingBookings(facilityIds);
    if (seq !== state.loadSeq) {
      return;
    }
    state.bookings = bookings;
    renderBookings();
    if (!bookings.length) {
      setMessage('Brak rezerwacji oczekujących na decyzję.', 'info');
    } else {
      const countText = bookings.length === 1 ? 'Znaleziono 1 oczekujące zgłoszenie.' : `Znaleziono ${bookings.length} oczekujące zgłoszenia.`;
      setMessage(countText, 'success');
    }
  } catch (error) {
    console.error('Błąd ładowania rezerwacji:', error);
    state.bookings = [];
    const permissionIssue = isPermissionError(error);
    const emptyMessage = permissionIssue
      ? 'Brak uprawnień do pobrania rezerwacji przypisanych do Twoich świetlic.'
      : 'Wystąpił błąd podczas pobierania rezerwacji.';
    renderBookings({ emptyMessage });
    if (permissionIssue) {
      setMessage(
        'Nie masz uprawnień do odczytu przypisań świetlic. Skontaktuj się z administratorem systemu, aby potwierdzić dostęp.',
        'error',
      );
    } else {
      setMessage(error?.message || 'Nie udało się pobrać rezerwacji.', 'error');
    }
  } finally {
    if (seq === state.loadSeq) {
      if (refreshBtn) {
        refreshBtn.disabled = false;
      }
      state.isLoading = false;
    }
  }
}

async function handleDecisionSubmit(form) {
  const bookingId = form?.dataset?.bookingId;
  if (!bookingId) {
    setFormStatus(form, 'Brak identyfikatora rezerwacji.', 'error');
    return;
  }
  if (!state.supabase || !state.session) {
    setFormStatus(form, 'Brak połączenia z bazą danych.', 'error');
    return;
  }
  const decisionInput = form.querySelector('input[name="decision"]:checked');
  if (!decisionInput) {
    setFormStatus(form, 'Wybierz decyzję.', 'error');
    return;
  }
  const mapping = DECISION_STATUS_MAP[decisionInput.value];
  if (!mapping) {
    setFormStatus(form, 'Nieobsługiwany typ decyzji.', 'error');
    return;
  }
  const comment = form.querySelector('textarea[name="comment"]')?.value || '';
  disableForm(form, true);
  setFormStatus(form, 'Zapisywanie decyzji...', 'info');
  const booking = state.bookings.find((item) => String(item.id) === String(bookingId));
  const facility = booking?.facility || state.facilitiesById.get(String(booking?.facility_id)) || null;
  const { name: facilityName } = describeFacility(facility);
  try {
    const result = await persistDecision({ bookingId, statuses: mapping.statuses, comment });
    const baseMessage = facilityName
      ? `Pomyślnie ${mapping.label} zgłoszenie dla obiektu ${facilityName}.`
      : `Pomyślnie ${mapping.label} zgłoszenie.`;
    const commentNote = comment && !result.commentSaved
      ? ' Komentarz nie został zapisany (brak zgodnej kolumny w tabeli bookings).'
      : '';
    setMessage(`${baseMessage}${commentNote}`, 'success');
    setFormStatus(form, 'Decyzja zapisana. Odświeżanie listy...', 'success');
    await refreshBookings({ showLoading: true });
  } catch (error) {
    console.error('Błąd zapisu decyzji:', error);
    setFormStatus(form, error?.message || 'Nie udało się zapisać decyzji.', 'error');
    setMessage('Nie udało się zapisać decyzji. Spróbuj ponownie później.', 'error');
  } finally {
    disableForm(form, false);
  }
}

async function bootstrap() {
  if (!sectionEl || !listEl) {
    return;
  }
  const session = await requireCaretakerSession({ redirectTo: './caretakerLogin.html' });
  if (!session) {
    return;
  }
  const supabase = session?.supabase || session?.baseSupabase || null;
  if (!supabase) {
    setMessage('Brak konfiguracji Supabase lub identyfikatora opiekuna. Uzupełnij dane połączenia.', 'error');
    return;
  }
  state.supabase = supabase;
  state.baseSupabase = session?.baseSupabase || null;
  state.session = session;
  setMessage('Inicjalizacja modułu rezerwacji...', 'info');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (state.isLoading) {
        setMessage('Trwa odświeżanie listy rezerwacji...', 'info');
        return;
      }
      void refreshBookings({ showLoading: true, forceFacilitiesRefresh: true });
    });
  }
  await refreshBookings({ showLoading: true, forceFacilitiesRefresh: true });
}

void bootstrap();
