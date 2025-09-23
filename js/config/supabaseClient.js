const SUPABASE_URL = window.__SUPA?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.__SUPA?.SUPABASE_ANON_KEY;
const GOOGLE_MAPS_API_KEY = window.__SUPA?.GOOGLE_MAPS_API_KEY || null;

export function createSupabaseClient(arg1 = window.supabase, arg2 = undefined) {
  let supabaseLib = arg1;
  let options = arg2;

  if (supabaseLib && typeof supabaseLib === 'object' && typeof supabaseLib.createClient !== 'function') {
    options = supabaseLib;
    supabaseLib = window.supabase;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    alert('Brak konfiguracji Supabase — uzupełnij supabase-config.js');
    return null;
  }
  if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
    console.error(
      'Supabase SDK niezaładowany. Dodaj: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script> przed skryptem głównym.'
    );
    return null;
  }

  return supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
}

export { SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_MAPS_API_KEY };
