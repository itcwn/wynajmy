import { createSupabaseClient } from '../config/supabaseClient.js';
import { $ } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';

const supabase = createSupabaseClient();

const form = $('#caretakerForm');
const messageEl = $('#formMessage');
const facilitySelect = $('#facilitySelect');
const facilityLoadingOverlay = $('#facilityLoading');
const facilityInfo = $('#facilitySelectionInfo');

const state = {
  facilities: [],
  isSubmitting: false,
};

function setMessage(text, tone = 'info') {
  if (!messageEl) {
    return;
  }
  messageEl.textContent = text || '';
  messageEl.classList.remove('text-red-600', 'text-emerald-600', 'text-gray-500');
  if (!text) {
    return;
  }
  if (tone === 'error') {
    messageEl.classList.add('text-red-600');
  } else if (tone === 'success') {
    messageEl.classList.add('text-emerald-600');
  } else {
    messageEl.classList.add('text-gray-500');
  }
}

function toggleFormDisabled(disabled) {
  if (!form) {
    return;
  }
  const elements = form.querySelectorAll('input, select, button');
  elements.forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });
}

function setFacilityLoading(isLoading) {
  if (facilityLoadingOverlay) {
    facilityLoadingOverlay.classList.toggle('hidden', !isLoading);
  }
  if (facilitySelect) {
    facilitySelect.toggleAttribute('disabled', isLoading);
  }
}

function describeFacility(facility) {
  if (!facility) {
    return '';
  }
  const parts = [facility.name || ''];
  const addressParts = [facility.postal_code, facility.city].filter(Boolean).join(' ');
  if (addressParts) {
    parts.push(addressParts);
  }
  return parts.filter(Boolean).join(' • ');
}

function renderFacilities() {
  if (!facilitySelect) {
    return;
  }
  if (!state.facilities.length) {
    facilitySelect.innerHTML = '';
    facilitySelect.setAttribute('disabled', 'true');
    if (facilityInfo) {
      facilityInfo.textContent = '';
    }
    return;
  }
  const options = state.facilities
    .map((facility) => {
      const label = describeFacility(facility);
      const value = escapeHtml(String(facility.id));
      const text = escapeHtml(label);
      return `<option value="${value}">${text}</option>`;
    })
    .join('');
  facilitySelect.innerHTML = options;
  facilitySelect.removeAttribute('disabled');
  updateFacilitySelectionInfo();
}

function updateFacilitySelectionInfo() {
  if (!facilityInfo) {
    return;
  }
  if (!facilitySelect || !state.facilities.length) {
    facilityInfo.textContent = '';
    return;
  }
  const selectedCount = facilitySelect.selectedOptions?.length || 0;
  const total = state.facilities.length;
  facilityInfo.textContent = selectedCount
    ? `Wybrano ${selectedCount} z ${total}`
    : `Dostępnych: ${total}`;
}

async function loadFacilities() {
  if (!supabase || !facilitySelect) {
    return;
  }
  setFacilityLoading(true);
  const { data, error } = await supabase
    .from('facilities')
    .select('id, name, city, postal_code')
    .order('name');
  setFacilityLoading(false);
  if (error) {
    console.error('Nie udało się pobrać świetlic:', error);
    setMessage('Nie udało się pobrać listy świetlic. Spróbuj ponownie później.', 'error');
    return;
  }
  state.facilities = data || [];
  if (!state.facilities.length) {
    setMessage('Brak zdefiniowanych świetlic w bazie danych.', 'error');
  }
  renderFacilities();
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function collectSelectedFacilityIds() {
  if (!facilitySelect) {
    return [];
  }
  return Array.from(facilitySelect.selectedOptions || []).map((option) => {
    const match = state.facilities.find((facility) => String(facility.id) === option.value);
    return match ? match.id : option.value;
  });
}

function sanitizePhone(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeLogin(value) {
  return value.trim().toLowerCase();
}

function sanitizeEmail(value) {
  return value.trim().toLowerCase();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!form || !supabase || state.isSubmitting) {
    return;
  }
  const formData = new FormData(form);
  const firstName = String(formData.get('first_name') || '').trim();
  const lastNameOrCompany = String(formData.get('last_name_or_company') || '').trim();
  const phone = sanitizePhone(String(formData.get('phone') || ''));
  const email = sanitizeEmail(String(formData.get('email') || ''));
  const loginRaw = String(formData.get('login') || '');
  const password = String(formData.get('password') || '');
  const passwordConfirm = String(formData.get('passwordConfirm') || '');
  const facilityIds = collectSelectedFacilityIds();

  if (!firstName || !lastNameOrCompany || !phone || !email || !loginRaw || !password) {
    setMessage('Uzupełnij wszystkie wymagane pola formularza.', 'error');
    return;
  }

  if (password !== passwordConfirm) {
    setMessage('Hasła muszą być identyczne.', 'error');
    return;
  }

  if (!facilityIds.length) {
    setMessage('Wybierz co najmniej jedną świetlicę.', 'error');
    return;
  }

  state.isSubmitting = true;
  toggleFormDisabled(true);
  setMessage('Trwa rejestrowanie opiekuna...', 'info');

  if (!window.crypto?.subtle) {
    setMessage('Ta przeglądarka nie obsługuje bezpiecznego haszowania haseł.', 'error');
    state.isSubmitting = false;
    toggleFormDisabled(false);
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    const login = sanitizeLogin(loginRaw);
    const payload = {
      first_name: firstName,
      last_name_or_company: lastNameOrCompany,
      phone,
      email,
      login,
      password_hash: passwordHash,
    };

    const { data: caretaker, error: insertError } = await supabase
      .from('caretakers')
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        setMessage('Podany login lub e-mail są już zajęte.', 'error');
      } else {
        setMessage(insertError.message || 'Nie udało się utworzyć konta opiekuna.', 'error');
      }
      return;
    }

    if (!caretaker || !caretaker.id) {
      setMessage('Nie udało się uzyskać identyfikatora nowego opiekuna.', 'error');
      return;
    }

    const assignments = facilityIds.map((facilityId) => ({
      facility_id: facilityId,
      caretaker_id: caretaker.id,
    }));
    const { error: joinError } = await supabase
      .from('facility_caretakers')
      .insert(assignments);

    if (joinError) {
      await supabase.from('caretakers').delete().eq('id', caretaker.id);
      console.error('Błąd łączenia opiekuna ze świetlicami:', joinError);
      setMessage('Nie udało się przypisać opiekuna do świetlic. Spróbuj ponownie.', 'error');
      return;
    }

    form.reset();
    updateFacilitySelectionInfo();
    setMessage('Opiekun został zarejestrowany i przypisany do wybranych świetlic.', 'success');
  } catch (error) {
    console.error('Błąd rejestracji opiekuna:', error);
    setMessage('Wystąpił nieoczekiwany błąd podczas rejestracji.', 'error');
  } finally {
    state.isSubmitting = false;
    toggleFormDisabled(false);
  }
}

if (!supabase) {
  setMessage('Brak konfiguracji Supabase. Uzupełnij plik supabase-config.js.', 'error');
  if (form) {
    toggleFormDisabled(true);
  }
} else {
  if (facilitySelect) {
    facilitySelect.addEventListener('change', updateFacilitySelectionInfo);
    facilitySelect.addEventListener('input', updateFacilitySelectionInfo);
  }
  if (form) {
    form.addEventListener('submit', (event) => {
      void handleSubmit(event);
    });
  }
  void loadFacilities();
}
