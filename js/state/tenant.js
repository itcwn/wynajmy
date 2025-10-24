const TENANT_STORAGE_KEY = 'sowa:tenant-id';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidTenantId(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return UUID_PATTERN.test(value.trim());
}

function normalizeTenantId(value) {
  if (!isValidTenantId(value)) {
    return null;
  }
  return value.trim().toLowerCase();
}

function readTenantFromStorage() {
  try {
    const stored = window.localStorage.getItem(TENANT_STORAGE_KEY);
    return normalizeTenantId(stored);
  } catch (error) {
    console.warn('Nie udało się odczytać identyfikatora najemcy z localStorage.', error);
    return null;
  }
}

function writeTenantToStorage(value) {
  try {
    if (value) {
      window.localStorage.setItem(TENANT_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(TENANT_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Nie udało się zapisać identyfikatora najemcy w localStorage.', error);
  }
}

function readTenantFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryTenant = params.get('tenant') || params.get('tenant_id') || params.get('tenantId');
    return normalizeTenantId(queryTenant);
  } catch (error) {
    console.warn('Nie udało się odczytać identyfikatora najemcy z parametrów adresu URL.', error);
    return null;
  }
}

function readTenantFromConfig() {
  if (window.__SUPA && typeof window.__SUPA.TENANT_ID === 'string') {
    return normalizeTenantId(window.__SUPA.TENANT_ID);
  }
  return null;
}

const listeners = new Set();

let currentTenantId = (function initialiseTenant() {
  const fromQuery = readTenantFromQuery();
  if (fromQuery) {
    writeTenantToStorage(fromQuery);
    return fromQuery;
  }
  const fromStorage = readTenantFromStorage();
  if (fromStorage) {
    return fromStorage;
  }
  const fromConfig = readTenantFromConfig();
  if (fromConfig) {
    return fromConfig;
  }
  return null;
})();

function notifyListeners(nextTenantId) {
  listeners.forEach((listener) => {
    try {
      listener(nextTenantId);
    } catch (error) {
      console.warn('Błąd podczas powiadamiania słuchacza o zmianie najemcy.', error);
    }
  });
}

export function getTenantId() {
  return currentTenantId;
}

export function setTenantId(nextTenantId, { persist = true } = {}) {
  const normalized = normalizeTenantId(nextTenantId);
  if (normalized === currentTenantId) {
    if (persist) {
      writeTenantToStorage(normalized);
    }
    return currentTenantId;
  }
  currentTenantId = normalized;
  if (persist) {
    writeTenantToStorage(normalized);
  }
  notifyListeners(currentTenantId);
  return currentTenantId;
}

export function clearTenantId() {
  setTenantId(null, { persist: true });
}

export function subscribeTenantChange(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function extractTenantIdFromPayload(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return normalizeTenantId(value);
  }
  if (typeof value === 'object') {
    if (value.tenant_id) {
      return normalizeTenantId(value.tenant_id);
    }
    if (value.tenantId) {
      return normalizeTenantId(value.tenantId);
    }
  }
  return null;
}

export function inferTenantIdFromFacility(facility) {
  return extractTenantIdFromPayload(facility);
}

export function inferTenantIdFromUser(user) {
  if (!user) {
    return null;
  }
  const fromAppMetadata = extractTenantIdFromPayload(user.app_metadata);
  if (fromAppMetadata) {
    return fromAppMetadata;
  }
  const fromUserMetadata = extractTenantIdFromPayload(user.user_metadata);
  if (fromUserMetadata) {
    return fromUserMetadata;
  }
  if (Array.isArray(user.app_metadata?.tenants)) {
    for (const value of user.app_metadata.tenants) {
      const candidate = extractTenantIdFromPayload(value);
      if (candidate) {
        return candidate;
      }
    }
  }
  return null;
}

async function resolveTenantViaRpc(supabase, rpcName, payload) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    return null;
  }
  try {
    const { data, error } = await supabase.rpc(rpcName, payload || {});
    if (error) {
      console.warn(`Nie udało się rozpoznać najemcy (${rpcName}).`, error);
      return null;
    }
    return normalizeTenantId(data);
  } catch (error) {
    console.warn(`Nie udało się rozpoznać najemcy (${rpcName}).`, error);
    return null;
  }
}

export async function resolveTenantIdForFacility({ supabase, facilityId }) {
  if (!facilityId) {
    return null;
  }
  return resolveTenantViaRpc(supabase, 'resolve_tenant_for_facility', { p_facility_id: facilityId });
}

export async function resolveTenantIdForBookingToken({ supabase, token }) {
  if (!token) {
    return null;
  }
  return resolveTenantViaRpc(supabase, 'resolve_tenant_for_booking_token', { p_token: token });
}

export async function resolveTenantIdForCaretaker({ supabase, caretakerId }) {
  if (!caretakerId) {
    return null;
  }
  return resolveTenantViaRpc(supabase, 'resolve_tenant_for_caretaker', { p_caretaker_id: caretakerId });
}

export { normalizeTenantId, isValidTenantId };

