const RAW_BACKEND_API_URL = window.__SUPA?.BACKEND_API_URL || window.__SUPA?.BACKEND_URL || '';
const BACKEND_API_URL = typeof RAW_BACKEND_API_URL === 'string' ? RAW_BACKEND_API_URL.trim() : '';

const DEFAULT_SESSION_PATH = '/api/auth/set-session';
const RAW_SESSION_PATH = window.__SUPA?.BACKEND_SET_SESSION_PATH || window.__SUPA?.BACKEND_SESSION_ENDPOINT;
const BACKEND_SET_SESSION_PATH = typeof RAW_SESSION_PATH === 'string' && RAW_SESSION_PATH.trim()
  ? RAW_SESSION_PATH.trim()
  : DEFAULT_SESSION_PATH;

export function resolveBackendUrl(path = '/') {
  const targetPath = typeof path === 'string' && path.trim() ? path.trim() : '/';
  if (!BACKEND_API_URL) {
    return targetPath;
  }
  try {
    return new URL(targetPath, BACKEND_API_URL).toString();
  } catch (error) {
    console.warn('Nie udało się zbudować adresu backendu:', error);
    return targetPath;
  }
}

export { BACKEND_API_URL, BACKEND_SET_SESSION_PATH };

export default {
  BACKEND_API_URL,
  BACKEND_SET_SESSION_PATH,
  resolveBackendUrl,
};
