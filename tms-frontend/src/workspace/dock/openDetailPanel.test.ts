/**
 * S-5 Smoke fuer openDetailPanel (Hybrid Single-Swap + Multi-Tab).
 *
 * Was geprueft wird
 *  · Erstaufruf (single) → addPanel mit id='detail', position direction:'right'
 *  · Zweitaufruf (single, andere Entity) → kein addPanel (Panel
 *    existiert); setActive() ruft (Single-Swap-Verhalten geht ueber
 *    usePanel().entity, das hier nicht getestet wird).
 *  · Multi-Aufruf erster → addPanel mit id='detail-tour-X'
 *  · Multi-Aufruf zweiter, gleiche Entity → KEIN doppeltes addPanel,
 *    nur setActive()
 *  · Re-Klick (egal welcher Modus) duplicate nichts.
 *  · Bei vorhandener Detail-Group: 2. Multi-Panel → position.referenceGroup
 */
import { describe, expect, it, vi } from 'vitest';
import { openDetailPanel } from './openDetailPanel';

function makeApi(initialPanels: Array<{ id: string; group: { id: string } }> = []) {
  const panels = new Map<string, ReturnType<typeof makePanel>>();
  for (const p of initialPanels) panels.set(p.id, makePanel(p.id, p.group));
  const addPanel = vi.fn((opts: { id: string; position?: unknown; params?: unknown }) => {
    const groupId = `group-${opts.id}`;
    const p = makePanel(opts.id, { id: groupId });
    panels.set(opts.id, p);
    return p;
  });
  const api = {
    panels: { values: () => panels.values() },
    getPanel: vi.fn((id: string) => panels.get(id) ?? null),
    getGroup: vi.fn((_id: string) => null),
    addPanel,
    // Iteration ueber api.panels in openDetailPanel: das Helper-File
    // nutzt `for (const panel of api.panels)`. Wir geben das Map als
    // Iterable.
  };
  // openDetailPanel iteriert via `for (const panel of api.panels)`.
  // Zwingt uns api.panels muss iterierbar sein. Wir geben Array.
  (api as unknown as { panels: unknown }).panels = Array.from(panels.values());
  return { api, panels };
}

function makePanel(id: string, group: { id: string }) {
  return {
    id,
    group,
    api: {
      setActive: vi.fn(),
      setTitle: vi.fn(),
    },
  };
}

describe('openDetailPanel', () => {
  it('Single (default): id="detail" + position direction:"right"', () => {
    const { api } = makeApi();
    openDetailPanel(api as unknown as Parameters<typeof openDetailPanel>[0], 'tour', 'T-1', 'fv');
    expect(api.addPanel).toHaveBeenCalledTimes(1);
    expect(api.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'detail',
        component: 'panel',
        position: { direction: 'right' },
        params: expect.objectContaining({
          panelId: 'detail',
          entityType: 'tour',
          entityId: 'T-1',
          mode: 'fv',
        }),
      }),
    );
  });

  it('Single + Re-Klick: bestehendes Panel → setActive, kein addPanel', () => {
    const initial = [{ id: 'detail', group: { id: 'g-detail' } }];
    const { api, panels } = makeApi(initial);
    openDetailPanel(
      api as unknown as Parameters<typeof openDetailPanel>[0],
      'tour',
      'T-2',
      'fv',
    );
    expect(api.addPanel).not.toHaveBeenCalled();
    expect(panels.get('detail')!.api.setActive).toHaveBeenCalledTimes(1);
  });

  it('Multi: id="detail-tour-T-1", erster Klick → addPanel', () => {
    const { api } = makeApi();
    openDetailPanel(
      api as unknown as Parameters<typeof openDetailPanel>[0],
      'tour',
      'T-1',
      'fv',
      { multi: true },
    );
    expect(api.addPanel).toHaveBeenCalledTimes(1);
    expect(api.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'detail-tour-T-1' }),
    );
  });

  it('Multi: gleiche Entity zweimal → kein Duplikat', () => {
    const initial = [
      { id: 'detail-tour-T-1', group: { id: 'g-detail' } },
    ];
    const { api, panels } = makeApi(initial);
    openDetailPanel(
      api as unknown as Parameters<typeof openDetailPanel>[0],
      'tour',
      'T-1',
      'fv',
      { multi: true },
    );
    expect(api.addPanel).not.toHaveBeenCalled();
    expect(panels.get('detail-tour-T-1')!.api.setActive).toHaveBeenCalled();
  });

  it('Multi mit existierender Detail-Group: 2. Multi-Panel referenziert die Group', () => {
    // Erste detail-Group existiert via 'detail' single-Panel.
    const initial = [{ id: 'detail', group: { id: 'g-detail-existing' } }];
    const { api } = makeApi(initial);
    openDetailPanel(
      api as unknown as Parameters<typeof openDetailPanel>[0],
      'shipment',
      'S-9',
      'fv',
      { multi: true },
    );
    expect(api.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'detail-shipment-S-9',
        position: { referenceGroup: { id: 'g-detail-existing' } },
      }),
    );
  });
});
