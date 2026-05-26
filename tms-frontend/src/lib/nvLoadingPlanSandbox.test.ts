/**
 * Schritt 2 Test: NV-Beladeplan Sandbox-Reducer.
 *
 * Pure-Function Tests — kein React-Rendering. Sicherstellen dass jeder
 * Action-Typ State korrekt + immutable transformiert, damit der
 * Übernehmen-Pfad bei jeder Aenderungs-Kombination deterministisch
 * ausgefuehrt werden kann.
 *
 * KRITISCH (Carlos-Akzeptanz): "Übernehmen muss vollstaendig + korrekt
 * persistieren". Reducer-State ist die Single-Source-of-Truth fuer
 * Übernehmen — wenn der Reducer fehlerhaft akkumuliert, gehen Daten
 * verloren beim Persist.
 */
import { describe, expect, it } from 'vitest';
import {
  initialSandboxState,
  sandboxReducer,
  sandboxChangeCount,
  isSandboxEmpty,
} from './nvLoadingPlanSandbox';

const pos = { posXCm: 100, posYCm: 200, posZCm: 0 };

describe('sandboxReducer', () => {
  it('Initial-State ist leer', () => {
    expect(initialSandboxState.positionOverrides.size).toBe(0);
    expect(initialSandboxState.ejectedShipmentIds.size).toBe(0);
    expect(initialSandboxState.insertedShipmentIds.size).toBe(0);
    expect(isSandboxEmpty(initialSandboxState)).toBe(true);
    expect(sandboxChangeCount(initialSandboxState)).toBe(0);
  });

  describe('setPosition', () => {
    it('fuegt Override hinzu', () => {
      const s = sandboxReducer(initialSandboxState, {
        type: 'setPosition',
        dbItemId: 'i-1',
        pos,
      });
      expect(s.positionOverrides.size).toBe(1);
      expect(s.positionOverrides.get('i-1')).toEqual(pos);
    });

    it('ueberschreibt existierenden Override (Drag erneut)', () => {
      const s1 = sandboxReducer(initialSandboxState, {
        type: 'setPosition',
        dbItemId: 'i-1',
        pos,
      });
      const s2 = sandboxReducer(s1, {
        type: 'setPosition',
        dbItemId: 'i-1',
        pos: { posXCm: 50, posYCm: 60, posZCm: 70 },
      });
      expect(s2.positionOverrides.size).toBe(1);
      expect(s2.positionOverrides.get('i-1')).toEqual({
        posXCm: 50,
        posYCm: 60,
        posZCm: 70,
      });
    });

    it('immutable: neuer State, alter unveraendert', () => {
      const s1 = sandboxReducer(initialSandboxState, {
        type: 'setPosition',
        dbItemId: 'i-1',
        pos,
      });
      expect(initialSandboxState.positionOverrides.size).toBe(0);
      expect(s1).not.toBe(initialSandboxState);
      expect(s1.positionOverrides).not.toBe(
        initialSandboxState.positionOverrides,
      );
    });

    it('rotationDeg wird durchgereicht', () => {
      const s = sandboxReducer(initialSandboxState, {
        type: 'setPosition',
        dbItemId: 'i-1',
        pos: { ...pos, rotationDeg: 90 },
      });
      expect(s.positionOverrides.get('i-1')?.rotationDeg).toBe(90);
    });
  });

  describe('clearPosition', () => {
    it('entfernt Override', () => {
      const s1 = sandboxReducer(initialSandboxState, {
        type: 'setPosition',
        dbItemId: 'i-1',
        pos,
      });
      const s2 = sandboxReducer(s1, {
        type: 'clearPosition',
        dbItemId: 'i-1',
      });
      expect(s2.positionOverrides.size).toBe(0);
    });

    it('no-op wenn Override nicht existiert (identische Reference)', () => {
      const s = sandboxReducer(initialSandboxState, {
        type: 'clearPosition',
        dbItemId: 'i-999',
      });
      expect(s).toBe(initialSandboxState);
    });
  });

  describe('eject', () => {
    it('fuegt shipmentId hinzu', () => {
      const s = sandboxReducer(initialSandboxState, {
        type: 'eject',
        shipmentId: 'sh-1',
      });
      expect(s.ejectedShipmentIds.has('sh-1')).toBe(true);
      expect(s.ejectedShipmentIds.size).toBe(1);
    });

    it('no-op wenn schon ejected (identische Reference)', () => {
      const s1 = sandboxReducer(initialSandboxState, {
        type: 'eject',
        shipmentId: 'sh-1',
      });
      const s2 = sandboxReducer(s1, {
        type: 'eject',
        shipmentId: 'sh-1',
      });
      expect(s2).toBe(s1);
    });
  });

  describe('eject auf inserted (Schritt 4 — Drag OnTour→Parkplatz)', () => {
    it('eject auf zuvor inserted → removeInsert + KEIN eject-Eintrag', () => {
      // Symmetrie zu 'insert' (Schritt 3): eject auf eine Sendung,
      // die nur via Sandbox-Insert auf der Tour sitzt, MUSS den
      // Insert zuruecknehmen statt einen Eject-Eintrag anzulegen —
      // sonst wuerde Uebernehmen-Mut erst POST + dann DELETE fuer
      // nicht-existierenden Stop versuchen.
      let s = sandboxReducer(initialSandboxState, {
        type: 'insert',
        shipmentId: 'sh-new',
      });
      expect(s.insertedShipmentIds.has('sh-new')).toBe(true);
      s = sandboxReducer(s, { type: 'eject', shipmentId: 'sh-new' });
      // Insert zurueckgenommen
      expect(s.insertedShipmentIds.has('sh-new')).toBe(false);
      // KEIN eject-Eintrag entstanden
      expect(s.ejectedShipmentIds.has('sh-new')).toBe(false);
      expect(sandboxChangeCount(s)).toBe(0);
    });

    it('eject auf normale Tour-Sendung (NICHT inserted) → klassisches eject', () => {
      const s = sandboxReducer(initialSandboxState, {
        type: 'eject',
        shipmentId: 'sh-existing',
      });
      expect(s.ejectedShipmentIds.has('sh-existing')).toBe(true);
      expect(s.insertedShipmentIds.size).toBe(0);
    });
  });

  describe('restore', () => {
    it('entfernt aus ejected', () => {
      const s1 = sandboxReducer(initialSandboxState, {
        type: 'eject',
        shipmentId: 'sh-1',
      });
      const s2 = sandboxReducer(s1, {
        type: 'restore',
        shipmentId: 'sh-1',
      });
      expect(s2.ejectedShipmentIds.size).toBe(0);
    });

    it('no-op wenn nicht ejected', () => {
      const s = sandboxReducer(initialSandboxState, {
        type: 'restore',
        shipmentId: 'never-ejected',
      });
      expect(s).toBe(initialSandboxState);
    });
  });

  describe('insert (Schritt 3 — Drag IN)', () => {
    it('fuegt shipmentId in inserted hinzu', () => {
      const s = sandboxReducer(initialSandboxState, {
        type: 'insert',
        shipmentId: 'sh-new',
      });
      expect(s.insertedShipmentIds.has('sh-new')).toBe(true);
      expect(s.insertedShipmentIds.size).toBe(1);
      expect(sandboxChangeCount(s)).toBe(1);
    });

    it('no-op wenn schon inserted (identische Reference)', () => {
      const s1 = sandboxReducer(initialSandboxState, {
        type: 'insert',
        shipmentId: 'sh-1',
      });
      const s2 = sandboxReducer(s1, {
        type: 'insert',
        shipmentId: 'sh-1',
      });
      expect(s2).toBe(s1);
    });

    it('insert auf zuvor ejected → eject zurueckgenommen + insert gesetzt', () => {
      let s = sandboxReducer(initialSandboxState, {
        type: 'eject',
        shipmentId: 'sh-X',
      });
      s = sandboxReducer(s, { type: 'insert', shipmentId: 'sh-X' });
      expect(s.ejectedShipmentIds.has('sh-X')).toBe(false);
      expect(s.insertedShipmentIds.has('sh-X')).toBe(true);
      // changeCount = 1 (nur Insert), nicht 2 (Eject + Insert).
      expect(sandboxChangeCount(s)).toBe(1);
    });

    it('removeInsert entfernt aus inserted', () => {
      let s = sandboxReducer(initialSandboxState, {
        type: 'insert',
        shipmentId: 'sh-A',
      });
      s = sandboxReducer(s, { type: 'removeInsert', shipmentId: 'sh-A' });
      expect(s.insertedShipmentIds.size).toBe(0);
    });

    it('removeInsert no-op wenn nicht inserted', () => {
      const s = sandboxReducer(initialSandboxState, {
        type: 'removeInsert',
        shipmentId: 'never',
      });
      expect(s).toBe(initialSandboxState);
    });
  });

  describe('clearAll', () => {
    it('setzt State zurueck (positions + ejected + inserted)', () => {
      let s = sandboxReducer(initialSandboxState, {
        type: 'setPosition',
        dbItemId: 'i-1',
        pos,
      });
      s = sandboxReducer(s, { type: 'eject', shipmentId: 'sh-1' });
      s = sandboxReducer(s, { type: 'setPosition', dbItemId: 'i-2', pos });
      s = sandboxReducer(s, { type: 'insert', shipmentId: 'sh-new' });
      expect(sandboxChangeCount(s)).toBe(4);
      const cleared = sandboxReducer(s, { type: 'clearAll' });
      expect(isSandboxEmpty(cleared)).toBe(true);
      expect(cleared.insertedShipmentIds.size).toBe(0);
    });
  });

  describe('Akkumulation (Übernehmen-Vollständigkeit)', () => {
    it('mehrere setPosition + eject akkumulieren korrekt', () => {
      let s = initialSandboxState;
      s = sandboxReducer(s, {
        type: 'setPosition',
        dbItemId: 'i-A',
        pos: { posXCm: 10, posYCm: 20, posZCm: 0 },
      });
      s = sandboxReducer(s, {
        type: 'setPosition',
        dbItemId: 'i-B',
        pos: { posXCm: 30, posYCm: 40, posZCm: 0 },
      });
      s = sandboxReducer(s, { type: 'eject', shipmentId: 'sh-X' });
      s = sandboxReducer(s, { type: 'eject', shipmentId: 'sh-Y' });
      expect(s.positionOverrides.size).toBe(2);
      expect(s.ejectedShipmentIds.size).toBe(2);
      expect(sandboxChangeCount(s)).toBe(4);
      // Beide Items haben distinkte Positionen.
      expect(s.positionOverrides.get('i-A')?.posXCm).toBe(10);
      expect(s.positionOverrides.get('i-B')?.posXCm).toBe(30);
    });

    it('clearPosition reduziert changeCount aber laesst eject intakt', () => {
      let s = initialSandboxState;
      s = sandboxReducer(s, { type: 'setPosition', dbItemId: 'i-1', pos });
      s = sandboxReducer(s, { type: 'eject', shipmentId: 'sh-1' });
      expect(sandboxChangeCount(s)).toBe(2);
      s = sandboxReducer(s, { type: 'clearPosition', dbItemId: 'i-1' });
      expect(sandboxChangeCount(s)).toBe(1);
      expect(s.ejectedShipmentIds.has('sh-1')).toBe(true);
    });
  });
});
