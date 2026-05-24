/**
 * F1.b: Shared Pack-Helfer (extrahiert aus pages/LoadingPlanPage.tsx).
 *
 * Pure-Functions fuer Bin-Packing + Stack-Slot-Suche + Carlos-Stack-Rule-
 * Sortierung. Output bit-identisch zur FV-Vorgaenger-Implementation
 * (1:1 verschoben, keine Refactor-Aufraeumung).
 *
 * Caller setzen ihren eigenen Package-Typ via Generic `<P extends
 * SharedPackage>`; FV nutzt seine ShipmentLoad-basierte `Package`-
 * Form (mit dbItemId/shipmentNumber/color/etc.), NV koennte in F2
 * eine eigene Form passen — die Pass-Through-Felder bleiben im
 * Result via spread erhalten.
 *
 * Wird von:
 *   pages/LoadingPlanPage.tsx  (placedPackages-useMemo,
 *                               repackOptimalMutation,
 *                               handleInsertAt-Cascade)
 *   lib/sortPackagesForOptimalPack.test.ts
 *   Folge: NV-Anbindung in F2 (per-Subset-Effektiv-ldm).
 */
import { canStackOn } from './stackingRules';

/**
 * Pflicht-Felder fuer die Pack-Helfer. Caller-Types muessen mindestens
 * diese Felder mitbringen; Extra-Felder bleiben durch Spread im Result
 * erhalten.
 */
export interface SharedPackage {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  isStackable: boolean;
  /** Optional: DB-persistierte Position. Phase 1 setzt diese als
   *  Hindernisse fuer den Auto-Placer. */
  storedPosX?: number | null;
  storedPosY?: number | null;
  storedPosZ?: number | null;
}

/** Pos-Ergaenzung nach Auto-Placement. Pass-Through-Felder von P
 *  bleiben erhalten (siehe placePackages-Signatur). */
export interface SharedPlacedPackage {
  posX: number;
  posY: number;
  posZ: number;
  /** LP-1: 0/90 Y-Rotation. Nicht vom Pack-Algorithmus gesetzt, aber
   *  als Slot reserviert damit Caller (FV-Page) durchschleifen kann. */
  rotationDeg?: number;
  /** BUG-F-PACK: Wenn true, passt das Paket physisch nicht in den
   *  Trailer (Boden + alle Stack-Slots erschoepft). Pos-Werte sind
   *  in dem Fall undefiniert (0/0/0); Caller filtert vor dem 3D-
   *  Render + zeigt Banner "N Paletten passen physisch nicht". Bleibt
   *  optional damit bestehende Stack-Slots-Pfade kein Field setzen. */
  unplaced?: boolean;
}

/* ─── interne Bin-Pack-Helfer (file-scope) ─────────────────────── */

function rectsOverlap2D(
  ax: number,
  ay: number,
  aw: number,
  al: number,
  bx: number,
  by: number,
  bw: number,
  bl: number,
): boolean {
  return ax < bx + bw - 1e-6 && bx < ax + aw - 1e-6 && ay < by + bl - 1e-6 && by < ay + al - 1e-6;
}

function getStackHeight(
  placed: Array<SharedPackage & SharedPlacedPackage>,
  x: number,
  y: number,
  footprintW: number,
  footprintL: number,
): number {
  let maxTop = 0;
  for (const p of placed) {
    if (
      rectsOverlap2D(x, y, footprintW, footprintL, p.posX, p.posY, p.widthCm, p.lengthCm)
    ) {
      maxTop = Math.max(maxTop, p.posZ + p.heightCm);
    }
  }
  return maxTop;
}

