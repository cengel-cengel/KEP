import { describe, expect, it, beforeEach } from 'vitest';
import { getClientId, _resetRealtimeClient } from './realtimeClient';

// In-Memory sessionStorage-Mock (vitest läuft im Node ohne DOM).
function installSessionStorageMock() {
  const map = new Map<string, string>();
  (globalThis as any).window = (globalThis as any).window ?? {};
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
    clear: () => map.clear(),
  };
}

describe('getClientId', () => {
  beforeEach(() => {
    installSessionStorageMock();
    _resetRealtimeClient();
  });

  it('persistiert über mehrere Calls', () => {
    const a = getClientId();
    const b = getClientId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });

  it('UUID-Format wenn crypto.randomUUID verfügbar', () => {
    const id = getClientId();
    // UUID v4 hat 36 Chars (32 hex + 4 dashes) ODER cid-fallback
    expect(id.length).toBeGreaterThanOrEqual(20);
    // UUID-Format ODER cid-Fallback
    expect(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(id) ||
        /^cid-/.test(id),
    ).toBe(true);
  });
});
