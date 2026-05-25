/**
 * Pure-Tests fuer den Auth-Bridge (lib/authBridge.ts).
 *
 * Was geprueft wird:
 *  - install + notify-Roundtrip ruft den Handler einmal
 *  - install(null) entfernt den Handler
 *  - notifyUnauthorized ohne Bridge → returns false (Fallback-Pfad
 *    im api-Interceptor)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installAuthBridge, notifyUnauthorized } from './authBridge';

afterEach(() => {
  installAuthBridge(null);
});

describe('authBridge', () => {
  it('install + notify ruft Handler', () => {
    const spy = vi.fn();
    installAuthBridge({ onUnauthorized: spy });
    const handled = notifyUnauthorized();
    expect(handled).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('install(null) entfernt Handler → notify returns false', () => {
    installAuthBridge({ onUnauthorized: vi.fn() });
    installAuthBridge(null);
    expect(notifyUnauthorized()).toBe(false);
  });

  it('ohne installierte Bridge → notify returns false (Fallback-Pfad)', () => {
    expect(notifyUnauthorized()).toBe(false);
  });

  it('Re-install ueberschreibt vorigen Handler', () => {
    const first = vi.fn();
    const second = vi.fn();
    installAuthBridge({ onUnauthorized: first });
    installAuthBridge({ onUnauthorized: second });
    notifyUnauthorized();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