/** Stapelplatz mit gleicher Bodenfläche (Breite×Länge), bevorzugt hinten (kleines posY) dann links. */
function findPreferredStackSlot(
  pkg: SharedPackage,
  placed: Array<SharedPackage & SharedPlacedPackage>,
  pw: number,
  pl: number,
  ph: number,
  trailerH: number,
): { posX: number; posY: number; posZ: number } | null {
  if (!pkg.isStackable) return null;
  const seen = new Set<string>();
  const candidates: { x: number; y: number; posZ: number }[] = [];
  for (const p of placed) {
    // BUG-F-PACK FIX 2 — Mischpaletten-Stack:
    // Oberes Footprint muss <= unteres Footprint sein (kein Ueberhang),
    // oberes Gewicht <= unteres Gewicht (schwer-unten-leicht-oben).
    // (Vorher: exakte Footprint-Gleichheit — Mischpaletten landeten
    // unnoetig auf Boden, Trailer ueberlief.)
    if (pw > p.widthCm + 1e-6) continue;
    if (pl > p.lengthCm + 1e-6) continue;
    if ((pkg.weightKg ?? 0) > (p.weightKg ?? 0) + 1e-6) continue;
    // Basis muss stapelbar sein (Carlos-Regel via canStackOn)
    if (!canStackOn(p, pkg).allowed) continue;
    const key = `${p.posX},${p.posY}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sh = getStackHeight(placed, p.posX, p.posY, pw, pl);
    if (sh < 1e-6) continue;
    if (sh + ph > trailerH + 1e-6) continue;
    candidates.push({ x: p.posX, y: p.posY, posZ: sh });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 1e-6) return a.y - b.y;
    return a.x - b.x;
  });
  const c = candidates[0];
  return { posX: c.x, posY: c.y, posZ: c.posZ };
}

/* ─── Exporte ──────────────────────────────────────────────────── */

/**
 * B-1 SCHRITT 4 Carlos-Stack-Rule Sort.
 *
 * Sortiert Packstücke optimal für FFDH-Bin-Packing:
 *   1. non-stackable zuerst (kommen auf Boden, kein Top-Stack)
 *   2. weight desc (schwer-unten-leicht-oben)
 *   3. volume desc (groß-zuerst, kleine Pakete füllen Lücken)
 *
 * Stabile Sortierung (Tie-breaker = original-Index).
 */
export function sortPackagesForOptimalPack<P extends SharedPackage>(
  packages: P[],
): P[] {
  const indexed = packages.map((p, idx) => ({ p, idx }));
  indexed.sort((a, b) => {
    // 1. non-stackable first
    if (a.p.isStackable !== b.p.isStackable) {
      return a.p.isStackable ? 1 : -1;
    }
    // 2. weight desc
    const dw = b.p.weightKg - a.p.weightKg;
    if (Math.abs(dw) > 0.5) return dw;
    // 3. volume desc
    const va = a.p.lengthCm * a.p.widthCm * a.p.heightCm;
    const vb = b.p.lengthCm * b.p.widthCm * b.p.heightCm;
    if (va !== vb) return vb - va;
    // Tie-Breaker: Stabil
    return a.idx - b.idx;
  });
  return indexed.map((x) => x.p);
}

/**
 * Phase 1: Pakete mit gespeicherter Position direkt setzen.
 * Diese wirken im Anschluss als "Hindernisse" fuer Auto-Placer.
 * Phase 2: Row-Bin-Pack mit findPreferredStackSlot-Vorrang.
 *
 * Output ist Array<P & SharedPlacedPackage> — Pass-Through-Felder von P
 * (id, shipmentId, color, …) bleiben durch Spread erhalten.
 */
export function placePackages<P extends SharedPackage>(
  packages: P[],
  trailerL: number,
  trailerW: number,
  trailerH: number,
): Array<P & SharedPlacedPackage> {
  const placed: Array<P & SharedPlacedPackage> = [];

  // Phase 1: Pakete mit gespeicherter Position direkt setzen.
  // Diese wirken im Anschluss als "Hindernisse" fuer Auto-Placer.
  const remaining: P[] = [];
  for (const pkg of packages) {
    if (
      pkg.storedPosX != null &&
      pkg.storedPosY != null &&
      pkg.storedPosZ != null
    ) {
      const pw = Math.min(pkg.widthCm, trailerW);
      const pl = Math.min(pkg.lengthCm, trailerL);
      const ph = Math.min(pkg.heightCm, trailerH);
      placed.push({
        ...pkg,
        widthCm: pw,
        lengthCm: pl,
        heightCm: ph,
        posX: pkg.storedPosX,
        posY: pkg.storedPosY,
        posZ: pkg.storedPosZ,
      });
    } else {
      remaining.push(pkg);
    }
  }

  let currentY = 0;
  let currentX = 0;
  let rowMaxLength = 0;

  for (const pkg of remaining) {
    const pw = Math.min(pkg.widthCm, trailerW);
    const pl = Math.min(pkg.lengthCm, trailerL);
    const ph = Math.min(pkg.heightCm, trailerH);
    if (pw <= 0 || pl <= 0 || ph <= 0) continue;

    const stackSlot = findPreferredStackSlot(pkg, placed, pw, pl, ph, trailerH);
    if (stackSlot) {
      placed.push({
        ...pkg,
        widthCm: pw,
        lengthCm: pl,
        heightCm: ph,
        posX: stackSlot.posX,
        posY: stackSlot.posY,
        posZ: stackSlot.posZ,
      });
      continue;
    }

    let cx = currentX;
    let cy = currentY;
    let localRowMax = rowMaxLength;
    let placedOne = false;

    for (let guard = 0; guard < 200000; guard++) {
      if (placedOne) break;
      if (cx + pw > trailerW + 1e-6) {
        cy += localRowMax;
        cx = 0;
        localRowMax = 0;
      }
      if (cy + pl > trailerL + 1e-6) {
        // BUG-F-PACK FIX 1 — Overflow → unplaced statt Eck-Push.
        // Vorher: alle Excess-Pakete landeten am selben (trailerW-pw,
        // trailerL-pl, 0)-Punkt + durchdrangen sich. Jetzt markieren
        // wir sie als unplaced, Caller filtert vor 3D-Render + zeigt
        // Banner.
        placed.push({
          ...pkg,
          widthCm: pw,
          lengthCm: pl,
          heightCm: ph,
          posX: 0,
          posY: 0,
          posZ: 0,
          unplaced: true,
        });
        currentX = 0;
        currentY = Math.min(trailerL, cy);
        rowMaxLength = 0;
        placedOne = true;
        break;
      }
      const stackH = getStackHeight(placed, cx, cy, pw, pl);
      let useZ = 0;
      if (stackH > 1e-6) {
        if (pkg.isStackable && stackH + ph <= trailerH + 1e-6) {
          useZ = stackH;
        } else {
          cx += Math.max(1, pw);
          continue;
        }
      }
      placed.push({
        ...pkg,
        widthCm: pw,
        lengthCm: pl,
        heightCm: ph,
        posX: cx,
        posY: cy,
        posZ: useZ,
      });
      currentX = cx + pw;
      currentY = cy;
      rowMaxLength = Math.max(localRowMax, pl);
      placedOne = true;
    }

    if (!placedOne) {
      // BUG-F-PACK FIX 1 — guard-exhausted (200000 Iterations ohne
      // Slot) → unplaced. Trifft fast nie, aber konsistent mit dem
      // cy-Overflow-Zweig oben.
      placed.push({
        ...pkg,
        widthCm: pw,
        lengthCm: pl,
        heightCm: ph,
        posX: 0,
        posY: 0,
        posZ: 0,
        unplaced: true,
      });
    }
  }

  return placed;
}
