import { requireCaretakerSession, getCaretakerDisplayName } from '../caretakers/session.js';
import { loadMyFacilities } from '../caretakers/myFacilities.js';

const openModalBtn = document.getElementById('openBlockDatesModal');
const modal = document.getElementById('blockDatesModal');
const form = document.getElementById('blockDatesForm');
const facilitySelect = document.getElementById('blockDatesFacility');
const rowsContainer = document.getElementById('blockDatesRows');
const addRowBtn = document.getElementById('blockDatesAddRow');
const recurringCheckbox = document.getElementById('blockDatesRecurring');
const recurringYearsInput = document.getElementById('blockDatesRecurringYears');
const statusElement = document.getElementById('blockDatesStatus');
const saveBtn = document.getElementById('blockDatesSaveButton');
const modalCloseButtons = document.querySelectorAll('[data-block-dates-modal-close]');

let session = null;
let supabaseClient = null;
let facilitiesCache = [];
let isSaving = false;
let lastFocusedBeforeModal = null;
let escapeListenerAttached = false;

function setStatus(text, tone = 'info') {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = text || '';
  statusElement.classList.remove('text-red-600', 'text-emerald-600', 'text-gray-500');
  if (!text) {
    return;
  }
  if (tone === 'error') {
    statusElement.classList.add('text-red-600');
  } else if (tone === 'success') {
    statusElement.classList.add('text-emerald-600');
  } else {
    statusElement.classList.add('text-gray-500');
  }
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isValidDate(year, month, day) {
  const testDate = new Date(Date.UTC(year, month - 1, day));
  return (
    testDate.getUTCFullYear() === year &&
    testDate.getUTCMonth() === month - 1 &&
    testDate.getUTCDate() === day
  );
}

function toIsoString(year, month, day, hour, minute, second) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0)).toISOString();
}

function parseDateValue(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
}

function generateRangesForDate(parts, extraYears) {
  const ranges = [];
  if (!parts) {
    return ranges;
  }
  const safeExtraYears = Math.max(0, extraYears || 0);
  for (let offset = 0; offset <= safeExtraYears; offset += 1) {
    const targetYear = parts.year + offset;
    let targetDay = parts.day;
    while (targetDay > 28 && !isValidDate(targetYear, parts.month, targetDay)) {
      targetDay -= 1;
    }
    if (targetDay < 1) {
      continue;
    }
    const startIso = toIsoString(targetYear, parts.month, targetDay, 0, 0, 0);
    const endIso = toIsoString(targetYear, parts.month, targetDay, 23, 59, 59);
    ranges.push({
      startIso,
      endIso,
      displayLabel: `${targetYear}-${pad2(parts.month)}-${pad2(targetDay)}`,
    });
  }
  return ranges;
}

function getCaretakerEmail(sessionLike) {
  return (
    sessionLike?.email ||
    sessionLike?.profile?.email ||
    sessionLike?.user?.email ||
    sessionLike?.login ||
    ''
  );
}

function getCaretakerPhone(sessionLike) {
  return sessionLike?.profile?.phone || sessionLike?.phone || null;
}

function trapBodyScroll(shouldTrap) {
  const bodyClassList = document.body?.classList;
  if (!bodyClassList) {
    return;
  }
  if (shouldTrap) {
    bodyClassList.add('overflow-hidden');
  } else {
    bodyClassList.remove('overflow-hidden');
  }
}

function isModalOpen() {
  return modal && !modal.classList.contains('hidden');
}

function closeModal({ restoreFocus = true } = {}) {
  if (!modal) {
    return;
  }
  modal.classList.add('hidden');
  trapBodyScroll(false);
  if (restoreFocus && lastFocusedBeforeModal) {
    lastFocusedBeforeModal.focus?.();
  }
  if (escapeListenerAttached) {
    document.removeEventListener('keydown', handleEscapeKey, true);
    escapeListenerAttached = false;
  }
}

function handleEscapeKey(event) {
  if (event.key === 'Escape' && isModalOpen()) {
    event.preventDefault();
    closeModal();
  }
}

function openModal() {
  if (!modal) {
    return;
  }
  lastFocusedBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.remove('hidden');
  trapBodyScroll(true);
  if (!escapeListenerAttached) {
    document.addEventListener('keydown', handleEscapeKey, true);
    escapeListenerAttached = true;
  }
  setStatus('');
  ensureAtLeastOneRow();
  if (facilitySelect && facilitySelect.value) {
    facilitySelect.focus();
  } else {
    facilitySelect?.focus();
  }
}

