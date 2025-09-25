import { createSupabaseClient } from '../config/supabaseClient.js';
import { createCaretakerSupabaseClient } from './supabaseClient.js';

const PROFILE_COLUMNS = 'id, first_name, last_name_or_company, phone, email';

let baseSupabase = null;
let cachedSession = undefined;
let loadingPromise = null;
let authSubscription = null;

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
    const { data } = baseSupabase.auth.onAuthStateChange((_event, session) => {
      cachedSession = undefined;
      loadingPromise = buildCaretakerSession({ existingSession: session }).catch((error) => {
        console.warn('Nie udało się odświeżyć sesji opiekuna po zmianie stanu uwierzytelnienia.', error);
        cachedSession = null;
        return null;
      });
      loadingPromise.then((value) => {
        cachedSession = value ?? null;
      });
    });
    authSubscription = data?.subscription || null;
  }
  return baseSupabase;
}

function extractMetadata(user) {
  const metadata = user?.user_metadata || {};
  return {
    firstName: metadata.first_name || metadata.firstName || null,
    lastNameOrCompany: metadata.last_name_or_company || metadata.lastNameOrCompany || null,
    phone: metadata.phone || metadata.telephone || null,
    email: metadata.email || null,
  };
}

async function fetchCaretakerProfile(client, caretakerId) {
  if (!client || !caretakerId) {
    return null;
  }
  try {
    const { data, error } = await client
      .from('caretakers')
      .select(PROFILE_COLUMNS)
      .eq('id', caretakerId)
      .maybeSingle();
    if (error) {
      console.warn('Nie udało się pobrać profilu opiekuna:', error);
      return null;
    }
    return data || null;
  } catch (error) {
    console.warn('Nie udało się pobrać profilu opiekuna:', error);
    return null;
  }
}

async function ensureCaretakerProfile(client, user) {
  const caretakerId = user?.id || null;
  if (!client || !caretakerId) {
    return null;
  }

  const existingProfile = await fetchCaretakerProfile(client, caretakerId);
  if (existingProfile) {
    return existingProfile;
  }

  const metadata = extractMetadata(user);
  const payload = {
    id: caretakerId,
    first_name: metadata.firstName || '',
    last_name_or_company: metadata.lastNameOrCompany || '',
    phone: metadata.phone || '',
    email: user.email || metadata.email || '',
  };

  if (!payload.first_name || !payload.last_name_or_company || !payload.phone || !payload.email) {
    console.warn('Brak pełnych danych do utworzenia profilu opiekuna.');
    return {
      id: caretakerId,
      first_name: payload.first_name || null,
      last_name_or_company: payload.last_name_or_company || null,
      phone: payload.phone || null,
      email: payload.email || null,
    };
  }

  try {
    const { data, error } = await client
      .from('caretakers')
      .upsert(payload, { onConflict: 'id' })
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) {
      console.warn('Nie udało się zapisać profilu opiekuna:', error);
      return payload;
    }
    return data || payload;
  } catch (error) {
    console.warn('Nie udało się zapisać profilu opiekuna:', error);
    return payload;
  }
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
}) {
  const metadata = extractMetadata(user);
  const normalizedProfile = normalizeProfile(profile, metadata, user?.email || null, caretakerId);
  const firstName = normalizedProfile?.first_name || null;
  const lastNameOrCompany = normalizedProfile?.last_name_or_company || null;
  const email = normalizedProfile?.email || user?.email || '';
  const login = email ? String(email).trim().toLowerCase() : '';
  const displayName = computeDisplayName(firstName, lastNameOrCompany, login);
  const caretakerSupabase = caretakerId ? createCaretakerSupabaseClient({ caretakerId }) : null;

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
  const profile = await ensureCaretakerProfile(client, authSession.user);
  const session = buildSessionPayload({ caretakerId, user: authSession.user, profile, baseClient: client });
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
    cachedSession = undefined;
    loadingPromise = null;
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

