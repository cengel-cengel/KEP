import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AUTH_TOKEN_KEY } from '../lib/api';
import {
  connectRealtime,
  disconnectRealtime,
} from '../realtime/realtimeClient';

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getInitialToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getInitialToken);

  const login = useCallback((newToken: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, newToken);
    setToken(newToken);
    // PERF-1: Realtime-Connect nach Login (token jetzt da).
    connectRealtime();
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
    disconnectRealtime();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: !!token,
      login,
      logout,
    }),
    [token, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

/**
 * Optional-Variant — Fallback wenn KEIN AuthProvider gemountet
 * ist (z.B. Render-Tests). Returns { isAuthenticated: true } als
 * sicheren Default damit Test-Render-Trees ohne AuthProvider
 * weiterhin funktionieren (WorkspaceProvider URL-Sync läuft dann
 * wie zuvor). Im Prod-Tree IST AuthProvider immer da (main.tsx).
 */
export function useAuthOptional(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      isAuthenticated: true,
      login: () => {},
      logout: () => {},
    };
  }
  return ctx;
}
