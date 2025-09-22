import { createSupabaseClient } from '../config/supabaseClient.js';
import { $ } from '../utils/dom.js';

const supabase = createSupabaseClient();

const form = $('#caretakerForm');
const messageEl = $('#formMessage');
const state = {
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

  if (!firstName || !lastNameOrCompany || !phone || !email || !loginRaw || !password) {
    setMessage('Uzupełnij wszystkie wymagane pola formularza.', 'error');
    return;
  }

  if (password !== passwordConfirm) {
    setMessage('Hasła muszą być identyczne.', 'error');
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

    form.reset();
    setMessage('Opiekun został zarejestrowany.', 'success');
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
} else if (form) {
  form.addEventListener('submit', (event) => {
    void handleSubmit(event);
  });
}
