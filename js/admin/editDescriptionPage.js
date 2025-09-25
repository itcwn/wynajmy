import { clearCaretakerSession, requireCaretakerSession } from '../caretakers/session.js';
import { INSTRUCTION_FIELDS, findInstructionInfo } from '../utils/instructions.js';
import { initFacilityForm } from './facilityForm.js';

const selectEl = document.getElementById('facilitySelect');
const textarea = document.getElementById('instructionsInput');
const saveBtn = document.getElementById('saveInstructions');
const messageEl = document.getElementById('saveMessage');
const metaEl = document.getElementById('facilityMeta');

const amenitiesContainer = document.getElementById('amenitiesContainer');
const saveAmenitiesBtn = document.getElementById('saveAmenities');
const amenitiesMessage = document.getElementById('amenitiesMessage');

const checklistContainer = document.getElementById('checklistContainer');
const checklistMessage = document.getElementById('checklistMessage');
const addChecklistItemBtn = document.getElementById('addChecklistItem');
const saveChecklistBtn = document.getElementById('saveChecklist');
const logoutBtn = document.getElementById('caretakerLogout');
const addFacilityModal = document.getElementById('addFacilityModal');
const openAddFacilityBtn = document.getElementById('openAddFacilityModal');
const addFacilityModalCloseButtons = document.querySelectorAll('[data-add-facility-modal-close]');

