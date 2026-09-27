import axios, { AxiosError } from 'axios';

const API_BASE_URL = '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * In-flight refresh, shared by every 401 so a burst of parallel requests triggers
 * exactly one rotation.
 */
let refreshPromise: Promise<string> | null = null;

/** Dispatched instead of a hard navigation so the SPA can redirect in-app. */
export const SESSION_EXPIRED_EVENT = 'fra:session-expired';

export function clearStoredSession(): void {
  localStorage.removeItem('fams_access_token');
  localStorage.removeItem('fams_refresh_token');
  localStorage.removeItem('fams_user');
  localStorage.removeItem('fams_employee');
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

// Request interceptor injecting JWT and CSRF token if present
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fams_access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const csrfToken = getCsrfToken();
    if (csrfToken && config.headers) {
      config.headers['X-CSRFToken'] = csrfToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor handling 401
//
// SIMPLE_JWT runs with ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION, so every
// successful refresh returns a NEW refresh token and immediately blacklists the one
// we just sent. The rotated token MUST be persisted, otherwise the next refresh
// replays a blacklisted token, fails, and wipes the session for good.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    const refreshToken = localStorage.getItem('fams_refresh_token');

    if (!refreshToken) {
      clearStoredSession();
      return Promise.reject(error);
    }

    // Single-flight guard: many components can 401 at once on a page load. With
    // rotation enabled, firing one refresh per failed request means the 2nd+ calls
    // send an already-blacklisted token and destroy a perfectly valid session.
    if (!refreshPromise) {
      refreshPromise = axios
        .post(`${API_BASE_URL}/auth/token/refresh/`, { refresh: refreshToken })
        .then((res) => {
          const newAccess = res.data.access;
          if (!newAccess) {
            throw new Error('Refresh response did not include an access token.');
          }
          localStorage.setItem('fams_access_token', newAccess);
          // Persist the rotated refresh token; discarding it is what caused the
          // guaranteed logout on the following refresh.
          if (res.data.refresh) {
            localStorage.setItem('fams_refresh_token', res.data.refresh);
          }
          return newAccess;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    try {
      const newAccess = await refreshPromise;
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      }
      return apiClient(originalRequest);
    } catch {
      clearStoredSession();
      return Promise.reject(error);
    }
  }
);

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data) {
      if (typeof data === 'string') return data;
      if (data.detail) return data.detail;
      if (data.non_field_errors && data.non_field_errors.length > 0) return data.non_field_errors[0];
      const firstKey = Object.keys(data)[0];
      if (firstKey) {
        const val = data[firstKey];
        if (Array.isArray(val) && val.length > 0) return `${firstKey}: ${val[0]}`;
        return `${firstKey}: ${val}`;
      }
    }
    return error.message || 'An unexpected error occurred. Please try again.';
  }
  return 'Network error. Please check connection.';
}
