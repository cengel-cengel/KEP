import axios from 'axios';
import { getClientId } from '../realtime/realtimeClient';
import { notifyUnauthorized } from './authBridge';

const AUTH_TOKEN_KEY = 'tms_token';

const baseURL = import.meta.env.VITE_API_URL;

if (!baseURL && import.meta.env.PROD) {
  console.error(
    '[API] VITE_API_URL ist nicht gesetzt - ' +
      'Login wird nicht funktionieren. ' +
      'Vercel ENV setzen und redeployen.',
  );
}

export const api = axios.create({
  baseURL: baseURL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // PERF-1: X-Client-Id für No-Self-Event Filter im Realtime-Layer.
  config.headers['X-Client-Id'] = getClientId();
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url: string =
        (error.config && typeof error.config.url === 'string'
          ? error.config.url
          : '') || '';
      // Auth-Fix-B Whitelist: 401 auf /auth/login NICHT abfangen —
      // LoginPage zeigt Wrong-Password lokal als Inline-Fehler.
      if (!url.includes('/auth/login')) {
        // Auth-Fix-B Soft-Redirect: AuthProvider-Bridge feuert
        // logout() + navigate('/login'). Wenn keine Bridge
        // installiert (App noch nicht gemountet, Test ausserhalb
        // React-Tree) → window.location.replace als Fallback
        // (replace statt href: kein extra History-Eintrag).
        localStorage.removeItem(AUTH_TOKEN_KEY);
        const handled = notifyUnauthorized();
        if (!handled && typeof window !== 'undefined') {
          window.location.replace('/login');
        }
      }
    }
    return Promise.reject(error);
  }
);

export { AUTH_TOKEN_KEY };
