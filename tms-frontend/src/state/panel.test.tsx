/**
 * S-5 PanelProvider → Detail-Panel-Bridge.
 *
 * Was geprueft wird
 *  · selectTour ohne installierte Dock-API: nur Context-State
 *    geaendert (kein Crash, kein Side-Effect).
 *  · selectTour mit Dock-API: openDetailPanel triggert addPanel.
 *  · selectTour({multi:true}): andere Panel-ID (mit Suffix).
 *  · selectShipment + selectNvTour: gleiches Muster.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PanelProvider, usePanel } from './panel';
import { installDockBridge } from '../lib/dockBridge';

function wrapper({ children }: { children: ReactNode }) {
  return <PanelProvider>{children}</PanelProvider>;
}

function makeApi() {
  const addPanel = vi.fn();
  const getPanel = vi.fn(() => null);
  const api = {
    panels: [],
    getPanel,
    getGroup: vi.fn(() => null),
    addPanel,
  };
  return { api, addPanel };
}

afterEach(() => {
  installDockBridge(null);
  localStorage.clear();
});

describe('PanelProvider — selectXxx + Detail-Bridge', () => {
  it('selectTour ohne installierte Bridge: Context geaendert, kein Crash', () => {
    const { result } = renderHook(() => usePanel(), { wrapper });
    act(() => result.current.selectTour('T-1'));
    expect(result.current.entity).toEqual({ type: 'tour', id: 'T-1' });
  });

  it('selectTour mit Bridge: addPanel mit id="detail" (single-swap)', () => {
    const { api, addPanel } = makeApi();
    // @ts-expect-error — Stub-Surface deckt nicht das volle DockviewApi
    installDockBridge(api);
    const { result } = renderHook(() => usePanel(), { wrapper });
    act(() => result.current.selectTour('T-1'));
    expect(addPanel).toHaveBeenCalledTimes(1);
    expect(addPanel.mock.calls[0][0]).toMatchObject({
      id: 'detail',
      params: { entityType: 'tour', entityId: 'T-1', mode: 'fv' },
    });
  });

  it('selectTour({multi:true}) → eigene Panel-ID', () => {
    const { api, addPanel } = makeApi();
    // @ts-expect-error
    installDockBridge(api);
    const { result } = renderHook(() => usePanel(), { wrapper });
    act(() => result.current.selectTour('T-2', { multi: true }));
    expect(addPanel.mock.calls[0][0]).toMatchObject({
      id: 'detail-tour-T-2',
    });
  });

  it('selectNvTour → mode="nv" in params', () => {
    const { api, addPanel } = makeApi();
    // @ts-expect-error
    installDockBridge(api);
    const { result } = renderHook(() => usePanel(), { wrapper });
    act(() => result.current.selectNvTour('NV-T-3'));
    expect(addPanel.mock.calls[0][0]).toMatchObject({
      params: { entityType: 'nv-tour', entityId: 'NV-T-3', mode: 'nv' },
    });
  });

  it('selectShipment → entityType="shipment"', () => {
    const { api, addPanel } = makeApi();
    // @ts-expect-error
    installDockBridge(api);
    const { result } = renderHook(() => usePanel(), { wrapper });
    act(() => result.current.selectShipment('S-7'));
    expect(addPanel.mock.calls[0][0]).toMatchObject({
      params: { entityType: 'shipment', entityId: 'S-7' },
    });
  });
});
