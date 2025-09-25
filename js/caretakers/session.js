import { createSupabaseClient } from '../config/supabaseClient.js';
import { createCaretakerSupabaseClient } from './supabaseClient.js';

const PROFILE_COLUMNS = 'id, first_name, last_name_or_company, phone, email, login';

let baseSupabase = null;
let cachedSession = undefined;
let loadingPromise = null;
let authSubscription = null;

let lastCachedCaretakerId = null;
const profileCache = new Map();
const profilePromiseCache = new Map();

function normalizeCaretakerIdValue(caretakerId, { warn = false } = {}) {

  if (!caretakerId) {
    return null;
  }
  try {
    return String(caretakerId);
  } catch (error) {

    if (warn) {
      console.warn('Nie udało się znormalizować identyfikatora opiekuna:', error);
    }

    return null;
  }
}


function getProfileCacheKey(caretakerId) {
  return normalizeCaretakerIdValue(caretakerId, { warn: true });
}


function setProfileCacheEntry(caretakerId, profile) {
  const cacheKey = getProfileCacheKey(caretakerId);
  if (!cacheKey) {
    return;
  }
  if (profile) {
    profileCache.set(cacheKey, profile);
  } else {
    profileCache.delete(cacheKey);
  }
}

let pendingCaretakerId = null;

function clearProfileCache({ keepPendingCaretakerId = null } = {}) {
  profileCache.clear();
  profilePromiseCache.clear();
  lastCachedCaretakerId = null;
  pendingCaretakerId = keepPendingCaretakerId ? normalizeCaretakerIdValue(keepPendingCaretakerId) : null;
}

function updateLastCachedCaretakerId(caretakerId) {
  lastCachedCaretakerId = normalizeCaretakerIdValue(caretakerId) || null;
}

function computeDisplayName(firstName, lastNameOrCompany, fallback = '') {
  const parts = [];
  if (firstName) {
    parts.push(firstName);
  }
  if (lastNameOrCompany) {
    parts.push(lastNameOrCompany);
  }
  if (parts.length) {
    return parts.join(' ');
  }
  return fallback || '';
}

function ensureSupabaseClient() {
  if (!baseSupabase) {
    baseSupabase = createSupabaseClient();
    if (!baseSupabase) {
      return null;
    }
  }
  if (!authSubscription && baseSupabase?.auth?.onAuthStateChange) {
    const { data } = baseSupabase.auth.onAuthStateChange((event, session) => {
      const sessionCaretakerId = normalizeCaretakerIdValue(session?.user?.id || null);
      const normalizedPending = normalizeCaretakerIdValue(pendingCaretakerId);
      const normalizedLast = normalizeCaretakerIdValue(lastCachedCaretakerId);
      const effectiveNextCaretakerId = sessionCaretakerId ?? normalizedPending ?? null;
      const caretakerChanged =
        effectiveNextCaretakerId !== normalizedLast && effectiveNextCaretakerId !== normalizedPending;
      const signedOut = event === 'SIGNED_OUT' || (!sessionCaretakerId && !!normalizedLast);

      cachedSession = undefined;
      if (caretakerChanged || signedOut) {
        const pendingToKeep = signedOut ? null : effectiveNextCaretakerId;
        clearProfileCache({ keepPendingCaretakerId: pendingToKeep });
      } else {
        pendingCaretakerId = effectiveNextCaretakerId;
      }

      loadingPromise = buildCaretakerSession({ existingSession: session }).catch((error) => {
        console.warn('Nie udało się odświeżyć sesji opiekuna po zmianie stanu uwierzytelnienia.', error);
        cachedSession = null;
        return null;
      });
      clearProfileCache();
      loadingPromise.then((value) => {
        cachedSession = value ?? null;
        updateLastCachedCaretakerId(
          value?.caretakerId || value?.user?.id || effectiveNextCaretakerId || sessionCaretakerId || null
        );
        pendingCaretakerId = null;
      });
    });
    authSubscription = data?.subscription || null;
  }
  return baseSupabase;
}

export function getBaseSupabaseClient() {
  return ensureSupabaseClient();
}

function extractMetadata(user) {
  const metadata = user?.user_metadata || {};
  return {
    firstName: metadata.first_name || metadata.firstName || null,
    lastNameOrCompany: metadata.last_name_or_company || metadata.lastNameOrCompany || null,
    phone: metadata.phone || metadata.telephone || null,
    email: metadata.email || null,
    login: metadata.login || metadata.email || null,
  };
}

