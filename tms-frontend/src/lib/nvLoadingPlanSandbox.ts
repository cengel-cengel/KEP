/**
 * NV-Beladeplan Sandbox-Fundament (Schritt 2).
 *
 * Carlos-Spec: alle Aenderungen sind EPHEMER bis "Übernehmen". Reset
 * bei Component-Unmount (React drop). Kein Auto-PATCH waehrend
 * "Spielens". Einziger DB-Write-Pfad: explizite Übernehmen-Action.
 *
 * Was im Sandbox-State liegt
 *   · positionOverrides: per-Package (dbItemId) Position-Override
 *     fuer Drag im 3D. Bei Reset → Map-Entry entfernt (faellt auf
 *     BE-Pos zurueck).
 *   · ejectedShipmentIds: per-Sendung (shipmentId) "aus Tour
 *     entfernen". Übernehmen → BE-DELETE des zugehoerigen Stops.
 *
 * Was NICHT im Sandbox-State
 *   · Inserted-Sendungen (Drag aus Hof IN den Auflieger) — Schritt 3.
 *   · BE-seitige Position-Resets ("Repack-Optimal") — out of Scope
 *     (rare meta-Operation; spaeter via explicit BE-Action).
 *
 * Render-Anwendung
 *   adjustedPackages = packages
 *     .filter(p => !ejectedShipmentIds.has(p.shipmentId))
 *     .map(p => positionOverrides.has(p.dbItemId)
 *       ? { ...p, posX/Y/Z aus override }
 *       : p)
 *
 * Übernehmen-Reihenfolge
 *   1. Position-Overrides: api.patch /loading/package-item/:id/position
 *   2. Ejected Stops:      api.delete /nv-touren/:id/stops/:stopId
 *   (Reihenfolge stabil: erst Positionen sichern, dann Stops loeschen
 *    — wenn Eject erst, koennten zwischenzeitliche Position-Patches
 *    fuer Items des geloeschten Stops 404-en.)
 */

export interface SandboxPositionOverride {
  posXCm: number;
  posYCm: number;
  posZCm: number;
  rotationDeg?: number;
}

export interface SandboxState {
  /** key = dbItemId (= persist-fähige Package-ID). */
  positionOverrides: Map<string, SandboxPositionOverride>;
  /** Set von shipmentIds die aus der Tour ausgeworfen wurden. */
  ejectedShipmentIds: Set<string>;
}

export type SandboxAction =
  | { type: 'setPosition'; dbItemId: string; pos: SandboxPositionOverride }
  | { type: 'clearPosition'; dbItemId: string }
  | { type: 'eject'; shipmentId: string }
  | { type: 'restore'; shipmentId: string }
  | { type: 'clearAll' };

export const initialSandboxState: SandboxState = {
  positionOverrides: new Map(),
  ejectedShipmentIds: new Set(),
};

export function sandboxReducer(
  state: SandboxState,
  action: SandboxAction,
): SandboxState {
  switch (action.type) {
    case 'setPosition': {
      const m = new Map(state.positionOverrides);
      m.set(action.dbItemId, action.pos);
      return { ...state, positionOverrides: m };
    }
    case 'clearPosition': {
      if (!state.positionOverrides.has(action.dbItemId)) return state;
      const m = new Map(state.positionOverrides);
      m.delete(action.dbItemId);
      return { ...state, positionOverrides: m };
    }
    case 'eject': {
      if (state.ejectedShipmentIds.has(action.shipmentId)) return state;
      const s = new Set(state.ejectedShipmentIds);
      s.add(action.shipmentId);
      return { ...state, ejectedShipmentIds: s };
    }
    case 'restore': {
      if (!state.ejectedShipmentIds.has(action.shipmentId)) return state;
      const s = new Set(state.ejectedShipmentIds);
      s.delete(action.shipmentId);
      return { ...state, ejectedShipmentIds: s };
    }
    case 'clearAll':
      return initialSandboxState;
  }
}

/** Gibt Anzahl der offenen Sandbox-Aenderungen (fuer Badge/Disable). */
export function sandboxChangeCount(state: SandboxState): number {
  return state.positionOverrides.size + state.ejectedShipmentIds.size;
}

/** Hat der Sandbox gar keine Aenderungen (Übernehmen disabled)? */
export function isSandboxEmpty(state: SandboxState): boolean {
  return sandboxChangeCount(state) === 0;
}