function renderFacilityOptions(selectedId = '') {
  if (!facilitySelect) {
    return;
  }
  const previousValue = selectedId || facilitySelect.value || '';
  facilitySelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = facilitiesCache.length
    ? 'Wybierz obiekt...'
    : 'Brak dostępnych obiektów';
  facilitySelect.appendChild(placeholder);
  facilitiesCache.forEach((facility) => {
    const option = document.createElement('option');
    option.value = facility.id;
    option.textContent = facility.name || 'Obiekt';
    if (facility.id === previousValue) {
      option.selected = true;
      placeholder.selected = false;
    }
    facilitySelect.appendChild(option);
  });
  if (!facilitiesCache.length) {
    facilitySelect.disabled = true;
  } else {
    facilitySelect.disabled = false;
    if (previousValue && facilitySelect.value !== previousValue) {
      facilitySelect.value = previousValue;
    }
  }
}

function createDateRow(value = '') {
  const row = document.createElement('div');
  row.className = 'flex flex-wrap items-end gap-3';

  const fieldWrapper = document.createElement('div');
  fieldWrapper.className = 'flex-1 min-w-[200px]';

  const label = document.createElement('label');
  label.className = 'block text-sm font-medium text-gray-700';
  label.textContent = 'Data';
  label.htmlFor = '';

  const input = document.createElement('input');
  input.type = 'date';
  input.required = true;
  input.value = value;
  input.className = 'mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-amber-500/40';

  fieldWrapper.appendChild(label);
  fieldWrapper.appendChild(input);

  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-2 pb-2';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring focus-visible:ring-red-400/60';
  removeBtn.textContent = 'Usuń';
  removeBtn.addEventListener('click', () => {
    removeDateRow(row);
  });

  actions.appendChild(removeBtn);

  row.appendChild(fieldWrapper);
  row.appendChild(actions);

  return row;
}

function addDateRow(value = '') {
  if (!rowsContainer) {
    return;
  }
  const row = createDateRow(value);
  rowsContainer.appendChild(row);
}

function ensureAtLeastOneRow() {
  if (!rowsContainer) {
    return;
  }
  if (!rowsContainer.children.length) {
    addDateRow();
  }
}

function resetRows() {
  if (!rowsContainer) {
    return;
  }
  rowsContainer.innerHTML = '';
  addDateRow();
}

function removeDateRow(row) {
  if (!rowsContainer || !row) {
    return;
  }
  if (rowsContainer.children.length <= 1) {
    const input = row.querySelector('input[type="date"]');
    if (input) {
      input.value = '';
    }
    return;
  }
  rowsContainer.removeChild(row);
}

function setSavingState(saving) {
  isSaving = saving;
  if (saveBtn) {
    if (saving) {
      if (!saveBtn.dataset.originalText) {
        saveBtn.dataset.originalText = saveBtn.textContent || '';
      }
      saveBtn.textContent = 'Zapisywanie...';
    } else if (saveBtn.dataset.originalText) {
      saveBtn.textContent = saveBtn.dataset.originalText;
      delete saveBtn.dataset.originalText;
    }
    saveBtn.disabled = saving;
  }
  if (openModalBtn) {
    openModalBtn.disabled = saving;
  }
}

async function loadFacilities() {
  try {
    const facilities = await loadMyFacilities({ columns: 'id,name', forceRefresh: true });
    facilitiesCache = Array.isArray(facilities) ? facilities.map((facility) => ({
      id: facility.id,
      name: facility.name,
    })) : [];
    renderFacilityOptions();
  } catch (error) {
    console.error('Nie udało się pobrać listy obiektów:', error);
    facilitiesCache = [];
    renderFacilityOptions();
    setStatus('Nie udało się pobrać listy obiektów.', 'error');
  }
}

async function checkOverlap(facilityId, startIso, endIso) {
  if (!supabaseClient) {
    return false;
  }
  const { data, error } = await supabaseClient
    .from('bookings')
    .select('id,status,start_time,end_time')
    .eq('facility_id', facilityId)
    .in('status', ['active', 'pending'])
    .lt('start_time', endIso)
    .gt('end_time', startIso);
  if (error) {
    console.warn('Nie udało się sprawdzić kolizji rezerwacji:', error);
    throw error;
  }
  return Array.isArray(data) && data.length > 0;
}

