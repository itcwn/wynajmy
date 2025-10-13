import { clearCaretakerSession, requireCaretakerSession } from '../caretakers/session.js';
import { clearMyFacilitiesCache, loadMyFacilities } from '../caretakers/myFacilities.js';
import { INSTRUCTION_FIELDS, findInstructionInfo } from '../utils/instructions.js';
import { uploadFacilityImages, getStorageBucketName } from '../utils/storage.js';

const titleEl = document.getElementById('facilityTitle');
const facilityStateMessage = document.getElementById('facilityStateMessage');
const metaEl = document.getElementById('facilityMeta');
const textarea = document.getElementById('instructionsInput');
const saveBtn = document.getElementById('saveInstructions');
const messageEl = document.getElementById('saveMessage');

const facilityForm = document.getElementById('facilityDetailsForm');
const facilityFormSubmit = document.getElementById('facilityDetailsSubmit');
const facilityFormMessage = document.getElementById('facilityDetailsMessage');
const facilityIdInput = document.getElementById('facilityIdDisplay');
const facilityImagesTextarea = document.getElementById('facilityImagesInput');
const facilityImagesUploadInput = document.getElementById('facilityImagesUploadInput');
const facilityImagesUploadMessage = document.getElementById('facilityImagesUploadMessage');

const amenitiesContainer = document.getElementById('amenitiesContainer');
const saveAmenitiesBtn = document.getElementById('saveAmenities');
const amenitiesMessage = document.getElementById('amenitiesMessage');

const checklistContainer = document.getElementById('checklistContainer');
const checklistMessage = document.getElementById('checklistMessage');
const addChecklistItemBtn = document.getElementById('addChecklistItem');
const saveChecklistBtn = document.getElementById('saveChecklist');

const tabButtons = document.querySelectorAll('[data-tab-target]');
const tabPanels = document.querySelectorAll('[data-tab-panel]');

const logoutBtn = document.getElementById('caretakerLogout');

const PHASE_OPTIONS = [
  { value: 'handover', label: 'Odbiór obiektu' },
  { value: 'return', label: 'Zdanie obiektu' },
];


if (facilityFormSubmit) {
  facilityFormSubmit.dataset.originalLabel = facilityFormSubmit.textContent || '';
}

let selectedFacility = null;
let isSavingFacilityDetails = false;

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

function escapeSelector(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function parseInteger(value, { label, allowNegative = false } = {}) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).replace(/\s+/g, '');
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Pole „${label || 'wartość liczbowa'}” wymaga liczby całkowitej.`);
  }
  if (!allowNegative && parsed < 0) {
    throw new Error(`Pole „${label || 'wartość liczbowa'}” nie może być liczbą ujemną.`);
  }
  return parsed;
}

function parseDecimal(value, { label, precision = null, allowNegative = true } = {}) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).replace(/\s+/g, '').replace(',', '.');
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Pole „${label || 'wartość liczbowa'}” wymaga liczby.`);
  }
  if (!allowNegative && parsed < 0) {
    throw new Error(`Pole „${label || 'wartość liczbowa'}” nie może być liczbą ujemną.`);
  }
  if (precision !== null && Number.isFinite(precision)) {
    const factor = 10 ** precision;
    return Math.round(parsed * factor) / factor;
  }
  return parsed;
}

function normalizeTextarea(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.replace(/\r\n/g, '\n');
  const trimmed = normalized.trim();
  return trimmed ? trimmed : null;
}

function normalizeImageList(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const parts = value
    .split(/[\n;,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) {
    return null;
  }
  return parts.join(';');
}

function splitImageList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== 'null' && part.toLowerCase() !== 'undefined');
}

function collectSelectedFiles(input) {
  if (!input || !input.files) {
    return [];
  }
  return Array.from(input.files).filter((file) => file && file.size);
}

function appendUploadedUrlsToTextarea(urls) {
  if (!facilityImagesTextarea || !Array.isArray(urls) || !urls.length) {
    return;
  }
  const currentNormalized = normalizeImageList(facilityImagesTextarea.value || '');
  const currentList = currentNormalized ? splitImageList(currentNormalized) : [];
  const unique = new Map();
  currentList.forEach((url) => {
    unique.set(url, url);
  });
  urls.forEach((url) => {
    if (url) {
      unique.set(url, url);
    }
  });
  const merged = Array.from(unique.values());
  facilityImagesTextarea.value = merged.join('\n');
  if (selectedFacility) {
    selectedFacility.image_urls = merged.length ? merged.join(';') : null;
  }
}

