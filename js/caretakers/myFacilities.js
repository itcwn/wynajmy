import { getCaretakerSession } from './session.js';

function isPermissionError(error) {
  if (!error) {
    return false;
  }
  const code = String(error.code || '').toUpperCase();
  if (code === '42501' || code === 'PGRST301') {
    return true;
  }
  if (typeof error.message === 'string' && /permission denied/i.test(error.message)) {
    return true;
  }
  return false;
}

function normalizeColumns(columns) {
  if (typeof columns === 'string' && columns.trim()) {
    return columns.trim();
  }
  return '*';
}

function ensureUniqueClients(session) {
  const list = [];
  if (session?.supabase) {
    list.push(session.supabase);
  }
  if (session?.baseSupabase && session.baseSupabase !== session.supabase) {
    list.push(session.baseSupabase);
  }
  return list.filter(Boolean);
}

function normalizeFacilityIds(rows) {
  const ids = new Set();
  (rows || []).forEach((row) => {
    if (row && row.facility_id !== null && row.facility_id !== undefined) {
      ids.add(String(row.facility_id));
    }
  });
  return Array.from(ids);
}

function cloneFacilities(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => ({ ...(row || {}) }));
}

const cache = {
  caretakerId: null,
  facilityIds: undefined,
  facilityIdsPromise: null,
  facilitiesByColumns: new Map(),
  facilitiesPromises: new Map(),
  preferredClient: null,
};

function resetCache() {
  cache.facilityIds = undefined;
  cache.facilityIdsPromise = null;
  cache.facilitiesByColumns.clear();
  cache.facilitiesPromises.clear();
  cache.preferredClient = null;
}

function ensureCacheForCaretaker(caretakerId) {
  if (!caretakerId) {
    resetCache();
    cache.caretakerId = null;
    return;
  }
  if (cache.caretakerId !== caretakerId) {
    cache.caretakerId = caretakerId;
    resetCache();
  }
}

async function fetchFacilityIds(session) {
  const caretakerId = session?.caretakerId || null;
  if (!caretakerId) {
    return [];
  }
  const clients = ensureUniqueClients(session);
  let lastPermissionError = null;
  for (const client of clients) {
    try {
      const { data, error } = await client
        .from('facility_caretakers')
        .select('facility_id')
        .eq('caretaker_id', caretakerId);
      if (error) {
        throw error;
      }
      cache.preferredClient = client;
      return normalizeFacilityIds(data);
    } catch (error) {
      if (isPermissionError(error)) {
        lastPermissionError = error;
        continue;
      }
      throw error;
    }
  }
  if (lastPermissionError) {
    throw lastPermissionError;
  }
  return [];
}

async function fetchFacilities(session, columns, ids) {
  const uniqueIds = Array.from(new Set(ids));
  if (!uniqueIds.length) {
    return [];
  }
  const clients = [];
  if (cache.preferredClient) {
    clients.push(cache.preferredClient);
  }
  for (const client of ensureUniqueClients(session)) {
    if (!clients.includes(client)) {
      clients.push(client);
    }
  }
  let lastPermissionError = null;
  for (const client of clients) {
    try {
      const query = client.from('facilities').select(columns).in('id', uniqueIds).order('name');
      const { data, error } = await query;
      if (error) {
        throw error;
      }
      cache.preferredClient = client;
      return cloneFacilities(data || []);
    } catch (error) {
      if (isPermissionError(error)) {
        lastPermissionError = error;
        continue;
      }
      throw error;
    }
  }
  if (lastPermissionError) {
    throw lastPermissionError;
  }
  return [];
}

export function clearMyFacilitiesCache() {
  cache.caretakerId = null;
  resetCache();
}

export function getMyFacilitiesClient() {
  return cache.preferredClient || null;
}

export async function loadMyFacilityIds({ forceRefresh = false } = {}) {
  const session = await getCaretakerSession();
  const caretakerId = session?.caretakerId || null;
  ensureCacheForCaretaker(caretakerId);
  if (!caretakerId) {
    return [];
  }
  if (forceRefresh) {
    cache.facilityIds = undefined;
    cache.facilityIdsPromise = null;
  }
  if (cache.facilityIds !== undefined && !forceRefresh) {
    return Array.from(cache.facilityIds);
  }
  if (!cache.facilityIdsPromise) {
    cache.facilityIdsPromise = fetchFacilityIds(session);
  }
  try {
    const ids = await cache.facilityIdsPromise;
    cache.facilityIds = Array.from(ids);
    return Array.from(cache.facilityIds);
  } finally {
    cache.facilityIdsPromise = null;
  }
}

export async function loadMyFacilities({ columns, forceRefresh = false } = {}) {
  const session = await getCaretakerSession();
  const caretakerId = session?.caretakerId || null;
  ensureCacheForCaretaker(caretakerId);
  if (!caretakerId) {
    return [];
  }
  const columnKey = normalizeColumns(columns);
  if (forceRefresh) {
    cache.facilityIds = undefined;
    cache.facilityIdsPromise = null;
    cache.facilitiesByColumns.delete(columnKey);
    cache.facilitiesPromises.delete(columnKey);
  }
  const ids = await loadMyFacilityIds({ forceRefresh: false });
  if (!ids.length) {
    cache.facilitiesByColumns.set(columnKey, []);
    cache.facilitiesPromises.delete(columnKey);
    return [];
  }
  if (cache.facilitiesByColumns.has(columnKey) && !forceRefresh) {
    return cloneFacilities(cache.facilitiesByColumns.get(columnKey));
  }
  if (!cache.facilitiesPromises.has(columnKey)) {
    cache.facilitiesPromises.set(
      columnKey,
      fetchFacilities(session, columnKey, ids).then((rows) => {
        cache.facilitiesByColumns.set(columnKey, cloneFacilities(rows));
        return cloneFacilities(rows);
      })
    );
  }
  try {
    const facilities = await cache.facilitiesPromises.get(columnKey);
    cache.facilitiesByColumns.set(columnKey, cloneFacilities(facilities));
    return cloneFacilities(facilities);
  } finally {
    cache.facilitiesPromises.delete(columnKey);
  }
}

export default {
  loadMyFacilityIds,
  loadMyFacilities,
  clearMyFacilitiesCache,
  getMyFacilitiesClient,
};
