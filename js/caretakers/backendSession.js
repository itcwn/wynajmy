import { BACKEND_SET_SESSION_PATH, resolveBackendUrl } from '../config/backendClient.js';

function isJsonResponse(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  return typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');
}

export async function syncCaretakerBackendSession(token, { signal } = {}) {
  if (!token) {
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
      body: JSON.stringify({ token }),
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
