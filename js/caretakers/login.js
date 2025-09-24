import { createSupabaseClient } from '../config/supabaseClient.js';
import {
  clearCaretakerSession,
  getCaretakerDisplayName,
  getCaretakerSession,
  saveCaretakerSession,
} from './session.js';
import { syncCaretakerBackendSession } from './backendSession.js';
import { $ } from '../utils/dom.js';

const supabase = createSupabaseClient();

const form = $('#caretakerLoginForm');
const messageEl = $('#caretakerLoginMessage');
const logoutBtn = $('#caretakerLogout');
const panelLink = $('#caretakerPanelLink');
const submitBtn = $('#caretakerLoginSubmit');
const loginInput = $('#caretakerLogin');

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
  const elements = form.querySelectorAll('input, button[type="submit"]');
  elements.forEach((element) => {
    element.disabled = disabled;
  });
}

function sanitizeLogin(value) {
  return value.trim().toLowerCase();
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const buffer = await window.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

async function fetchCaretakerByLogin(login) {
  if (!supabase) {
    return { data: null, error: new Error('Brak klienta Supabase.') };
  }
  try {
    const { data, error } = await supabase.rpc('caretaker_login_get', { p_login: login });
    if (error) {
      // Jeżeli funkcja RPC nie istnieje, spróbuj bezpośredniego zapytania (przydatne w środowisku developerskim).
      if (error?.message?.toLowerCase().includes('function') || error?.code === 'PGRST301') {
        const fallback = await supabase
          .from('caretakers')
          .select('id, login, password_hash, first_name, last_name_or_company')
          .ilike('login', login)
          .maybeSingle();
        return { data: fallback.data, error: fallback.error };
      }
      return { data: null, error };
    }
    if (Array.isArray(data)) {
      return { data: data[0] || null, error: null };
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

function updateUiForSession(session) {
  if (panelLink) {
    if (session) {
      panelLink.classList.remove('hidden');
    } else {
      panelLink.classList.add('hidden');
    }
  }
  if (logoutBtn) {
    if (session) {
      logoutBtn.classList.remove('hidden');
    } else {
      logoutBtn.classList.add('hidden');
    }
  }
}

function resolveRedirectTarget() {
  const defaultTarget = './editDescription.html';
  try {
    const params = new URLSearchParams(window.location.search);
    const redirectParam = params.get('redirect');
    if (!redirectParam) {
      return defaultTarget;
    }
    const url = new URL(redirectParam, window.location.origin);
    if (url.origin !== window.location.origin) {
      return defaultTarget;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch (error) {
    console.warn('Nie udało się zinterpretować adresu przekierowania:', error);
    return defaultTarget;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!form || !supabase || state.isSubmitting) {
    return;
  }
  const formData = new FormData(form);
  const loginRaw = String(formData.get('login') || '');
  const password = String(formData.get('password') || '');
  if (!loginRaw.trim() || !password) {
    setMessage('Podaj login i hasło.', 'error');
    return;
  }
  if (!window.crypto?.subtle) {
    setMessage('Ta przeglądarka nie obsługuje bezpiecznego logowania (WebCrypto).', 'error');
    return;
  }

  state.isSubmitting = true;
  toggleFormDisabled(true);
  setMessage('Sprawdzanie danych logowania...', 'info');

  try {
    const login = sanitizeLogin(loginRaw);
    const { data: caretaker, error } = await fetchCaretakerByLogin(login);
    if (error) {
      console.error('Błąd RPC logowania opiekuna:', error);
      setMessage('Nie udało się zweryfikować danych logowania. Spróbuj ponownie później.', 'error');
      return;
    }
    if (!caretaker || !caretaker.password_hash) {
      setMessage('Nieprawidłowy login lub hasło.', 'error');
      return;
    }
    const passwordHash = await hashPassword(password);
    if (passwordHash !== caretaker.password_hash) {
      setMessage('Nieprawidłowy login lub hasło.', 'error');
      return;
    }
    const { session, token } = await saveCaretakerSession(caretaker);
    updateUiForSession(session);
    if (token) {
      try {
        await syncCaretakerBackendSession(token);
      } catch (syncError) {
        console.warn('Nie udało się przekazać sesji do backendu:', syncError);
      }
    }
    const displayName = getCaretakerDisplayName(session) || session.login;
    setMessage(`Zalogowano jako ${displayName}. Przekierowanie...`, 'success');
    const redirectTarget = resolveRedirectTarget();
    window.setTimeout(() => {
      window.location.href = redirectTarget;
    }, 600);
  } catch (error) {
    console.error('Błąd logowania opiekuna:', error);
    setMessage('Wystąpił nieoczekiwany błąd podczas logowania.', 'error');
  } finally {
    state.isSubmitting = false;
    toggleFormDisabled(false);
  }
}

function handleLogout() {
  clearCaretakerSession();
  updateUiForSession(null);
  if (form) {
    form.reset();
  }
  if (loginInput) {
    loginInput.focus();
  }
  setMessage('Sesja została zakończona. Zaloguj się ponownie, aby kontynuować.', 'info');
}

async function init() {
  if (!form) {
    return;
  }
  if (!supabase) {
    setMessage('Brak konfiguracji Supabase. Uzupełnij plik supabase-config.js.', 'error');
    toggleFormDisabled(true);
    return;
  }
  if (!window.crypto?.subtle) {
    setMessage('Ta przeglądarka nie obsługuje bezpiecznego logowania (WebCrypto).', 'error');
    toggleFormDisabled(true);
    return;
  }
  const session = await getCaretakerSession();
  if (session) {
    updateUiForSession(session);
    const displayName = getCaretakerDisplayName(session) || session.login;
    setMessage(`Jesteś już zalogowany jako ${displayName}.`, 'info');
  }
}

if (form) {
  form.addEventListener('submit', (event) => {
    void handleSubmit(event);
  });
}

logoutBtn?.addEventListener('click', () => {
  handleLogout();
});

if (!submitBtn) {
  console.warn('Nie odnaleziono przycisku logowania opiekuna.');
}

void init();
