import axios from 'axios';

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
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export { AUTH_TOKEN_KEY };
