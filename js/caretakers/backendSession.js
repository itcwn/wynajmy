import { BACKEND_SET_SESSION_PATH, resolveBackendUrl } from '../config/backendClient.js';

function isJsonResponse(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  return typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');
}

function normalizeSessionPayload(sessionLike) {
  if (!sessionLike) {
    return null;
  }

  if (typeof sessionLike === 'string') {
    console.warn(
      'syncCaretakerBackendSession oczekuje obiektu z polami accessToken/refreshToken. Otrzymano string – traktuję jako access token.'
    );
    return { accessToken: sessionLike };
  }

  if (typeof sessionLike !== 'object') {
    return null;
  }

  const accessToken = sessionLike.accessToken || sessionLike.access_token || null;
  const refreshToken = sessionLike.refreshToken || sessionLike.refresh_token || null;
  const userId = sessionLike.userId || sessionLike.user_id || null;

  if (!accessToken) {
    return null;
  }

  const payload = {
    access_token: accessToken,
  };

  if (refreshToken) {
    payload.refresh_token = refreshToken;
  }

  if (userId) {
    payload.user_id = userId;
  }

  return payload;
}

export async function syncCaretakerBackendSession(sessionTokens, { signal } = {}) {
  const payload = normalizeSessionPayload(sessionTokens);
  if (!payload) {
    return null;
  }

  const endpoint = resolveBackendUrl(BACKEND_SET_SESSION_PATH);
  if (!endpoint) {
    console.warn('Nie udało się określić adresu backendu do synchronizacji sesji.');
    return null;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      const error = new Error(
        `Backend sesji zwrócił błąd ${response.status}: ${response.statusText || 'Nieznany błąd'}`
      );
      if (details) {
        error.details = details;
      }
      throw error;
    }

    if (isJsonResponse(response)) {
      return response.json().catch(() => null);
    }
    return null;
  } catch (error) {
    console.error('Błąd synchronizacji sesji z backendem:', error);
    throw error;
  }
}

export default syncCaretakerBackendSession;
