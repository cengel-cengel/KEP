/**
 * NV-Beladeplan Sandbox-Fundament (Schritt 2 + Schritt 3 + H5b).
 *
 * Carlos-Spec: alle Aenderungen sind EPHEMER bis "Übernehmen". Reset
 * bei Component-Unmount (React drop). Kein Auto-PATCH waehrend
 * "Spielens". Einziger DB-Write-Pfad: explizite Übernehmen-Action.
 *
 * Was im Sandbox-State liegt
 *   · positionOverrides: per-Klon (dbItemId, paletteIndex) Position-
 *     Override fuer Drag im 3D. H5b: Key ist `${dbItemId}|${paletteIndex}`
 *     (vorher nur dbItemId — kollidierte zwischen Klonen einer Sendung,
 *     nachdem H5a dbItemId fuer ALLE Klone setzt). Bei Reset → Map-Entry
 *     entfernt (faellt auf BE-Pos zurueck).
 *   · ejectedShipmentIds: per-Sendung (shipmentId) "aus Tour
 *     entfernen". Übernehmen → BE-DELETE des zugehoerigen Stops.
 *   · insertedShipmentIds (Schritt 3): per-Sendung (shipmentId) "in
 *     Tour einfuegen". Patched-Tour-Memo zieht package_items aus dem
 *     nearby-Pool (Page-seitige Lookup). Übernehmen → BE-POST eines
 *     Stops pro inserted shipmentId.
 *
 * Render-Anwendung (H5b)
 *   patchedTour = tour
 *     mit Stops gefiltert (ejected raus)
 *     + Position-Overrides per paletteIndex in shipment_package_items.
 *       positions[] injizieren (nvExpand liest positions.find(paletteIndex))
 *     + synthetische Stops fuer inserted (package_items aus nearby-Pool)
 *
 * Übernehmen-Reihenfolge (Schritt 3 erweitert)
 *   1. Position-Overrides: api.patch /loading/package-item/:id/position
 *      Body enthaelt paletteIndex (H3-API) — parseKey aus Map-Key.
 *   2. Inserted Shipments:  api.post /nv-touren/:id/stops { shipment_id }
 *   3. Ejected Stops:       api.delete /nv-touren/:id/stops/:stopId
 *   (Inserts vor Ejects: falls eine Tour-Re-Plan beide hat, will man
 *    den Insert zuerst — sonst koennte BE-Capacity-Check nach Eject
 *    zu eng werden.)
 */

export interface SandboxPositionOverride {
  posXCm: number;
  posYCm: number;
  posZCm: number;
  rotationDeg?: number;
}

/** H5b: Composite-Key fuer per-Klon-Persistenz. */
export function makeKey(dbItemId: string, paletteIndex: number): string {
  return `${dbItemId}|${paletteIndex}`;
}

/** H5b: parseKey — robust gegen "|"-haltige dbItemIds (rsplit auf
 *  letzten "|"). dbItemIds sind UUIDs ohne "|", aber defensiv. */
export function parseKey(key: string): {
  dbItemId: string;
  paletteIndex: number;
} {
  const idx = key.lastIndexOf('|');
  if (idx < 0) return { dbItemId: key, paletteIndex: 0 };
  return {
    dbItemId: key.slice(0, idx),
    paletteIndex: Number(key.slice(idx + 1)) || 0,
  };
}

export interface SandboxState {
  /** H5b: key = `${dbItemId}|${paletteIndex}` (vorher nur dbItemId). */
  positionOverrides: Map<string, SandboxPositionOverride>;
  /** Set von shipmentIds die aus der Tour ausgeworfen wurden. */
  ejectedShipmentIds: Set<string>;
  /** Schritt 3: Set von shipmentIds aus dem nearby-Pool, die in die
   *  Tour gedraggt wurden. Page-seitiger Lookup baut den synthetischen
   *  Stop aus nearbyQ-Daten. */
  insertedShipmentIds: Set<string>;
}

export type SandboxAction =
  | {
      type: 'setPosition';
      dbItemId: string;
      paletteIndex: number;
      pos: SandboxPositionOverride;
    }
  | { type: 'clearPosition'; dbItemId: string; paletteIndex: number }
  | { type: 'eject'; shipmentId: string }
  | { type: 'restore'; shipmentId: string }
  | { type: 'insert'; shipmentId: string }
  | { type: 'removeInsert'; shipmentId: string }
  | { type: 'clearAll' };

export const initialSandboxState: SandboxState = {
  positionOverrides: new Map(),
  ejectedShipmentIds: new Set(),
  insertedShipmentIds: new Set(),
};

export function sandboxReducer(
  state: SandboxState,
  action: SandboxAction,
): SandboxState {
  switch (action.type) {
    case 'setPosition': {
      const key = makeKey(action.dbItemId, action.paletteIndex);
      const m = new Map(state.positionOverrides);
      m.set(key, action.pos);
      return { ...state, positionOverrides: m };
    }
    case 'clearPosition': {
      const key = makeKey(action.dbItemId, action.paletteIndex);
      if (!state.positionOverrides.has(key)) return state;
      const m = new Map(state.positionOverrides);
      m.delete(key);
      return { ...state, positionOverrides: m };
    }
    case 'eject': {
      // Schritt 4 Symmetrie zu 'insert' (Schritt 3): wenn die Sendung
      // in insertedShipmentIds steht (User hat sie gerade per Drag-IN
      // hinzugefuegt und will sie nun losschicken/Parkplatz), nicht
      // ejecten sondern Insert zuruecknehmen. Andernfalls wuerde
      // Uebernehmen-Mut erst POST /stops + dann fuer nicht-existierende
      // Stop-ID DELETE'n versuchen (404).
      if (state.insertedShipmentIds.has(action.shipmentId)) {
        const ins = new Set(state.insertedShipmentIds);
        ins.delete(action.shipmentId);
        return { ...state, insertedShipmentIds: ins };
      }
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
    case 'insert': {
      // Insert + Eject derselben Sendung sind exklusiv. Falls die
      // Sendung in ejectedSet ist (Bug-Repro: Drag-Hof-IN auf eine
      // gerade ge-eject-te Sendung) → eject zuerst zuruecknehmen.
      const eSet = state.ejectedShipmentIds.has(action.shipmentId)
        ? (() => {
            const s = new Set(state.ejectedShipmentIds);
            s.delete(action.shipmentId);
            return s;
          })()
        : state.ejectedShipmentIds;
      if (state.insertedShipmentIds.has(action.shipmentId) && eSet === state.ejectedShipmentIds) {
        return state;
      }
      const ins = new Set(state.insertedShipmentIds);
      ins.add(action.shipmentId);
      return {
        ...state,
        insertedShipmentIds: ins,
        ejectedShipmentIds: eSet,
      };
    }
    case 'removeInsert': {
      if (!state.insertedShipmentIds.has(action.shipmentId)) return state;
      const ins = new Set(state.insertedShipmentIds);
      ins.delete(action.shipmentId);
      return { ...state, insertedShipmentIds: ins };
    }
    case 'clearAll':
      return initialSandboxState;
  }
}

/** Gibt Anzahl der offenen Sandbox-Aenderungen (fuer Badge/Disable). */
export function sandboxChangeCount(state: SandboxState): number {
  return (
    state.positionOverrides.size +
    state.ejectedShipmentIds.size +
    state.insertedShipmentIds.size
  );
}

/** Hat der Sandbox gar keine Aenderungen (Übernehmen disabled)? */
export function isSandboxEmpty(state: SandboxState): boolean {
  return sandboxChangeCount(state) === 0;
}
