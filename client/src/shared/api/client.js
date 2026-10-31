/**
 * Axios instance with transparent access-token refresh.
 *
 * The access token lives in memory (Zustand) and the refresh token lives in an
 * httpOnly cookie the browser sends automatically. When a request 401s, we
 * refresh once and replay the request, so an expiring access token never
 * surfaces to the user as a logout.
 */
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
  timeout: 20_000,
});

let accessToken = null;
let onSessionLost = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setSessionLostHandler(handler) {
  onSessionLost = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/** Concurrent 401s must not each fire their own refresh. */
let refreshPromise = null;

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${api.defaults.baseURL}/auth/refresh`, null, { withCredentials: true })
      .then((res) => {
        const { accessToken: next, user } = res.data?.data ?? {};
        if (!next) throw new Error('Refresh failed');
        accessToken = next;
        return { accessToken: next, user };
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    // Never attempt to refresh the refresh call itself — that would loop.
    const isAuthRoute = original?.url?.includes('/auth/refresh');
    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      try {
        await refreshAccessToken();
        return api(original);
      } catch {
        accessToken = null;
        onSessionLost?.();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Normalises an axios error into a message the UI can show directly.
 * @param {any} error
 * @param {string} [fallback]
 */
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (axios.isCancel?.(error)) return '';

  const data = error?.response?.data;
  if (data?.message) {
    // Surface the first field error when the summary is generic.
    if (data.errors?.length && /highlighted fields/i.test(data.message)) {
      return data.errors[0].message;
    }
    return data.message;
  }
  if (error?.code === 'ECONNABORTED') return 'That took too long. Check your connection and try again.';
  if (!error?.response) return 'Cannot reach the server. Is the API running?';
  return fallback;
}

/** Field-level errors keyed by field name, for react-hook-form. */
export function fieldErrors(error) {
  const list = error?.response?.data?.errors ?? [];
  return Object.fromEntries(list.map((e) => [e.field, e.message]));
}

export { refreshAccessToken };
