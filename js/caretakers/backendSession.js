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

function createAbortReason(message) {
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function attachExternalSignal(controller, signal) {
  if (!signal || !controller || typeof controller.abort !== 'function') {
    return;
  }
  if (signal.aborted) {
    controller.abort(signal.reason);
    return;
  }
  const abortHandler = () => {
    controller.abort(signal.reason);
  };
  signal.addEventListener('abort', abortHandler, { once: true });
}

function getPayloadSignature(payload) {
  try {
    return JSON.stringify(payload);
  } catch (error) {
    console.warn('Nie udało się zserializować payloadu sesji do synchronizacji:', error);
    return null;
  }
}

const activeSyncState = {
  controller: null,
  promise: null,
  payloadSignature: null,
};

function resetActiveSyncState(promiseRef) {
  if (promiseRef && activeSyncState.promise !== promiseRef) {
    return;
  }
  activeSyncState.controller = null;
  activeSyncState.promise = null;
  activeSyncState.payloadSignature = null;
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

  const payloadSignature = getPayloadSignature(payload);

  if (activeSyncState.promise && payloadSignature && activeSyncState.payloadSignature === payloadSignature) {
    attachExternalSignal(activeSyncState.controller, signal);
    return activeSyncState.promise;
  }

  if (activeSyncState.controller) {
    try {
      activeSyncState.controller.abort(createAbortReason('Nowa próba synchronizacji sesji opiekuna.'));
    } catch (abortError) {
      console.warn('Nie udało się anulować poprzedniej synchronizacji sesji:', abortError);
    }
  }

  const controller = new AbortController();
  attachExternalSignal(controller, signal);

  const rawPromise = (async () => {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
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
      if (error?.name !== 'AbortError') {
        console.error('Błąd synchronizacji sesji z backendem:', error);
      }
      throw error;
    }
  })();

  const trackedPromise = rawPromise.finally(() => {
    resetActiveSyncState(trackedPromise);
  });

  activeSyncState.controller = controller;
  activeSyncState.promise = trackedPromise;
  activeSyncState.payloadSignature = payloadSignature;

  return trackedPromise;
}

export default syncCaretakerBackendSession;