function buildClientPriorityList({ caretakerClient, baseClient }) {
  const clients = [];
  if (caretakerClient) {
    clients.push(caretakerClient);
  }
  if (baseClient) {
    clients.push(baseClient);
  }
  return clients;
}

async function fetchCaretakerProfile({ caretakerClient, baseClient }, caretakerId) {
  const cacheKey = getProfileCacheKey(caretakerId);
  if (!cacheKey) {
    return null;
  }

  if (profileCache.has(cacheKey)) {
    return profileCache.get(cacheKey);
  }

  if (profilePromiseCache.has(cacheKey)) {
    return profilePromiseCache.get(cacheKey);
  }

  const clients = buildClientPriorityList({ caretakerClient, baseClient });

  const loadingPromise = (async () => {
    for (const client of clients) {
      try {
        const { data, error } = await client
          .from('caretakers')
          .select(PROFILE_COLUMNS)
          .eq('id', caretakerId)
          .maybeSingle();
        if (error) {
          console.warn('Nie udało się pobrać profilu opiekuna:', error);
          continue;
        }
        if (data) {
          return data;
        }
      } catch (error) {
        console.warn('Nie udało się pobrać profilu opiekuna:', error);
      }
    }
    return null;
  })()
    .then((profile) => {
      setProfileCacheEntry(caretakerId, profile);
      return profile;
    })
    .finally(() => {
      profilePromiseCache.delete(cacheKey);
    });

  profilePromiseCache.set(cacheKey, loadingPromise);
  return loadingPromise;
}

async function ensureCaretakerProfile({ baseClient, caretakerClient, user }) {
  const caretakerId = user?.id || null;
  if (!caretakerId) {
    return null;
  }

  const existingProfile = await fetchCaretakerProfile({ caretakerClient, baseClient }, caretakerId);
  if (existingProfile) {
    setProfileCacheEntry(caretakerId, existingProfile);
    return existingProfile;
  }

  const metadata = extractMetadata(user);
  const payload = {
    id: caretakerId,
    first_name: metadata.firstName || '',
    last_name_or_company: metadata.lastNameOrCompany || '',
    phone: metadata.phone || '',
    email: user.email || metadata.email || '',
    login: (metadata.login || user.email || metadata.email || '').toLowerCase(),
  };

  if (!payload.first_name || !payload.last_name_or_company || !payload.phone || !payload.email) {
    console.warn('Brak pełnych danych do utworzenia profilu opiekuna.');
    return {
      id: caretakerId,
      first_name: payload.first_name || null,
      last_name_or_company: payload.last_name_or_company || null,
      phone: payload.phone || null,
      email: payload.email || null,
      login: payload.login || null,
    };
  }

  const clients = buildClientPriorityList({ caretakerClient, baseClient });
  for (const client of clients) {
    try {
      const { data, error } = await client
        .from('caretakers')
        .upsert(payload, { onConflict: 'id' })
        .select(PROFILE_COLUMNS)
        .maybeSingle();
      if (error) {
        console.warn('Nie udało się zapisać profilu opiekuna:', error);
        continue;
      }
      const storedProfile = data || payload;
      setProfileCacheEntry(caretakerId, storedProfile);
      return storedProfile;
    } catch (error) {
      console.warn('Nie udało się zapisać profilu opiekuna:', error);
    }
  }
  setProfileCacheEntry(caretakerId, payload);
  return payload;
}

function normalizeProfile(profile, fallbackMetadata, userEmail, caretakerId) {
  if (!profile && !fallbackMetadata) {
    return null;
  }
  const normalized = {
    id: profile?.id || caretakerId || null,
    first_name: profile?.first_name ?? fallbackMetadata?.firstName ?? null,
    last_name_or_company: profile?.last_name_or_company ?? fallbackMetadata?.lastNameOrCompany ?? null,
    phone: profile?.phone ?? fallbackMetadata?.phone ?? null,
    email: profile?.email ?? fallbackMetadata?.email ?? userEmail ?? null,
    login: profile?.login ?? fallbackMetadata?.login ?? fallbackMetadata?.email ?? userEmail ?? null,
  };
  if (!normalized.id) {
    normalized.id = null;
  }
  return normalized;
}