const FACILITY_FIELD_CONFIG = [
  { name: 'name', label: 'Nazwa świetlicy', type: 'text', required: true },
  { name: 'postal_code', label: 'Kod pocztowy', type: 'text' },
  { name: 'city', label: 'Miejscowość', type: 'text' },
  { name: 'address_line1', label: 'Adres — linia 1', type: 'text' },
  { name: 'address_line2', label: 'Adres — linia 2', type: 'text' },
  { name: 'capacity', label: 'Pojemność', type: 'integer', allowNegative: false },
  { name: 'price_per_hour', label: 'Cena za godzinę', type: 'decimal', precision: 2, allowNegative: false },
  { name: 'price_per_day', label: 'Cena za dobę', type: 'decimal', precision: 2, allowNegative: false },
  { name: 'price_list_url', label: 'Link do cennika', type: 'text' },
  { name: 'rental_rules_url', label: 'Link do regulaminu wynajmu', type: 'text' },
  { name: 'lat', label: 'Szerokość geograficzna', type: 'decimal', precision: 6 },
  { name: 'lng', label: 'Długość geograficzna', type: 'decimal', precision: 6 },
  { name: 'description', label: 'Opis', type: 'textarea' },
  { name: 'image_urls', label: 'Adresy URL zdjęć', type: 'imageList' },
];

function setFacilityFormMessage(text, tone = 'info') {
  setStatus(facilityFormMessage, text, tone);
}

function refreshFacilityFormState() {
  if (!facilityForm) {
    return;
  }
  const hasFacility = Boolean(selectedFacility);
  const disableInputs = !hasFacility || isSavingFacilityDetails;
  facilityForm.querySelectorAll('input, textarea, select').forEach((element) => {
    if (element === facilityIdInput) {
      element.disabled = true;
      return;
    }
    element.disabled = disableInputs;
  });
  if (facilityImagesUploadInput) {
    facilityImagesUploadInput.disabled = disableInputs;
  }
  if (facilityFormSubmit) {
    facilityFormSubmit.disabled = disableInputs;
    if (isSavingFacilityDetails) {
      facilityFormSubmit.textContent = 'Zapisywanie...';
    } else {
      facilityFormSubmit.textContent = facilityFormSubmit.dataset.originalLabel || facilityFormSubmit.textContent;
    }
  }
}

function populateFacilityForm(facility) {
  if (facilityIdInput) {
    facilityIdInput.value = facility?.id ? String(facility.id) : '';
  }
  if (facilityImagesUploadMessage) {
    setStatus(facilityImagesUploadMessage, '', 'info');
  }
  if (!facilityForm) {
    return;
  }
  FACILITY_FIELD_CONFIG.forEach((field) => {
    const element = facilityForm.querySelector(`[name="${escapeSelector(field.name)}"]`);
    if (!element) {
      return;
    }
    let value = facility ? facility[field.name] : null;
    if (field.name === 'image_urls' && typeof value === 'string') {
      value = value.split(';').join('\n');
    }
    if (value === null || value === undefined) {
      element.value = '';
    } else {
      element.value = String(value);
    }
  });
  if (facilityImagesUploadInput) {
    facilityImagesUploadInput.value = '';
  }
  refreshFacilityFormState();
}

