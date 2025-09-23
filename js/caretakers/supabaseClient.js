import { createSupabaseClient } from '../config/supabaseClient.js';

function normalizeCaretakerId(caretakerId) {
  if (!caretakerId) {
    return '';
  }
  if (typeof caretakerId === 'string') {
    return caretakerId.trim();
  }
  try {
    return String(caretakerId).trim();
  } catch (error) {
    console.warn('Nie udało się znormalizować identyfikatora opiekuna:', error);
    return '';
  }
}

function mergeGlobalOptions(baseOptions = {}, caretakerId) {
  const options = typeof baseOptions === 'object' && baseOptions !== null ? { ...baseOptions } : {};
  const globalOptions = typeof options.global === 'object' && options.global !== null ? { ...options.global } : {};
  const headers = typeof globalOptions.headers === 'object' && globalOptions.headers !== null
    ? { ...globalOptions.headers }
    : {};

  if (caretakerId) {
    headers['x-caretaker-id'] = caretakerId;
    headers['X-Caretaker-Id'] = caretakerId;
  }

  return {
    ...options,
    global: {
      ...globalOptions,
      headers,
    },
  };
}

export function createCaretakerSupabaseClient({ caretakerId, supabaseLib, options } = {}) {
  const normalizedId = normalizeCaretakerId(caretakerId);
  if (!normalizedId) {
    console.error('Brak identyfikatora opiekuna w sesji. Nie można utworzyć klienta Supabase z nagłówkiem autoryzacyjnym.');
    return null;
  }

  const mergedOptions = mergeGlobalOptions(options, normalizedId);

  if (supabaseLib) {
    return createSupabaseClient(supabaseLib, mergedOptions);
  }
  return createSupabaseClient(mergedOptions);
}

export default createCaretakerSupabaseClient;
