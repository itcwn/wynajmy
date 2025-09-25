import { createSupabaseClient } from '../config/supabaseClient.js';
import { clearCaretakerSession, getCaretakerDisplayName, getCaretakerSession } from './session.js';
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

  state.isSubmitting = true;
  toggleFormDisabled(true);
  setMessage('Trwa logowanie...', 'info');

  try {
    const login = sanitizeLogin(loginRaw);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: login,
      password,
    });

    if (error) {
      console.error('Nie udało się zalogować opiekuna:', error);
      const message = error?.message || 'Nie udało się zalogować. Sprawdź dane logowania i spróbuj ponownie.';
      setMessage(message, 'error');
      return;
    }

    const authSession = data?.session || null;
    if (!authSession) {
      setMessage('Logowanie wymaga potwierdzenia adresu e-mail. Sprawdź swoją skrzynkę pocztową.', 'info');
      return;
    }

    const session = await getCaretakerSession({ forceRefresh: true });
    updateUiForSession(session);

    const token = session?.accessToken || authSession.access_token || null;
    if (token) {
      try {
        await syncCaretakerBackendSession(token);
      } catch (syncError) {
        console.warn('Nie udało się przekazać sesji do backendu:', syncError);
      }
    }

    const displayName = getCaretakerDisplayName(session) || session?.login || login;
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

async function handleLogout() {
  await clearCaretakerSession();
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
  const session = await getCaretakerSession();
  if (session) {
    updateUiForSession(session);
    const displayName = getCaretakerDisplayName(session) || session?.login;
    setMessage(`Jesteś już zalogowany jako ${displayName}.`, 'info');
  }
}

if (form) {
  form.addEventListener('submit', (event) => {
    void handleSubmit(event);
  });
}

logoutBtn?.addEventListener('click', () => {
  void handleLogout();
});

if (!submitBtn) {
  console.warn('Nie odnaleziono przycisku logowania opiekuna.');
}

void init();
