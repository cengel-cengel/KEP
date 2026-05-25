import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { AUTH_TOKEN_KEY } from '../lib/api';
import { installAuthBridge } from '../lib/authBridge';
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
  // useRef-Spiegel fuer storage-Handler — vermeidet stale-Closure,
  // weil der Listener nur 1× pro Mount registriert wird.
  const tokenRef = useRef<string | null>(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // useNavigate kann nur innerhalb von <BrowserRouter> aufgerufen
  // werden — main.tsx mountet AuthProvider INNERHALB BrowserRouter,
  // also OK. Fuer Test-Render-Trees ohne Router gibt's den Hard-
  // Reload-Fallback im 401-Pfad.
  const navigate = useNavigate();

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

  // Auth-Fix-A: Multi-Tab-Sync via storage-Event. Browser feuert
  // 'storage' nur in ANDEREN Tabs (nicht im selben), daher kein
  // Echo-Risiko bei lokalem login/logout. tokenRef.current liest
  // den aktuellen Wert, da der Listener nur einmal registriert
  // wird (Mount).
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== AUTH_TOKEN_KEY) return;
      if (e.newValue === null && tokenRef.current !== null) {
        // Anderer Tab hat ausgeloggt → lokal mitziehen.
        setToken(null);
        disconnectRealtime();
      } else if (e.newValue && e.newValue !== tokenRef.current) {
        // Anderer Tab hat eingeloggt / Token rotiert.
        setToken(e.newValue);
        connectRealtime();
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Auth-Fix-B: Bridge fuer api.ts-Interceptor. Bei 401 ruft die
  // Bridge logout() + navigate('/login') — Soft-Redirect statt
  // window.location-Hard-Reload (Context bleibt sauber, Realtime-
  // Disconnect laeuft sicher durch).
  useEffect(() => {
    installAuthBridge({
      onUnauthorized: () => {
        logout();
        navigate('/login', { replace: true });
      },
    });
    return () => installAuthBridge(null);
  }, [logout, navigate]);

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