function buildSessionPayload({
  caretakerId,
  user,
  profile,
  baseClient,
  caretakerClient,
}) {
  const metadata = extractMetadata(user);
  const normalizedProfile = normalizeProfile(profile, metadata, user?.email || null, caretakerId);
  const firstName = normalizedProfile?.first_name || null;
  const lastNameOrCompany = normalizedProfile?.last_name_or_company || null;
  const email = normalizedProfile?.email || user?.email || '';
  const loginSource = normalizedProfile?.login || email;
  const login = loginSource ? String(loginSource).trim().toLowerCase() : '';
  const displayName = computeDisplayName(firstName, lastNameOrCompany, login);
  const caretakerSupabase = caretakerClient || (caretakerId ? createCaretakerSupabaseClient({ caretakerId }) : null);

  return {
    caretakerId,
    supabase: caretakerSupabase,
    baseSupabase: baseClient || null,
    authSession: null,
    user: user || null,
    profile: normalizedProfile,
    firstName,
    lastNameOrCompany,
    email,
    login,
    displayName,
    accessToken: null,
  };
}

async function buildCaretakerSession({ existingSession } = {}) {
  const client = ensureSupabaseClient();
  if (!client) {
    return null;
  }

  let authSession = existingSession || null;
  if (!authSession) {
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn('Nie udało się pobrać sesji Supabase:', error);
      return null;
    }
    authSession = data?.session || null;
  }

  if (!authSession) {
    return null;
  }

  const caretakerId = authSession.user?.id || null;
  const normalizedCaretakerId = normalizeCaretakerIdValue(caretakerId);
  pendingCaretakerId = normalizedCaretakerId || pendingCaretakerId || null;
  const caretakerClient = caretakerId ? createCaretakerSupabaseClient({ caretakerId }) : null;
  const profile = await ensureCaretakerProfile({ baseClient: client, caretakerClient, user: authSession.user });
  const session = buildSessionPayload({
    caretakerId,
    user: authSession.user,
    profile,
    baseClient: client,
    caretakerClient,
  });
  session.authSession = authSession;
  session.accessToken = authSession.access_token || null;
  return session;
}

export async function getCaretakerSession({ forceRefresh = false } = {}) {
  const client = ensureSupabaseClient();
  if (!client) {
    return null;
  }

  if (forceRefresh) {
    const expectedCaretakerId = normalizeCaretakerIdValue(
      cachedSession?.caretakerId ||
        cachedSession?.user?.id ||
        lastCachedCaretakerId ||
        pendingCaretakerId ||
        null
    );
    cachedSession = undefined;
    loadingPromise = null;
    clearProfileCache({ keepPendingCaretakerId: expectedCaretakerId });

  }

  if (cachedSession !== undefined && !forceRefresh) {
    return cachedSession;
  }

  if (!loadingPromise) {
    loadingPromise = buildCaretakerSession();
  }

  try {
    const session = await loadingPromise;
    cachedSession = session ?? null;
    updateLastCachedCaretakerId(cachedSession?.caretakerId || cachedSession?.user?.id || null);
    pendingCaretakerId = null;
    return cachedSession;
  } finally {
    loadingPromise = null;
  }
}

export async function requireCaretakerSession({ redirectTo, forceRefresh } = {}) {
  const session = await getCaretakerSession({ forceRefresh });
  if (!session && redirectTo) {
    window.location.replace(redirectTo);
  }
  return session;
}

export async function clearCaretakerSession() {
  const client = ensureSupabaseClient();
  if (!client) {
    cachedSession = undefined;
    loadingPromise = null;
    clearProfileCache();
    return;
  }
  try {
    const { error } = await client.auth.signOut();
    if (error) {
      console.warn('Nie udało się wylogować opiekuna:', error);
    }
  } catch (error) {
    console.warn('Nie udało się wylogować opiekuna:', error);
  } finally {
    cachedSession = null;
    loadingPromise = null;
    clearProfileCache();
  }
}

export function getCaretakerDisplayName(sessionLike) {
  if (!sessionLike) {
    return '';
  }
  if (sessionLike.displayName) {
    return sessionLike.displayName;
  }
  const firstName =
    sessionLike.firstName ??
    sessionLike.first_name ??
    sessionLike.profile?.first_name ??
    sessionLike.user?.user_metadata?.first_name ??
    sessionLike.user?.user_metadata?.firstName ??
    null;
  const lastNameOrCompany =
    sessionLike.lastNameOrCompany ??
    sessionLike.last_name_or_company ??
    sessionLike.profile?.last_name_or_company ??
    sessionLike.user?.user_metadata?.last_name_or_company ??
    sessionLike.user?.user_metadata?.lastNameOrCompany ??
    null;
  const login =
    sessionLike.login ||
    sessionLike.email ||
    sessionLike.profile?.email ||
    sessionLike.user?.email ||
    '';
  return computeDisplayName(firstName, lastNameOrCompany, login);
}

