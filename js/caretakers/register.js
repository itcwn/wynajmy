import { createSupabaseClient } from '../config/supabaseClient.js';
import { $ } from '../utils/dom.js';

const supabase = createSupabaseClient();

const form = $('#caretakerForm');
const messageEl = $('#formMessage');
const emailInput = $('#email');
const loginInput = $('#login');
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

function sanitizePhone(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeEmail(value) {
  return value.trim().toLowerCase();
}

function updateLoginFromEmail() {
  if (!emailInput || !loginInput) {
    return;
  }
  loginInput.value = sanitizeEmail(emailInput.value || '');
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
  const password = String(formData.get('password') || '');
  const passwordConfirm = String(formData.get('passwordConfirm') || '');

  if (!firstName || !lastNameOrCompany || !phone || !email || !password) {
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

  try {
    const login = email;
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name_or_company: lastNameOrCompany,
          phone,
        },
      },
    });

    if (signUpError) {
      setMessage(signUpError.message || 'Nie udało się utworzyć konta opiekuna.', 'error');
      return;
    }

    const user = signUpData?.user;

    if (!user) {
      setMessage('Konto zostało utworzone, ale nie otrzymaliśmy danych użytkownika.', 'error');
      return;
    }

    const profilePayload = {
      id: user.id,
      first_name: firstName,
      last_name_or_company: lastNameOrCompany,
      phone,
      email,
      login,
    };

    const { error: profileError } = await supabase
      .from('caretakers')
      .upsert(profilePayload, { onConflict: 'id' });

    if (profileError) {
      setMessage(profileError.message || 'Nie udało się zapisać profilu opiekuna.', 'error');
      return;
    }

    form.reset();
    updateLoginFromEmail();
    const confirmationPending = !signUpData.session;
    const successMessage = confirmationPending
      ? 'Opiekun został zarejestrowany. Sprawdź skrzynkę e-mail, aby potwierdzić konto.'
      : 'Opiekun został zarejestrowany i może zalogować się do panelu.';
    setMessage(successMessage, 'success');
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

if (emailInput && loginInput) {
  updateLoginFromEmail();
  emailInput.addEventListener('input', () => {
    updateLoginFromEmail();
  });
  form?.addEventListener('reset', () => {
    updateLoginFromEmail();
  });
}
