import { SUPABASE_ANON_KEY } from '../config/supabaseClient.js';

const CARETAKER_SESSION_STORAGE_KEY = 'caretaker.session.v1';

function getBrowserStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    if (window.localStorage) {
      return window.localStorage;
    }
  } catch (error) {
    console.warn('Nie można uzyskać dostępu do localStorage:', error);
  }
  try {
    if (window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch (error) {
    console.warn('Nie można uzyskać dostępu do sessionStorage:', error);
  }
  return null;
}

function encodeBase64(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function decodeBase64(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function safeStringEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  let mismatch = a.length === b.length ? 0 : 1;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0 && a.length === b.length;
}

function computeDisplayName(firstName, lastNameOrCompany, login) {
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
  return login || '';
}

function buildPayload(caretaker, issuedAt = Date.now()) {
  const caretakerId = caretaker?.caretakerId || caretaker?.id || null;
  const login = caretaker?.login || '';
  const firstName = caretaker?.first_name ?? caretaker?.firstName ?? null;
  const lastNameOrCompany = caretaker?.last_name_or_company ?? caretaker?.lastNameOrCompany ?? null;
  const displayName = caretaker?.displayName || computeDisplayName(firstName, lastNameOrCompany, login);
  return {
    version: 1,
    caretakerId,
    login,
    firstName,
    lastNameOrCompany,
    displayName,
    issuedAt,
  };
}

function normalizePayload(payload) {
  if (!payload) {
    return null;
  }
  const caretakerId = payload.caretakerId ?? payload.id ?? null;
  const login = payload.login || '';
  const firstName = payload.firstName ?? payload.first_name ?? null;
  const lastNameOrCompany = payload.lastNameOrCompany ?? payload.last_name_or_company ?? null;
  const displayName = payload.displayName || computeDisplayName(firstName, lastNameOrCompany, login);
  const issuedAt = payload.issuedAt ?? payload.iat ?? null;
  return {
    version: payload.version ?? 1,
    caretakerId,
    login,
    firstName,
    lastNameOrCompany,
    displayName,
    issuedAt,
  };
}

function encodeToken(tokenObject) {
  return encodeBase64(JSON.stringify(tokenObject));
}

function decodeToken(tokenString) {
  const json = decodeBase64(tokenString);
  return JSON.parse(json);
}

async function importSigningKey(secretOverride) {
  if (!window.crypto?.subtle) {
    throw new Error('WebCrypto API jest wymagane do podpisywania tokenów.');
  }
  const secretSource = secretOverride || SUPABASE_ANON_KEY || 'caretaker-session-fallback-secret';
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretSource);
  return window.crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signPayload(payload, secretOverride) {
  const key = await importSigningKey(secretOverride);
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const signature = await window.crypto.subtle.sign('HMAC', key, data);
  return bufferToBase64(signature);
}

async function verifySignature(payload, signature, secretOverride) {
  const expected = await signPayload(payload, secretOverride);
  return safeStringEquals(expected, signature);
}

function buildTokenObject(payload, signature) {
  return { payload, signature };
}

function extractSessionFromTokenObject(tokenObject) {
  if (!tokenObject || typeof tokenObject !== 'object') {
    return null;
  }
  return normalizePayload(tokenObject.payload);
}

export async function saveCaretakerSession(caretaker, { storage = getBrowserStorage(), secret } = {}) {
  if (!storage) {
    throw new Error('Brak dostępu do przeglądarkowego storage.');
  }
  const payload = buildPayload(caretaker);
  const signature = await signPayload(payload, secret);
  const tokenObject = buildTokenObject(payload, signature);
  const token = encodeToken(tokenObject);
  storage.setItem(CARETAKER_SESSION_STORAGE_KEY, token);
  return { session: payload, token };
}

export function clearCaretakerSession({ storage = getBrowserStorage() } = {}) {
  if (!storage) {
    return;
  }
  storage.removeItem(CARETAKER_SESSION_STORAGE_KEY);
}

export async function getCaretakerSession({ storage = getBrowserStorage(), secret } = {}) {
  if (!storage) {
    return null;
  }
  const token = storage.getItem(CARETAKER_SESSION_STORAGE_KEY);
  if (!token) {
    return null;
  }
  try {
    const decoded = decodeToken(token);
    const payload = decoded?.payload;
    const signature = decoded?.signature;
    if (!payload || !signature) {
      storage.removeItem(CARETAKER_SESSION_STORAGE_KEY);
      return null;
    }
    const isValid = await verifySignature(payload, signature, secret);
    if (!isValid) {
      storage.removeItem(CARETAKER_SESSION_STORAGE_KEY);
      return null;
    }
    return normalizePayload(payload);
  } catch (error) {
    console.warn('Nie udało się odczytać sesji opiekuna:', error);
    storage.removeItem(CARETAKER_SESSION_STORAGE_KEY);
    return null;
  }
}

export function getCaretakerSessionToken({ storage = getBrowserStorage() } = {}) {
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(CARETAKER_SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn('Nie udało się pobrać tokenu sesji opiekuna:', error);
    return null;
  }
}

export function decodeCaretakerSessionToken(token) {
  if (!token) {
    return null;
  }
  try {
    const decoded = decodeToken(token);
    return extractSessionFromTokenObject(decoded);
  } catch (error) {
    console.warn('Nie udało się zdekodować tokenu sesji opiekuna:', error);
    return null;
  }
}

export async function requireCaretakerSession({ redirectTo, storage, secret } = {}) {
  const session = await getCaretakerSession({ storage, secret });
  if (!session && redirectTo) {
    window.location.replace(redirectTo);
  }
  return session;
}

export function getCaretakerDisplayName(sessionLike) {
  if (!sessionLike) {
    return '';
  }
  if (sessionLike.displayName) {
    return sessionLike.displayName;
  }
  return computeDisplayName(sessionLike.firstName, sessionLike.lastNameOrCompany, sessionLike.login);
}

export { CARETAKER_SESSION_STORAGE_KEY };
