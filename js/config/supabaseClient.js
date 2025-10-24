import { getTenantId } from '../state/tenant.js';

const SUPABASE_URL = window.__SUPA?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.__SUPA?.SUPABASE_ANON_KEY;
const GOOGLE_MAPS_API_KEY = window.__SUPA?.GOOGLE_MAPS_API_KEY || null;

function toHeaders(initHeaders) {
  if (!initHeaders) {
    return new Headers();
  }
  if (initHeaders instanceof Headers) {
    return new Headers(initHeaders);
  }
  if (Array.isArray(initHeaders)) {
    return new Headers(initHeaders);
  }
  return new Headers(Object.entries(initHeaders));
}

function headersToPlainObject(headers) {
  const plain = {};
  headers.forEach((value, key) => {
    plain[key] = value;
  });
  return plain;
}

function buildTenantAwareFetch(baseFetch, staticHeaders) {
  if (typeof baseFetch !== 'function') {
    return null;
  }
  const normalizedStatic = toHeaders(staticHeaders);
  return (input, init = {}) => {
    const requestHeaders = toHeaders(init.headers);
    normalizedStatic.forEach((value, key) => {
      if (!requestHeaders.has(key)) {
        requestHeaders.set(key, value);
      }
    });
    const tenantId = getTenantId();
    if (tenantId) {
      requestHeaders.set('x-tenant-id', tenantId);
    } else {
      requestHeaders.delete('x-tenant-id');
    }
    const finalInit = { ...init, headers: requestHeaders };
    return baseFetch(input, finalInit);
  };
}

function withTenantHeaders(options) {
  const baseOptions = options ? { ...options } : {};
  const baseGlobal = baseOptions.global ? { ...baseOptions.global } : {};
  const staticHeaders = toHeaders(baseGlobal.headers);
  const tenantId = getTenantId();
  if (tenantId) {
    staticHeaders.set('x-tenant-id', tenantId);
  } else {
    staticHeaders.delete('x-tenant-id');
  }

  const baseFetch = baseGlobal.fetch || (typeof fetch === 'function' ? fetch.bind(window) : null);
  const tenantAwareFetch = buildTenantAwareFetch(baseFetch, staticHeaders);

  baseGlobal.headers = headersToPlainObject(staticHeaders);
  if (tenantAwareFetch) {
    baseGlobal.fetch = tenantAwareFetch;
  }

  baseOptions.global = baseGlobal;
  return baseOptions;
}

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

  const resolvedOptions = withTenantHeaders(options);

  return supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, resolvedOptions);
}

export { SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_MAPS_API_KEY };