function collectFacilityFormPayload() {
  if (!facilityForm) {
    return {};
  }
  const formData = new FormData(facilityForm);
  const payload = {};
  for (const field of FACILITY_FIELD_CONFIG) {
    const raw = formData.get(field.name);
    if (raw === null) {
      continue;
    }
    if (field.type === 'textarea') {
      const normalized = normalizeTextarea(String(raw));
      if (normalized !== null) {
        payload[field.name] = normalized;
      } else if (field.required) {
        throw new Error(`Pole „${field.label}” jest wymagane.`);
      } else {
        payload[field.name] = null;
      }
      continue;
    }
    if (field.type === 'imageList') {
      const normalized = normalizeImageList(String(raw));
      if (normalized !== null) {
        payload[field.name] = normalized;
      } else {
        payload[field.name] = null;
      }
      continue;
    }
    const value = typeof raw === 'string' ? raw.trim() : String(raw).trim();
    if (!value) {
      if (field.required) {
        throw new Error(`Pole „${field.label}” jest wymagane.`);
      }
      payload[field.name] = null;
      continue;
    }
    if (field.type === 'integer') {
      const parsed = parseInteger(value, { label: field.label, allowNegative: field.allowNegative === true });
      payload[field.name] = parsed;
      continue;
    }
    if (field.type === 'decimal') {
      const parsed = parseDecimal(value, {
        label: field.label,
        precision: field.precision ?? null,
        allowNegative: field.allowNegative !== undefined ? field.allowNegative : true,
      });
      payload[field.name] = parsed;
      continue;
    }
    payload[field.name] = value;
  }
  if (!payload.name || !String(payload.name).trim()) {
    throw new Error('Uzupełnij nazwę świetlicy.');
  }
  return payload;
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

  const supa = session?.supabase || session?.baseSupabase || null;
  const caretakerId = session?.caretakerId || null;
  if (!supa || !caretakerId) {
    setStatus(facilityStateMessage, 'Brak konfiguracji Supabase lub identyfikatora opiekuna.', 'error');
    setFacilityFormMessage('Brak konfiguracji Supabase lub identyfikatora opiekuna.', 'error');
    selectedFacility = null;
    populateFacilityForm(null);
    refreshFacilityFormState();
    return;
  }

  async function handleFacilityImagesUpload() {
    if (!facilityImagesUploadInput) {
      return;
    }
    const files = collectSelectedFiles(facilityImagesUploadInput);
    if (!files.length) {
      setStatus(facilityImagesUploadMessage, 'Nie wybrano plików do przesłania.', 'info');
      facilityImagesUploadInput.value = '';
      return;
    }
    if (!selectedFacility) {
      setStatus(facilityImagesUploadMessage, 'Wybierz świetlicę przed przesłaniem zdjęć.', 'error');
      facilityImagesUploadInput.value = '';
      return;
    }
    facilityImagesUploadInput.disabled = true;
    setStatus(facilityImagesUploadMessage, 'Przesyłanie zdjęć...', 'info');
    try {
      const prefix = `facility-${selectedFacility.id}`;
      const uploadedUrls = await uploadFacilityImages({
        supabase: supa,
        files,
        bucket: getStorageBucketName(),
        prefix,
      });
      if (uploadedUrls.length) {
        appendUploadedUrlsToTextarea(uploadedUrls);
        setStatus(
          facilityImagesUploadMessage,
          uploadedUrls.length === 1
            ? 'Dodano nowe zdjęcie. Zapisz formularz, aby opublikować zmiany.'
            : `Dodano ${uploadedUrls.length} zdjęcia. Zapisz formularz, aby opublikować zmiany.`,
          'success',
        );
      } else {
        setStatus(facilityImagesUploadMessage, 'Nie udało się przesłać zdjęć.', 'error');
      }
    } catch (error) {
      console.error('Nie udało się przesłać zdjęć świetlicy:', error);
      setStatus(
        facilityImagesUploadMessage,
        error?.message || 'Nie udało się przesłać zdjęć świetlicy.',
        'error',
      );
    } finally {
      facilityImagesUploadInput.value = '';
      facilityImagesUploadInput.disabled = !selectedFacility || isSavingFacilityDetails;
    }
  }

  if (facilityImagesUploadInput) {
    facilityImagesUploadInput.addEventListener('change', () => {
      void handleFacilityImagesUpload();
    });
  }

  const params = new URLSearchParams(window.location.search);
  const facilityIdParam = params.get('facility');
  if (!facilityIdParam) {
    setStatus(facilityStateMessage, 'Nie wskazano świetlicy do edycji.', 'error');
    if (textarea) {
      textarea.disabled = true;
    }
    if (saveBtn) {
      saveBtn.disabled = true;
    }
    saveAmenitiesBtn?.setAttribute('disabled', 'disabled');
    addChecklistItemBtn?.setAttribute('disabled', 'disabled');
    saveChecklistBtn?.setAttribute('disabled', 'disabled');
    setFacilityFormMessage('Nie wskazano świetlicy do edycji.', 'error');
    selectedFacility = null;
    populateFacilityForm(null);
    refreshFacilityFormState();
    return;
  }

  setFacilityFormMessage('Ładowanie danych świetlicy...', 'info');
  selectedFacility = null;
  populateFacilityForm(null);
  refreshFacilityFormState();

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

  function updateHeader(facility) {
    if (titleEl) {
      titleEl.textContent = facility?.name || 'Świetlica';
    }
    setStatus(facilityStateMessage, facility ? '' : 'Nie znaleziono świetlicy.', facility ? 'info' : 'error');
  }

  function updateMeta(facility) {
    if (!metaEl) {
      return;
    }
    if (!facility) {
      metaEl.innerHTML = '';
      return;
    }
    const fragments = [];
    const addressParts = [];
    if (facility.postal_code || facility.city) {
      addressParts.push([facility.postal_code, facility.city].filter(Boolean).join(' '));
    }
    if (facility.address_line1 || facility.address_line2) {
      addressParts.push([facility.address_line1, facility.address_line2].filter(Boolean).join(', '));
    }
    if (addressParts.length) {
      fragments.push(`<p><span class="font-medium text-gray-700">Adres:</span> ${escapeHtml(addressParts.join(' · '))}</p>`);
    }
    if (facility.capacity !== null && facility.capacity !== undefined) {
      fragments.push(
        `<p><span class="font-medium text-gray-700">Pojemność:</span> ${escapeHtml(String(facility.capacity))} osób</p>`,
      );
    }
    if (facility.price_per_hour !== null && facility.price_per_hour !== undefined) {
      fragments.push(
        `<p><span class="font-medium text-gray-700">Cena za godzinę:</span> ${escapeHtml(String(facility.price_per_hour))} zł</p>`,
      );
    }
    if (facility.price_per_day !== null && facility.price_per_day !== undefined) {
      fragments.push(
        `<p><span class="font-medium text-gray-700">Cena za dobę:</span> ${escapeHtml(String(facility.price_per_day))} zł</p>`,
      );
    }
    if (facility.price_list_url) {
      const url = escapeHtml(String(facility.price_list_url));
      fragments.push(
        `<p><span class="font-medium text-gray-700">Cennik:</span> <a class="text-blue-600 underline" href="${url}" target="_blank" rel="noopener noreferrer">Otwórz cennik</a></p>`,
      );
    }
    if (facility.rental_rules_url) {
      const url = escapeHtml(String(facility.rental_rules_url));
      fragments.push(
        `<p><span class="font-medium text-gray-700">Regulamin wynajmu:</span> <a class="text-blue-600 underline" href="${url}" target="_blank" rel="noopener noreferrer">Zobacz regulamin</a></p>`,
      );
    }
    if (facility.description) {
      fragments.push(
        `<p><span class="font-medium text-gray-700">Opis:</span> ${escapeHtml(facility.description)}</p>`,
      );
    }
    metaEl.innerHTML = fragments.join('');
  }

  async function handleFacilityDetailsSave(event) {
    event?.preventDefault();
    if (!selectedFacility || isSavingFacilityDetails) {
      if (!selectedFacility) {
        setFacilityFormMessage('Brak danych świetlicy do zapisania.', 'error');
      }
      return;
    }
    let payload;
    try {
      payload = collectFacilityFormPayload();
    } catch (error) {
      setFacilityFormMessage(error?.message || 'Nie udało się przygotować danych do zapisu.', 'error');
      return;
    }
    if (!payload || Object.keys(payload).length === 0) {
      setFacilityFormMessage('Brak zmian do zapisania.', 'info');
      return;
    }
    isSavingFacilityDetails = true;
    refreshFacilityFormState();
    setFacilityFormMessage('Zapisywanie danych świetlicy...', 'info');
    try {
      const facilityId = selectedFacility.id;
      const { error } = await supa.from('facilities').update(payload).eq('id', facilityId);
      if (error) {
        throw error;
      }
      selectedFacility = { ...selectedFacility, ...payload };
      clearMyFacilitiesCache();
      updateHeader(selectedFacility);
      updateMeta(selectedFacility);
      populateFacilityForm(selectedFacility);
      setFacilityFormMessage('Dane świetlicy zostały zapisane.', 'success');
    } catch (error) {
      console.error(error);
      setFacilityFormMessage(error?.message || 'Nie udało się zapisać danych świetlicy.', 'error');
    } finally {
      isSavingFacilityDetails = false;
      refreshFacilityFormState();
    }
  }

  function showMessage(text, tone = 'info') {
    setStatus(messageEl, text, tone);
  }

  function renderAmenitiesList() {
    if (!amenitiesContainer) {
      return;
    }
    if (!selectedFacility) {
      amenitiesContainer.innerHTML = '<p class="text-sm text-gray-500">Brak danych świetlicy.</p>';
      saveAmenitiesBtn?.setAttribute('disabled', 'disabled');
      return;
    }
    if (!amenitiesLoaded) {
      amenitiesContainer.innerHTML = '<p class="text-sm text-gray-500">Ładowanie listy udogodnień...</p>';
      return;
    }
    if (!amenitiesCatalog.length) {
      amenitiesContainer.innerHTML = '<p class="text-sm text-gray-500">Brak udogodnień w słowniku.</p>';
      saveAmenitiesBtn?.setAttribute('disabled', 'disabled');
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
      setStatus(amenitiesMessage, 'Brak danych świetlicy.', 'info');
      return;
    }
    if (amenitiesContainer) {
      amenitiesContainer.innerHTML = '<p class="text-sm text-gray-500">Ładowanie przypisań...</p>';
    }
    setStatus(amenitiesMessage, 'Ładowanie udogodnień świetlicy...', 'info');
    selectedAmenityIds = new Set();
    try {
      const { data, error } = await supa
        .from('facility_amenities')
        .select('amenity_id')
        .eq('facility_id', facilityId);
      if (error) {
        throw error;
      }
      if (!selectedFacility || String(selectedFacility.id) !== String(facilityId)) {
        return;
      }
      selectedAmenityIds = new Set((data || []).map((row) => String(row.amenity_id)));
      renderAmenitiesList();
      setStatus(amenitiesMessage, '', 'info');
    } catch (error) {
      console.error(error);
      if (!selectedFacility || String(selectedFacility.id) !== String(facilityId)) {
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
      checklistContainer.innerHTML = '<p class="text-sm text-gray-500">Brak danych świetlicy.</p>';
      addChecklistItemBtn?.setAttribute('disabled', 'disabled');
      saveChecklistBtn?.setAttribute('disabled', 'disabled');
      setStatus(checklistMessage, '', 'info');
      return;
    }
    const hasItems = checklistItems.length > 0;
    const columns = {};
    PHASE_OPTIONS.forEach((option) => {
      columns[option.value] = [];
    });

    if (hasItems) {
      checklistItems.forEach((item, index) => {
        const key = ensureChecklistDomKey(item);
        const itemPhase = PHASE_OPTIONS.some((option) => option.value === item.phase) ? item.phase : 'handover';
        const options = PHASE_OPTIONS.map(
          (option) => `<option value="${option.value}" ${itemPhase === option.value ? 'selected' : ''}>${option.label}</option>`,
        ).join('');
        const row = `
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
                <button type="button" class="text-blue-600 hover:underline disabled:opacity-40" data-action="move-up" ${
                  index === 0 ? 'disabled' : ''
                }>↑ do góry</button>
                <button type="button" class="text-blue-600 hover:underline disabled:opacity-40" data-action="move-down" ${
                  index === checklistItems.length - 1 ? 'disabled' : ''
                }>↓ w dół</button>
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
        columns[itemPhase].push(row);
      });
    }

    const columnMarkup = PHASE_OPTIONS.map((option) => {
      const rows = columns[option.value];
      let content = '';
      if (!hasItems) {
        content = '<p class="text-sm text-gray-500">Brak elementów. Dodaj pierwszy element listy kontrolnej.</p>';
      } else if (!rows.length) {
        content = '<p class="text-sm text-gray-500">Brak elementów dla tego etapu.</p>';
      } else {
        content = rows.join('');
      }
      return `
        <section class="space-y-3" data-phase-wrapper="${option.value}">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold">${option.label}</h3>
          </div>
          <div class="space-y-3" data-phase-list="${option.value}">
            ${content}
          </div>
        </section>
      `;
    }).join('');

    checklistContainer.innerHTML = `<div class="grid gap-4 md:grid-cols-2">${columnMarkup}</div>`;
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
      if (!selectedFacility || String(selectedFacility.id) !== String(facilityId)) {
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
      if (!selectedFacility || String(selectedFacility.id) !== String(facilityId)) {
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

  async function handleSaveInstructions() {
    if (!selectedFacility || isSavingInstructions) {
      return;
    }
    isSavingInstructions = true;
    const originalLabel = saveBtn?.textContent;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Zapisywanie...';
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
    }
  }

  function updateInstructionsForm() {
    const info = findInstructionInfo(selectedFacility);
    if (!selectedFacility) {
      if (textarea) {
        textarea.value = '';
        textarea.disabled = true;
      }
      if (saveBtn) {
        saveBtn.disabled = true;
      }
      showMessage('Brak danych świetlicy do edycji.', 'info');
      return;
    }
    if (textarea) {
      textarea.disabled = false;
      textarea.value = info.text || '';
    }
    if (saveBtn) {
      saveBtn.disabled = false;
    }
    showMessage('', 'info');
  }

  async function loadFacilityDetails({ forceRefresh = false } = {}) {
    setStatus(facilityStateMessage, 'Ładowanie danych świetlicy...', 'info');
    setFacilityFormMessage('Ładowanie danych świetlicy...', 'info');
    refreshFacilityFormState();
    try {
      const columns = [
        'id',
        'name',
        'postal_code',
        'city',
        'address_line1',
        'address_line2',
        'capacity',
        'price_per_hour',
        'price_per_day',
        'price_list_url',
        'rental_rules_url',
        'lat',
        'lng',
        'description',
        'image_urls',
        ...INSTRUCTION_FIELDS,
      ].join(',');
      const facilities = await loadMyFacilities({ columns, forceRefresh });
      const match = facilities.find((item) => String(item.id) === String(facilityIdParam));
      if (!match) {
        selectedFacility = null;
        updateHeader(null);
        updateMeta(null);
        showMessage('Nie znaleziono świetlicy powiązanej z Twoim kontem.', 'error');
        setStatus(amenitiesMessage, 'Nie znaleziono świetlicy.', 'error');
        setStatus(checklistMessage, 'Nie znaleziono świetlicy.', 'error');
        renderAmenitiesList();
        renderChecklist();
        textarea?.setAttribute('disabled', 'disabled');
        saveBtn?.setAttribute('disabled', 'disabled');
        populateFacilityForm(null);
        setFacilityFormMessage('Nie znaleziono świetlicy powiązanej z Twoim kontem.', 'error');
        refreshFacilityFormState();
        saveAmenitiesBtn?.setAttribute('disabled', 'disabled');
        addChecklistItemBtn?.setAttribute('disabled', 'disabled');
        saveChecklistBtn?.setAttribute('disabled', 'disabled');
        return;
      }
      selectedFacility = { ...(match || {}) };
      updateHeader(selectedFacility);
      updateMeta(selectedFacility);
      populateFacilityForm(selectedFacility);
      setFacilityFormMessage('', 'info');
      updateInstructionsForm();
      renderAmenitiesList();
      setStatus(amenitiesMessage, 'Ładowanie udogodnień świetlicy...', 'info');
      void loadFacilityAmenities(selectedFacility.id);
      resetChecklistState();
      renderChecklist();
      setStatus(checklistMessage, 'Ładowanie listy kontrolnej...', 'info');
      void loadChecklistForFacility(selectedFacility.id);
    } catch (error) {
      console.error(error);
      setStatus(facilityStateMessage, 'Nie udało się pobrać danych świetlicy.', 'error');
      showMessage('Nie udało się pobrać danych świetlicy.', 'error');
      setStatus(amenitiesMessage, 'Nie udało się pobrać danych świetlicy.', 'error');
      setStatus(checklistMessage, 'Nie udało się pobrać danych świetlicy.', 'error');
      populateFacilityForm(null);
      setFacilityFormMessage('Nie udało się pobrać danych świetlicy.', 'error');
      refreshFacilityFormState();
    }
  }

  facilityForm?.addEventListener('submit', (event) => {
    void handleFacilityDetailsSave(event);
  });

  saveBtn?.addEventListener('click', () => {
    void handleSaveInstructions();
  });

  textarea?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void handleSaveInstructions();
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
  setStatus(amenitiesMessage, 'Ładowanie listy udogodnień...', 'info');
  setStatus(checklistMessage, '', 'info');

  void loadAmenitiesDictionary();
  void loadFacilityDetails({ forceRefresh: false });
}

void bootstrap();
function activateTab(tabId) {
  if (!tabId) {
    return;
  }
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === tabId;
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.setAttribute('tabindex', isActive ? '0' : '-1');
    button.classList.toggle('bg-blue-600', isActive);
    button.classList.toggle('text-white', isActive);
    button.classList.toggle('shadow', isActive);
    button.classList.toggle('bg-slate-100', !isActive);
    button.classList.toggle('text-slate-600', !isActive);
  });
  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabId;
    panel.hidden = !isActive;
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
}

if (tabButtons.length && tabPanels.length) {
  tabPanels.forEach((panel) => {
    panel.setAttribute('role', 'tabpanel');
  });
  tabButtons.forEach((button, index) => {
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => {
      activateTab(button.dataset.tabTarget);
    });
    if (index === 0) {
      activateTab(button.dataset.tabTarget);
    }
  });
  const tablist = tabButtons[0]?.closest('[role="tablist"]');
  if (tablist) {
    tablist.setAttribute('aria-orientation', 'horizontal');
  }
}