function resetForm() {
  form?.reset();
  if (recurringYearsInput) {
    recurringYearsInput.value = '0';
    recurringYearsInput.disabled = true;
  }
  if (recurringCheckbox) {
    recurringCheckbox.checked = false;
  }
  renderFacilityOptions();
  resetRows();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isSaving) {
    return;
  }
  if (!session) {
    setStatus('Brak aktywnej sesji opiekuna.', 'error');
    return;
  }
  if (!supabaseClient) {
    setStatus('Brak połączenia z bazą danych.', 'error');
    return;
  }
  if (!facilitiesCache.length) {
    setStatus('Nie masz przypisanych obiektów.', 'error');
    return;
  }

  const facilityId = facilitySelect?.value || '';
  if (!facilityId) {
    setStatus('Wybierz obiekt.', 'error');
    facilitySelect?.focus();
    return;
  }

  const dateInputs = Array.from(rowsContainer?.querySelectorAll('input[type="date"]') || []);
  const dateValues = dateInputs.map((input) => input.value.trim()).filter(Boolean);
  if (!dateValues.length) {
    setStatus('Dodaj co najmniej jedną datę do zablokowania.', 'error');
    dateInputs[0]?.focus();
    return;
  }

  const isRecurring = Boolean(recurringCheckbox?.checked);
  let extraYears = 0;
  if (isRecurring) {
    const parsed = parseInt(recurringYearsInput?.value ?? '0', 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setStatus('Podaj prawidłową liczbę lat do przodu.', 'error');
      recurringYearsInput?.focus();
      return;
    }
    extraYears = parsed;
  }

  const caretakerName = getCaretakerDisplayName(session) || session?.displayName || getCaretakerEmail(session) || 'Opiekun';
  const caretakerEmail = getCaretakerEmail(session);
  if (!caretakerEmail) {
    setStatus('Brak adresu e-mail opiekuna. Uzupełnij profil przed blokowaniem terminów.', 'error');
    return;
  }
  const caretakerPhone = getCaretakerPhone(session);

  const ranges = [];
  const seenKeys = new Set();
  try {
    dateValues.forEach((value) => {
      const parts = parseDateValue(value);
      if (!parts) {
        throw new Error(`Nieprawidłowa data: ${value}`);
      }
      const generated = generateRangesForDate(parts, isRecurring ? extraYears : 0);
      if (!generated.length) {
        throw new Error(`Nie udało się utworzyć zakresu dla daty ${value}.`);
      }
      generated.forEach((range) => {
        const key = `${range.startIso}__${range.endIso}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          ranges.push(range);
        }
      });
    });
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Nie udało się przygotować zakresów dat.', 'error');
    return;
  }

  if (!ranges.length) {
    setStatus('Nie udało się przygotować zakresów dat do zapisania.', 'error');
    return;
  }

  setSavingState(true);
  setStatus('Sprawdzanie dostępności terminów...');

  try {
    for (const range of ranges) {
      const overlap = await checkOverlap(facilityId, range.startIso, range.endIso);
      if (overlap) {
        setStatus(`Termin ${range.displayLabel} koliduje z istniejącą rezerwacją.`, 'error');
        setSavingState(false);
        return;
      }
    }

    const payload = ranges.map((range) => ({
      facility_id: facilityId,
      title: 'W celu rezerwacji skontaktuj się z opiekunem',
      start_time: range.startIso,
      end_time: range.endIso,
      renter_name: caretakerName,
      renter_email: caretakerEmail,
      renter_phone: caretakerPhone || null,
      notes: 'Termin zablokowany przez opiekuna.',
      is_public: true,
      status: 'active',
    }));

    const { error } = await supabaseClient.from('bookings').insert(payload);
    if (error) {
      throw error;
    }

    setStatus(
      payload.length === 1
        ? 'Zablokowano jeden termin.'
        : `Zablokowano ${payload.length} terminów.`,
      'success',
    );
    resetForm();
  } catch (error) {
    console.error('Nie udało się zapisać blokady terminów:', error);
    const message = error?.message || 'Nie udało się zapisać blokady terminów.';
    setStatus(message, 'error');
  } finally {
    setSavingState(false);
  }
}

function setupEventListeners() {
  if (openModalBtn) {
    openModalBtn.addEventListener('click', async () => {
      if (!session) {
        return;
      }
      await loadFacilities();
      renderFacilityOptions();
      if (!facilitiesCache.length) {
        setStatus('Nie masz przypisanych obiektów.', 'error');
      }
      openModal();
    });
  }

  modalCloseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeModal();
    });
  });

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });
  }

  addRowBtn?.addEventListener('click', () => {
    addDateRow();
  });

  recurringCheckbox?.addEventListener('change', (event) => {
    const isChecked = Boolean(event.target?.checked);
    if (recurringYearsInput) {
      recurringYearsInput.disabled = !isChecked;
      if (!isChecked) {
        recurringYearsInput.value = '0';
      }
    }
  });

  form?.addEventListener('submit', (event) => {
    void handleSubmit(event);
  });
}

async function bootstrap() {
  session = await requireCaretakerSession({ redirectTo: './caretakerLogin.html' });
  if (!session) {
    return;
  }
  supabaseClient = session.supabase || session.baseSupabase || null;
  if (!supabaseClient) {
    console.warn('Brak klienta Supabase dla sesji opiekuna.');
    setStatus('Brak połączenia z bazą danych.', 'error');
    if (openModalBtn) {
      openModalBtn.disabled = true;
    }
    return;
  }
  await loadFacilities();
  resetRows();
  setupEventListeners();
}

void bootstrap();
