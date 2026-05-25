/**
 * Auth-Fix-B: 401-Soft-Redirect-Pfad in lib/api.ts.
 *
 *  1. 401 mit Bridge installiert → notifyUnauthorized() ruft Bridge
 *     (kein window.location-Fallback).
 *  2. 401 ohne Bridge → window.location.replace('/login') Fallback.
 *  3. 401 auf /auth/login → KEIN Redirect (Login-Page zeigt Fehler
 *     lokal).
 *
 * Wir testen den Interceptor direkt: api ist axios-Singleton; wir
 * stubben axios-internals via dispatch-Helper, der den error-handler
 * mit einem AxiosError-Shape aufruft.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../realtime/realtimeClient', () => ({
  getClientId: () => 'test-client',
}));

import { api } from './api';
import { installAuthBridge } from './authBridge';

type Handlers = {
  ok: (response: unknown) => unknown;
  err: (error: unknown) => unknown;
};

function getInterceptorHandlers(): Handlers {
  // axios speichert die Interceptor-Handler im `handlers`-Array.
  // Wir nehmen den letzten registrierten (= unsere 401-Logik aus
  // api.ts) — Index 0, da api.ts genau einen response-Interceptor
  // installiert.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr: Array<{ fulfilled: unknown; rejected: unknown }> = (
    api.interceptors.response as unknown as {
      handlers: Array<{ fulfilled: unknown; rejected: unknown }>;
    }
  ).handlers;
  const h = arr[0];
  return {
    ok: h.fulfilled as (r: unknown) => unknown,
    err: h.rejected as (e: unknown) => unknown,
  };
}

function makeError(opts: { url?: string; status?: number }): unknown {
  return {
    config: { url: opts.url ?? '/some/endpoint' },
    response: { status: opts.status ?? 401, data: {} },
    isAxiosError: true,
  };
}

let replaceMock: ReturnType<typeof vi.fn>;
let originalLocation: Location;
beforeEach(() => {
  localStorage.setItem('tms_token', 'tok-a');
  // jsdom-Quirk: window.location.replace ist nicht via spyOn
  // re-definierbar. Property komplett neu setzen.
  originalLocation = window.location;
  replaceMock = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: {
      ...originalLocation,
      replace: replaceMock,
    },
  });
});

afterEach(() => {
  installAuthBridge(null);
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
  localStorage.clear();
});

describe('api.ts 401-Interceptor — Auth-Fix-B', () => {
  it('401 mit installierter Bridge → onUnauthorized() ruft, KEIN window.location', async () => {
    const onUnauth = vi.fn();
    installAuthBridge({ onUnauthorized: onUnauth });

    const { err } = getInterceptorHandlers();
    await expect(
      Promise.resolve(err(makeError({ status: 401 }))),
    ).rejects.toBeTruthy();

    expect(onUnauth).toHaveBeenCalledTimes(1);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('tms_token')).toBeNull();
  });

  it('401 OHNE Bridge → window.location.replace("/login")-Fallback', async () => {
    const { err } = getInterceptorHandlers();
    await expect(
      Promise.resolve(err(makeError({ status: 401 }))),
    ).rejects.toBeTruthy();

    expect(replaceMock).toHaveBeenCalledWith('/login');
    expect(localStorage.getItem('tms_token')).toBeNull();
  });

  it('401 auf /auth/login → KEIN Redirect, KEIN logout (Whitelist)', async () => {
    const onUnauth = vi.fn();
    installAuthBridge({ onUnauthorized: onUnauth });

    const { err } = getInterceptorHandlers();
    await expect(
      Promise.resolve(err(makeError({ url: '/auth/login', status: 401 }))),
    ).rejects.toBeTruthy();

    expect(onUnauth).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    // localStorage bleibt unangetastet → LoginPage kann Wrong-PW-
    // Inline-Error zeigen.
    expect(localStorage.getItem('tms_token')).toBe('tok-a');
  });

  it('non-401-Error wird unveraendert weitergereicht', async () => {
    const onUnauth = vi.fn();
    installAuthBridge({ onUnauthorized: onUnauth });

    const { err } = getInterceptorHandlers();
    await expect(
      Promise.resolve(err(makeError({ status: 500 }))),
    ).rejects.toBeTruthy();

    expect(onUnauth).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('tms_token')).toBe('tok-a');
  });
});
