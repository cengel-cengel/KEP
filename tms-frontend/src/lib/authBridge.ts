/**
 * Auth-Bridge zwischen lib/api.ts (axios-Interceptor) und
 * store/auth.tsx (AuthProvider Context).
 *
 * Hintergrund: api.ts ist React-frei und liest Token aus
 * localStorage. Der Interceptor kann KEINE Context-Aktionen (logout,
 * navigate) direkt aufrufen. Diese Bridge stellt ein einfaches
 * Slot-Pattern bereit:
 *
 *   - AuthProvider installiert in useEffect einen Handler
 *     (onUnauthorized = logout() + navigate('/login')).
 *   - api.ts-Interceptor ruft den Handler bei 401, mit Hard-Reload
 *     als Fallback (z.B. wenn AuthProvider noch nicht gemountet
 *     ist oder im Test ausserhalb des React-Trees).
 *
 * Vermeidet Circular-Import api.ts ↔ store/auth.tsx (kein React-
 * Code hier).
 */

export interface AuthBridge {
  onUnauthorized?: () => void;
}

let bridge: AuthBridge | null = null;

export function installAuthBridge(b: AuthBridge | null): void {
  bridge = b;
}

export function notifyUnauthorized(): boolean {
  if (bridge?.onUnauthorized) {
    bridge.onUnauthorized();
    return true;
  }
  return false;
}
