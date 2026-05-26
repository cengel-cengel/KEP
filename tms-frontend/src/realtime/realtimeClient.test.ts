import { describe, expect, it, beforeEach, vi } from 'vitest';

// socket.io-client `io()` muss VOR dem Import des SUT gestubbt werden.
const ioMock = vi.fn();
vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => ioMock(...args),
  Socket: class {},
}));

import {
  getClientId,
  _resetRealtimeClient,
  connectRealtime,
  disconnectRealtime,
} from './realtimeClient';

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

function installLocalStorageMock(initialToken?: string) {
  const map = new Map<string, string>();
  if (initialToken) map.set('tms_token', initialToken);
  (globalThis as any).localStorage = {
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

describe('connectRealtime — Singleton-Guard (PERF-Fix)', () => {
  beforeEach(() => {
    installSessionStorageMock();
    installLocalStorageMock('jwt-test-token');
    _resetRealtimeClient();
    ioMock.mockReset();
    // Stub-Socket mit on()/disconnect()/disconnected-Flag, das wie ein
    // mid-handshake socket aussieht (connected=false, disconnected=false).
    ioMock.mockImplementation(() => ({
      connected: false,
      disconnected: false,
      on: vi.fn(),
      disconnect: vi.fn(),
    }));
  });

  it('zweiter connectRealtime waehrend Handshake erzeugt KEIN zweites Socket', () => {
    connectRealtime();
    connectRealtime();
    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it('connectRealtime nach disconnectRealtime erzeugt neues Socket', () => {
    connectRealtime();
    expect(ioMock).toHaveBeenCalledTimes(1);
    disconnectRealtime();
    connectRealtime();
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  it('Transport-Liste enthaelt NUR websocket (kein polling-Handshake)', () => {
    connectRealtime();
    const opts = ioMock.mock.calls[0][1] as { transports: string[] };
    expect(opts.transports).toEqual(['websocket']);
  });
});
