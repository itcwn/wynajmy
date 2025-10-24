import { createSupabaseClient } from './config/supabaseClient.js';

const config = window.__SUPA;
if (!config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY) {
  throw new Error("Brak konfiguracji Supabase. Uzupełnij plik supabase-config.js.");
}

const supabase = createSupabaseClient(window.supabase, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

if (!supabase) {
  throw new Error('Nie udało się utworzyć klienta Supabase.');
}

const authSection = document.querySelector('#auth-section');
const propertySection = document.querySelector('#property-section');
const authMessage = document.querySelector('#auth-message');
const propertyMessage = document.querySelector('#property-message');
const loginForm = document.querySelector('#login-form');
const propertyForm = document.querySelector('#property-form');
const logoutButton = document.querySelector('#logout-button');

const showAuth = () => {
  authSection.classList.remove('hidden');
  propertySection.classList.add('hidden');
  loginForm.reset();
};

const showPropertyForm = (session) => {
  authSection.classList.add('hidden');
  propertySection.classList.remove('hidden');
  propertyMessage.textContent = `Zalogowano jako ${session.user.email}`;
  propertyMessage.classList.remove('text-rose-600');
  propertyMessage.classList.add('text-emerald-600');
};

const checkSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Błąd pobierania sesji', error);
    authMessage.textContent = 'Nie udało się pobrać sesji. Spróbuj ponownie.';
    return;
  }

  if (data.session) {
    showPropertyForm(data.session);
  } else {
    showAuth();
  }
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authMessage.textContent = '';

  const formData = new FormData(loginForm);
  const email = formData.get('email');
  const password = formData.get('password');

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    authMessage.textContent = error.message;
    return;
  }

  await checkSession();
});

logoutButton.addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    propertyMessage.textContent = error.message;
    propertyMessage.classList.remove('text-emerald-600');
    propertyMessage.classList.add('text-rose-600');
    return;
  }

  propertyMessage.textContent = 'Wylogowano pomyślnie.';
  propertyMessage.classList.remove('text-rose-600');
  propertyMessage.classList.add('text-slate-600');
  showAuth();
});

propertyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  propertyMessage.textContent = '';
  propertyMessage.classList.remove('text-rose-600', 'text-emerald-600', 'text-slate-600');

  const formData = new FormData(propertyForm);
  const payload = {
    title: formData.get('title'),
    address: formData.get('address'),
    description: formData.get('description'),
    price: parseFloat(formData.get('price')),
  };

  const { error } = await supabase.from('properties').insert(payload);

  if (error) {
    propertyMessage.textContent = `Błąd zapisu: ${error.message}`;
    propertyMessage.classList.add('text-rose-600');
    return;
  }

  propertyMessage.textContent = 'Nieruchomość została zapisana.';
  propertyMessage.classList.add('text-emerald-600');
  propertyForm.reset();
});

checkSession();

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showPropertyForm(session);
  } else {
    showAuth();
  }
});