const PHASE_OPTIONS = [
  { value: 'handover', label: 'Odbiór obiektu' },
  { value: 'return', label: 'Zdanie obiektu' },
];

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setStatus(element, text, tone = 'info') {
  if (!element) {
    return;
  }
  element.textContent = text || '';
  element.classList.remove('text-red-600', 'text-emerald-600', 'text-gray-500');
  if (!text) {
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

function escapeSelector(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

async function bootstrap() {
  if (!window.supabase || !window.supabase.createClient) {
    // eslint-disable-next-line no-alert
    alert('Nie wykryto Supabase SDK. Sprawdź dołączone skrypty.');
    return;
  }

  const session = await requireCaretakerSession({ redirectTo: './caretakerLogin.html' });
  if (!session) {
    return;
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      void (async () => {
        await clearCaretakerSession();
        window.location.replace('./caretakerLogin.html');
      })();
    });
  }

  const caretakerId = session?.caretakerId || null;
  const supa = session?.supabase || session?.baseSupabase || null;
  if (!supa) {
    setStatus(messageEl, 'Brak konfiguracji Supabase lub identyfikatora opiekuna.', 'error');
    return;
  }
  let facilities = [];
  let selectedFacility = null;
  let isSavingInstructions = false;

  let amenitiesCatalog = [];
  let amenitiesLoaded = false;
  let selectedAmenityIds = new Set();
  let isSavingAmenities = false;

  let checklistItems = [];
  let deletedChecklistIds = new Set();
  let nextChecklistTempId = 1;
  let lastChecklistFocusKey = null;
  let isSavingChecklist = false;

  let facilityFormControls = null;
  const bodyClassList = document.body?.classList || null;
  const modalClassList = addFacilityModal?.classList || null;
  let lastFocusedBeforeModal = null;
  let escapeListenerAttached = false;

  function isModalOpen() {
    return Boolean(modalClassList) && !modalClassList.contains('hidden');
  }

  function trapBodyScroll(shouldTrap) {
    if (!bodyClassList) {
      return;
    }
    if (shouldTrap) {
      bodyClassList.add('overflow-hidden');
    } else {
      bodyClassList.remove('overflow-hidden');
    }
  }

  function handleModalEscape(event) {
    if (event.key !== 'Escape' || !isModalOpen()) {
      return;
    }
    event.preventDefault();
    closeAddFacilityModalDialog({ restoreFocus: true, resetForm: true });
  }

  function attachModalEscapeListener() {
    if (escapeListenerAttached) {
      return;
    }
    document.addEventListener('keydown', handleModalEscape);
    escapeListenerAttached = true;
  }

  function detachModalEscapeListener() {
    if (!escapeListenerAttached) {
      return;
    }
    document.removeEventListener('keydown', handleModalEscape);
    escapeListenerAttached = false;
  }

  function openAddFacilityModalDialog() {
    if (!addFacilityModal || !modalClassList || isModalOpen()) {
      return;
    }
    lastFocusedBeforeModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalClassList.remove('hidden');
    modalClassList.add('flex');
    trapBodyScroll(true);
    facilityFormControls?.reset?.({ focus: false });
    window.setTimeout(() => {
      facilityFormControls?.focusFirstField?.();
    }, 50);
    attachModalEscapeListener();
  }

  function closeAddFacilityModalDialog({ restoreFocus = true, resetForm = false } = {}) {
    if (!addFacilityModal || !modalClassList || !isModalOpen()) {
      return;
    }
    modalClassList.add('hidden');
    modalClassList.remove('flex');
    trapBodyScroll(false);
    detachModalEscapeListener();
    if (resetForm) {
      facilityFormControls?.reset?.({ focus: false });
      facilityFormControls?.clearMessage?.();
    }
    if (restoreFocus && lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  }

  function buildSupabaseClientList() {
    const clients = [];
    if (supa) {
      clients.push(supa);
    }
    const baseClient = session?.baseSupabase || null;
    if (baseClient && baseClient !== supa) {
      clients.push(baseClient);
    }
    return clients;
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

  function showMessage(text, tone = 'info') {
    setStatus(messageEl, text, tone);
  }

  function describeFacility(facility) {
    if (!facility) {
      return '';
    }
    const parts = [];
    if (facility.postal_code || facility.city) {
      parts.push([facility.postal_code, facility.city].filter(Boolean).join(' '));
    }
    if (facility.address_line1 || facility.address_line2) {
      parts.push([facility.address_line1, facility.address_line2].filter(Boolean).join(', '));
    }
    return parts.filter(Boolean).join(' · ');
  }

  function updateMeta(facility) {
    if (!metaEl) {
      return;
    }
    const description = describeFacility(facility);
    metaEl.textContent = description || '';
  }

  function renderAmenitiesList() {
    if (!amenitiesContainer) {
      return;
    }
    if (!selectedFacility) {
      amenitiesContainer.innerHTML = '<p class="text-sm text-gray-500">Wybierz świetlicę, aby przypisać udogodnienia.</p>';
      if (saveAmenitiesBtn) {
        saveAmenitiesBtn.disabled = true;
      }
      return;
    }
    if (!amenitiesLoaded) {
      amenitiesContainer.innerHTML = '<p class="text-sm text-gray-500">Ładowanie listy udogodnień...</p>';
      return;
    }
    if (!amenitiesCatalog.length) {
      amenitiesContainer.innerHTML = '<p class="text-sm text-gray-500">Brak udogodnień w słowniku.</p>';
      if (saveAmenitiesBtn) {
        saveAmenitiesBtn.disabled = true;
      }
      return;
    }
    const fragments = amenitiesCatalog.map((amenity) => {
      const amenityId = String(amenity.id);
      const checked = selectedAmenityIds.has(amenityId) ? 'checked' : '';
      const description = amenity.description
        ? `<span class="block text-xs text-gray-500 mt-1">${escapeHtml(amenity.description)}</span>`
        : '';
      return `
        <label class="border rounded-xl px-3 py-2 flex items-start gap-3 bg-gray-50 hover:bg-gray-100 transition">
          <input type="checkbox" class="mt-1" data-amenity-id="${escapeHtml(amenityId)}" ${checked} />
          <span>
            <span class="font-medium">${escapeHtml(amenity.name || 'Bez nazwy')}</span>
            ${description}
          </span>
        </label>
      `;
    });
    amenitiesContainer.innerHTML = fragments.join('');
    amenitiesContainer.querySelectorAll('input[data-amenity-id]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const id = checkbox.dataset.amenityId;
        if (!id) {
          return;
        }
        if (checkbox.checked) {
          selectedAmenityIds.add(id);
        } else {
          selectedAmenityIds.delete(id);
        }
      });
    });
    if (saveAmenitiesBtn) {
      saveAmenitiesBtn.disabled = false;
    }
  }

  function getOriginalAmenityId(value) {
    const match = amenitiesCatalog.find((amenity) => String(amenity.id) === String(value));
    return match ? match.id : value;
  }

  async function loadAmenitiesDictionary() {
    amenitiesLoaded = false;
    try {
      const { data, error } = await supa.from('amenities').select('*').order('name');
      if (error) {
        throw error;
      }
      amenitiesCatalog = data || [];
    } catch (error) {
      console.error(error);
      amenitiesCatalog = [];
      setStatus(amenitiesMessage, 'Nie udało się pobrać listy udogodnień.', 'error');
    } finally {
      amenitiesLoaded = true;
      renderAmenitiesList();
    }
  }

  async function loadFacilityAmenities(facilityId) {
    if (!facilityId) {
      selectedAmenityIds = new Set();
      renderAmenitiesList();
      setStatus(amenitiesMessage, 'Wybierz świetlicę, aby zarządzać udogodnieniami.', 'info');
      return;
    }
    if (amenitiesContainer) {
      amenitiesContainer.innerHTML = '<p class="text-sm text-gray-500">Ładowanie przypisań...</p>';
    }
    setStatus(amenitiesMessage, 'Ładowanie udogodnień świetlicy...', 'info');
    const expected = String(facilityId);
    selectedAmenityIds = new Set();
    try {
      const { data, error } = await supa
        .from('facility_amenities')
        .select('amenity_id')
        .eq('facility_id', facilityId);
      if (error) {
        throw error;
      }
      if (!selectedFacility || String(selectedFacility.id) !== expected) {
        return;
      }
      selectedAmenityIds = new Set((data || []).map((row) => String(row.amenity_id)));
      renderAmenitiesList();
      setStatus(amenitiesMessage, '', 'info');
    } catch (error) {
      console.error(error);
      if (!selectedFacility || String(selectedFacility.id) !== expected) {
        return;
      }
      renderAmenitiesList();
      setStatus(amenitiesMessage, error?.message || 'Nie udało się pobrać przypisanych udogodnień.', 'error');
    }
  }

  async function handleSaveAmenities() {
    if (!selectedFacility || isSavingAmenities) {
      return;
    }
    isSavingAmenities = true;
    const facilityId = selectedFacility.id;
    if (saveAmenitiesBtn) {
      saveAmenitiesBtn.disabled = true;
    }
    setStatus(amenitiesMessage, 'Zapisywanie udogodnień...', 'info');
    try {
      const { error: deleteError } = await supa
        .from('facility_amenities')
        .delete()
        .eq('facility_id', facilityId);
      if (deleteError) {
        throw deleteError;
      }
      const ids = Array.from(selectedAmenityIds);
      if (ids.length) {
        const payload = ids.map((value) => ({
          facility_id: facilityId,
          amenity_id: getOriginalAmenityId(value),
        }));
        const { error: insertError } = await supa.from('facility_amenities').insert(payload);
        if (insertError) {
          throw insertError;
        }
      }
      setStatus(amenitiesMessage, 'Lista udogodnień została zapisana.', 'success');
      await loadFacilityAmenities(facilityId);
    } catch (error) {
      console.error(error);
      setStatus(amenitiesMessage, error?.message || 'Nie udało się zapisać udogodnień.', 'error');
    } finally {
      isSavingAmenities = false;
      if (saveAmenitiesBtn) {
        saveAmenitiesBtn.disabled = !selectedFacility;
      }
    }
  }

  function resetChecklistState() {
    checklistItems = [];
    deletedChecklistIds = new Set();
    nextChecklistTempId = 1;
    lastChecklistFocusKey = null;
  }

  function ensureChecklistDomKey(item) {
    if (item.__domKey) {
      return item.__domKey;
    }
    if (item.id) {
      item.__domKey = `persisted-${item.id}`;
    } else {
      const tempId = item.tempId ?? nextChecklistTempId++;
      item.tempId = tempId;
      item.__domKey = `temp-${tempId}`;
    }
    return item.__domKey;
  }

  function renderChecklist() {
    if (!checklistContainer) {
      return;
    }
    if (!selectedFacility) {
      checklistContainer.innerHTML = '<p class="text-sm text-gray-500">Wybierz świetlicę, aby edytować listę kontrolną.</p>';
      if (addChecklistItemBtn) {
        addChecklistItemBtn.disabled = true;
      }
      if (saveChecklistBtn) {
        saveChecklistBtn.disabled = true;
      }
      setStatus(checklistMessage, '', 'info');
      return;
    }
    if (!checklistItems.length) {
      checklistContainer.innerHTML = '<p class="text-sm text-gray-500">Brak elementów. Dodaj pierwszy element listy kontrolnej.</p>';
    } else {
      const rows = checklistItems
        .map((item, index) => {
          const key = ensureChecklistDomKey(item);
          const options = PHASE_OPTIONS.map(
            (option) =>
              `<option value="${option.value}" ${item.phase === option.value ? 'selected' : ''}>${option.label}</option>`,
          ).join('');
          return `
            <article class="border rounded-2xl p-4 space-y-3 bg-gray-50" data-key="${key}">
              <div class="flex items-start justify-between gap-3 flex-wrap">
                <div class="flex items-center gap-3 flex-wrap text-sm">
                  <span class="font-semibold text-base">#${index + 1}</span>
                  <label class="flex items-center gap-2 text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1">
                    <span>Etap:</span>
                    <select data-role="phase" class="border rounded-lg px-2 py-1 text-sm bg-white">
                      ${options}
                    </select>
                  </label>
                  <label class="flex items-center gap-2 text-xs">
                    <input type="checkbox" data-role="required" ${item.is_required !== false ? 'checked' : ''} />
                    <span>Wymagane</span>
                  </label>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <button type="button" class="text-blue-600 hover:underline disabled:opacity-40" data-action="move-up" ${index === 0 ? 'disabled' : ''}>↑ do góry</button>
                  <button type="button" class="text-blue-600 hover:underline disabled:opacity-40" data-action="move-down" ${index === checklistItems.length - 1 ? 'disabled' : ''}>↓ w dół</button>
                  <button type="button" class="text-red-600 hover:underline" data-action="delete">Usuń</button>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Tytuł elementu</label>
                <input
                  type="text"
                  data-role="title"
                  class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                  placeholder="np. Sprawdź stan liczników"
                  value="${escapeHtml(item.title || '')}"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Opis szczegółowy (opcjonalnie)</label>
                <textarea
                  data-role="description"
                  class="mt-1 w-full border rounded-xl px-3 py-2 text-sm"
                  rows="3"
                  placeholder="Dodaj dodatkowe instrukcje lub kontekst."
                >${escapeHtml(item.description || '')}</textarea>
              </div>
            </article>
          `;
        })
        .join('');
      checklistContainer.innerHTML = rows;
    }
    if (addChecklistItemBtn) {
      addChecklistItemBtn.disabled = false;
    }
    if (saveChecklistBtn) {
      saveChecklistBtn.disabled = false;
    }
    checklistItems.forEach((item) => {
      const key = ensureChecklistDomKey(item);
      const selector = `[data-key="${escapeSelector(key)}"]`;
      const root = checklistContainer.querySelector(selector);
      if (!root) {
        return;
      }
      const titleInput = root.querySelector('[data-role="title"]');
      const descriptionInput = root.querySelector('[data-role="description"]');
      const phaseSelect = root.querySelector('[data-role="phase"]');
      const requiredCheckbox = root.querySelector('[data-role="required"]');
      const moveUpBtn = root.querySelector('[data-action="move-up"]');
      const moveDownBtn = root.querySelector('[data-action="move-down"]');
      const deleteBtn = root.querySelector('[data-action="delete"]');

      if (titleInput) {
        titleInput.value = item.title || '';
        titleInput.addEventListener('input', (event) => {
          item.title = event.target.value;
        });
      }
      if (descriptionInput) {
        descriptionInput.value = item.description || '';
        descriptionInput.addEventListener('input', (event) => {
          item.description = event.target.value;
        });
      }
      if (phaseSelect) {
        phaseSelect.value = item.phase || 'handover';
        phaseSelect.addEventListener('change', (event) => {
          item.phase = event.target.value;
        });
      }
      if (requiredCheckbox) {
        requiredCheckbox.checked = item.is_required !== false;
        requiredCheckbox.addEventListener('change', (event) => {
          item.is_required = event.target.checked;
        });
      }
      moveUpBtn?.addEventListener('click', () => {
        moveChecklistItem(item, -1);
      });
      moveDownBtn?.addEventListener('click', () => {
        moveChecklistItem(item, 1);
      });
      deleteBtn?.addEventListener('click', () => {
        if (item.id) {
          deletedChecklistIds.add(item.id);
        }
        checklistItems = checklistItems.filter((entry) => entry !== item);
        renderChecklist();
      });
    });

    if (lastChecklistFocusKey && selectedFacility) {
      const focusSelector = `[data-key="${escapeSelector(lastChecklistFocusKey)}"] [data-role="title"]`;
      const focusEl = checklistContainer.querySelector(focusSelector);
      if (focusEl) {
        focusEl.focus();
      }
      lastChecklistFocusKey = null;
    }
  }

  function moveChecklistItem(item, offset) {
    const currentIndex = checklistItems.indexOf(item);
    if (currentIndex === -1) {
      return;
    }
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= checklistItems.length) {
      return;
    }
    const [removed] = checklistItems.splice(currentIndex, 1);
    checklistItems.splice(nextIndex, 0, removed);
    renderChecklist();
  }

  function handleAddChecklistItem() {
    if (!selectedFacility) {
      return;
    }
    const newItem = {
      phase: 'handover',
      title: '',
      description: '',
      is_required: true,
    };
    const key = ensureChecklistDomKey(newItem);
    lastChecklistFocusKey = key;
    checklistItems.push(newItem);
    renderChecklist();
    setStatus(checklistMessage, 'Dodano nowy element. Uzupełnij treść i zapisz zmiany.', 'info');
  }

  async function handleChecklistSave() {
    if (!selectedFacility || isSavingChecklist) {
      return;
    }
    const missing = checklistItems.find((item) => !item.title || !item.title.trim());
    if (missing) {
      setStatus(checklistMessage, 'Każdy element listy musi mieć wypełniony tytuł.', 'error');
      return;
    }
    isSavingChecklist = true;
    if (saveChecklistBtn) {
      saveChecklistBtn.disabled = true;
    }
    setStatus(checklistMessage, 'Zapisywanie listy kontrolnej...', 'info');
    const facilityId = selectedFacility.id;
    const normalized = checklistItems.map((item, index) => ({
      id: item.id || undefined,
      facility_id: facilityId,
      phase: item.phase || 'handover',
      title: item.title.trim(),
      description: item.description && item.description.trim() ? item.description.trim() : null,
      is_required: item.is_required !== false,
      order_index: index,
    }));
    try {
      const toInsert = normalized.filter((row) => !row.id);
      const toUpdate = normalized.filter((row) => row.id);
      if (toInsert.length) {
        const payload = toInsert.map(({ id: _id, ...rest }) => rest);
        const { error: insertError } = await supa.from('facility_checklist_items').insert(payload);
        if (insertError) {
          throw insertError;
        }
      }
      if (toUpdate.length) {
        const { error: upsertError } = await supa.from('facility_checklist_items').upsert(toUpdate);
        if (upsertError) {
          throw upsertError;
        }
      }
      if (deletedChecklistIds.size) {
        const ids = Array.from(deletedChecklistIds);
        const { error: deleteError } = await supa.from('facility_checklist_items').delete().in('id', ids);
        if (deleteError) {
          throw deleteError;
        }
        deletedChecklistIds.clear();
      }
      setStatus(checklistMessage, 'Lista kontrolna została zapisana.', 'success');
      await loadChecklistForFacility(facilityId);
    } catch (error) {
      console.error(error);
      setStatus(checklistMessage, error?.message || 'Nie udało się zapisać listy kontrolnej.', 'error');
    } finally {
      isSavingChecklist = false;
      if (saveChecklistBtn) {
        saveChecklistBtn.disabled = !selectedFacility;
      }
    }
  }

  async function loadChecklistForFacility(facilityId) {
    resetChecklistState();
    if (!facilityId) {
      renderChecklist();
      setStatus(checklistMessage, '', 'info');
      return;
    }
    if (checklistContainer) {
      checklistContainer.innerHTML = '<p class="text-sm text-gray-500">Ładowanie listy kontrolnej...</p>';
    }
    const expected = String(facilityId);
    try {
      const { data, error } = await supa
        .from('facility_checklist_items')
        .select('*')
        .eq('facility_id', facilityId)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true });
      if (error) {
        throw error;
      }
      if (!selectedFacility || String(selectedFacility.id) !== expected) {
        return;
      }
      checklistItems = (data || []).map((row) => ({
        id: row.id,
        phase: row.phase || 'handover',
        title: row.title || '',
        description: row.description || '',
        is_required: row.is_required !== false,
      }));
      checklistItems.forEach((item) => {
        ensureChecklistDomKey(item);
      });
      renderChecklist();
      setStatus(
        checklistMessage,
        checklistItems.length ? '' : 'Lista kontrolna jest pusta. Dodaj elementy i zapisz zmiany.',
        'info',
      );
    } catch (error) {
      console.error(error);
      if (!selectedFacility || String(selectedFacility.id) !== expected) {
        return;
      }
      resetChecklistState();
      renderChecklist();
      setStatus(checklistMessage, error?.message || 'Nie udało się pobrać listy kontrolnej.', 'error');
    }
  }

  function getCandidateColumns(facility) {
    const seen = new Set();
    const list = [];
    if (facility?.__instructionsColumn) {
      seen.add(facility.__instructionsColumn);
      list.push(facility.__instructionsColumn);
    }
    for (const column of INSTRUCTION_FIELDS) {
      if (!seen.has(column)) {
        seen.add(column);
        list.push(column);
      }
    }
    return list;
  }

  async function persistInstructions(newValue) {
    if (!selectedFacility) {
      return;
    }
    const facilityId = selectedFacility.id;
    const candidates = getCandidateColumns(selectedFacility);
    let savedColumn = null;
    let blockingError = null;
    for (const column of candidates) {
      const payload = { [column]: newValue };
      const { error } = await supa.from('facilities').update(payload).eq('id', facilityId);
      if (!error) {
        savedColumn = column;
        break;
      }
      if (error.code && error.code !== '42703') {
        blockingError = error;
        break;
      }
      if (!error.code && error.message && !/column/i.test(error.message)) {
        blockingError = error;
        break;
      }
    }
    if (!savedColumn) {
      throw blockingError || new Error('Nie udało się zapisać instrukcji dla tej świetlicy.');
    }
    selectedFacility.__instructionsColumn = savedColumn;
    selectedFacility[savedColumn] = newValue;
  }

  async function handleSave() {
    if (!selectedFacility || isSavingInstructions) {
      return;
    }
    isSavingInstructions = true;
    const originalLabel = saveBtn?.textContent;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Zapisywanie...';
    }
    if (selectEl) {
      selectEl.disabled = true;
    }
    showMessage('Trwa zapisywanie...', 'info');
    const normalized = textarea.value.replace(/\r\n/g, '\n');
    try {
      await persistInstructions(normalized);
      showMessage('Instrukcja została zapisana.', 'success');
    } catch (error) {
      console.error(error);
      showMessage(error?.message || 'Wystąpił błąd podczas zapisu.', 'error');
    } finally {
      isSavingInstructions = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalLabel;
      }
      if (selectEl) {
        selectEl.disabled = false;
      }
    }
  }

  function renderFacilities() {
    if (!selectEl) {
      return;
    }
    const previousValue = selectEl.value;
    selectEl.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = facilities.length
      ? '— wybierz świetlicę —'
      : '— brak przypisanych świetlic —';
    selectEl.appendChild(placeholder);

    const sorted = [...facilities].sort((a, b) => {
      const left = (a.name || '').toLocaleLowerCase('pl');
      const right = (b.name || '').toLocaleLowerCase('pl');
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });

    for (const facility of sorted) {
      const option = document.createElement('option');
      option.value = String(facility.id);
      option.textContent = facility.name || `ID ${facility.id}`;
      selectEl.appendChild(option);
    }

    if (previousValue) {
      const hasPrevious = sorted.some((facility) => String(facility.id) === String(previousValue));
      selectEl.value = hasPrevious ? previousValue : '';
    } else {
      selectEl.value = '';
    }

    selectEl.disabled = facilities.length === 0;
  }

  function applySelectionFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('facility');
    if (!fromQuery) {
      return false;
    }
    const match = facilities.find((item) => String(item.id) === String(fromQuery));
    if (match) {
      selectedFacility = match;
      if (selectEl) {
        selectEl.value = String(match.id);
      }
      return true;
    }
    return false;
  }

  async function fetchAssignedFacilityIds() {
    if (!caretakerId) {
      return null;
    }
    const clients = buildSupabaseClientList();
    let lastPermissionError = null;
    for (const client of clients) {
      try {
        const { data, error } = await client
          .from('facility_caretakers')
          .select('facility_id')
          .eq('caretaker_id', caretakerId);
        if (error) {
          throw error;
        }
        const ids = (data || [])
          .map((row) => row?.facility_id)
          .filter((value) => value !== null && value !== undefined)
          .map((value) => String(value));
        return Array.from(new Set(ids));
      } catch (error) {
        if (isPermissionError(error)) {
          lastPermissionError = error;
          continue;
        }
        throw error;
      }
    }
    if (lastPermissionError) {
      throw lastPermissionError;
    }
    return [];
  }

  async function loadFacilities({ selectId = null, silent = false } = {}) {
    if (!silent) {
      showMessage('Ładowanie listy świetlic...', 'info');
    }
    try {
      let assignedFacilityIds = null;
      if (caretakerId) {
        assignedFacilityIds = await fetchAssignedFacilityIds();
        if (Array.isArray(assignedFacilityIds) && assignedFacilityIds.length === 0) {
          facilities = [];
          selectedFacility = null;
          renderFacilities();
          updateForm();
          if (!silent) {
            showMessage(
              'Nie masz jeszcze żadnych świetlic. Użyj przycisku „Dodaj świetlicę” powyżej, aby dodać pierwszą.',
              'info',
            );
          }
          return;
        }
      }

      let query = supa.from('facilities').select('*').order('name');
      if (caretakerId && Array.isArray(assignedFacilityIds) && assignedFacilityIds.length) {
        query = query.in('id', assignedFacilityIds);
      }
      const { data, error } = await query;
      if (error) {
        throw error;
      }
      facilities = data || [];
      const previousSelectionId = selectedFacility ? String(selectedFacility.id) : null;
      if (previousSelectionId) {
        const refreshed = facilities.find((item) => String(item.id) === previousSelectionId);
        selectedFacility = refreshed || null;
      }
      renderFacilities();
      const queryApplied = applySelectionFromQuery();
      if (selectId) {
        const match = facilities.find((item) => String(item.id) === String(selectId));
        if (match) {
          selectedFacility = match;
          if (selectEl) {
            selectEl.value = String(match.id);
          }
        }
      } else if (!queryApplied && selectedFacility) {
        if (selectEl) {
          selectEl.value = String(selectedFacility.id);
        }
      }
      if (!selectedFacility && facilities.length) {
        selectedFacility = facilities[0];
        if (selectEl) {
          selectEl.value = String(selectedFacility.id);
        }
      }
      updateForm();
      if (!silent) {
        showMessage('', 'info');
      }
    } catch (error) {
      console.error(error);
      if (isPermissionError(error)) {
        showMessage(
          'Nie masz uprawnień do odczytu przypisań świetlic. Skontaktuj się z administratorem systemu.',
          'error',
        );
      } else {
        showMessage('Nie udało się pobrać listy świetlic.', 'error');
      }
    }
  }

  facilityFormControls = initFacilityForm({
    session,
    onFacilityCreated: async (createdFacility) => {
      const facilityId = createdFacility?.id ? String(createdFacility.id) : null;
      await loadFacilities({ selectId: facilityId, silent: true });
      if (facilityId && selectEl) {
        selectEl.focus();
      }
      closeAddFacilityModalDialog({ restoreFocus: false, resetForm: true });
      showMessage('Dodano nową świetlicę. Wybierz ją z listy, aby uzupełnić jej informacje.', 'success');
    },
  });

  if (openAddFacilityBtn) {
    openAddFacilityBtn.addEventListener('click', () => {
      openAddFacilityModalDialog();
    });
  }

  addFacilityModalCloseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      closeAddFacilityModalDialog({ restoreFocus: true, resetForm: true });
    });
  });

  if (addFacilityModal) {
    addFacilityModal.addEventListener('click', (event) => {
      if (event.target === addFacilityModal) {
        closeAddFacilityModalDialog({ restoreFocus: true, resetForm: true });
      }
    });
  }

  function updateForm() {
    const info = findInstructionInfo(selectedFacility);
    if (!selectedFacility) {
      if (textarea) {
        textarea.value = '';
        textarea.disabled = true;
      }
      if (saveBtn) {
        saveBtn.disabled = true;
      }
      updateMeta(null);
      if (facilities.length) {
        showMessage('Wybierz świetlicę, aby edytować instrukcję.', 'info');
      } else {
        showMessage(
          'Nie masz jeszcze żadnych świetlic. Użyj przycisku „Dodaj świetlicę” powyżej, aby dodać pierwszą.',
          'info',
        );
      }
      selectedAmenityIds = new Set();
      renderAmenitiesList();
      setStatus(amenitiesMessage, 'Wybierz świetlicę, aby zarządzać udogodnieniami.', 'info');
      resetChecklistState();
      renderChecklist();
      setStatus(checklistMessage, '', 'info');
      return;
    }
    if (textarea) {
      textarea.disabled = false;
      textarea.value = info.text || '';
    }
    if (saveBtn) {
      saveBtn.disabled = false;
    }
    updateMeta(selectedFacility);
    showMessage('', 'info');

    renderAmenitiesList();
    setStatus(amenitiesMessage, 'Ładowanie udogodnień świetlicy...', 'info');
    void loadFacilityAmenities(selectedFacility.id);

    resetChecklistState();
    renderChecklist();
    setStatus(checklistMessage, 'Ładowanie listy kontrolnej...', 'info');
    void loadChecklistForFacility(selectedFacility.id);
  }

  selectEl?.addEventListener('change', () => {
    const value = selectEl.value;
    selectedFacility = facilities.find((facility) => String(facility.id) === String(value)) || null;
    updateForm();
  });

  saveBtn?.addEventListener('click', () => {
    void handleSave();
  });

  textarea?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void handleSave();
    }
  });

  saveAmenitiesBtn?.addEventListener('click', () => {
    void handleSaveAmenities();
  });

  addChecklistItemBtn?.addEventListener('click', () => {
    handleAddChecklistItem();
  });

  saveChecklistBtn?.addEventListener('click', () => {
    void handleChecklistSave();
  });

  renderAmenitiesList();
  renderChecklist();
  setStatus(amenitiesMessage, 'Wybierz świetlicę, aby zarządzać udogodnieniami.', 'info');
  setStatus(checklistMessage, '', 'info');

  void loadAmenitiesDictionary();
  void loadFacilities();
}

void bootstrap();
