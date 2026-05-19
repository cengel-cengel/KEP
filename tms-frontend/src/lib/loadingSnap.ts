/**
 * LP-1 Snap-Helpers für 3D-Beladeplan.
 *
 * Operiert auf cm-Footprints. Drei.js-Achsen-Mapping ist
 * Aufgabe des Renderers.
 *
 *   posX: cm across Trailer-WIDTH  (0..widthCm)
 *   posY: cm along  Trailer-LENGTH (0..lengthCm)
 *   posZ: cm up     Trailer-HEIGHT
 */

export const WALL_MAGNET_CM = 20;

export interface SnapItem {
  id: string;
  posX: number;
  posY: number;
  posZ: number;
  /** Effektive Footprint-Länge (entlang Trailer-Y) — nach Rotation. */
  lengthCm: number;
  /** Effektive Footprint-Breite (entlang Trailer-X) — nach Rotation. */
  widthCm: number;
}

export interface TrailerBounds {
  widthCm: number;
  lengthCm: number;
}

interface Rect {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export function rectsOverlap(a: Rect, b: Rect, tol = 1e-6): boolean {
  return !(
    a.x2 - tol <= b.x1 ||
    b.x2 - tol <= a.x1 ||
    a.y2 - tol <= b.y1 ||
    b.y2 - tol <= a.y1
  );
}

/**
 * Wand-Magnet: wenn Cursor < 20 cm zur Front-Wand (X=0) ODER
 * zur Rechts-Wand (X=trailer.widthCm - dragged.widthCm), snap.
 * Y-Achse analog (Y=0 = Front-Stirnwand).
 * Magnet zieht NUR, wenn kein Item-Overlap am Snap-Ziel.
 */
export function snapToWall(
  dragged: { widthCm: number; lengthCm: number },
  posX: number,
  posY: number,
  trailer: TrailerBounds,
  others: SnapItem[],
  threshold = WALL_MAGNET_CM,
): { posX: number; posY: number; snapped: boolean } {
  let nx = posX;
  let ny = posY;
  let snapped = false;

  // X-Wand (across width)
  if (posX < threshold) {
    nx = 0;
    snapped = true;
  } else if (posX + dragged.widthCm > trailer.widthCm - threshold) {
    nx = trailer.widthCm - dragged.widthCm;
    snapped = true;
  }
  // Y-Wand (along length)
  if (posY < threshold) {
    ny = 0;
    snapped = true;
  } else if (posY + dragged.lengthCm > trailer.lengthCm - threshold) {
    ny = trailer.lengthCm - dragged.lengthCm;
    snapped = true;
  }

  if (!snapped) return { posX, posY, snapped: false };

  // Magnet nur ohne Item-Overlap am Snap-Ziel (auf Boden-Etage)
  const candAtZ0 = {
    x1: nx,
    x2: nx + dragged.widthCm,
    y1: ny,
    y2: ny + dragged.lengthCm,
  };
  for (const o of others) {
    if (Math.abs(o.posZ) > 1) continue; // nur Etage 0
    const oth = {
      x1: o.posX,
      x2: o.posX + o.widthCm,
      y1: o.posY,
      y2: o.posY + o.lengthCm,
    };
    if (rectsOverlap(candAtZ0, oth)) {
      return { posX, posY, snapped: false };
    }
  }
  return { posX: nx, posY: ny, snapped: true };
}

/**
 * Smart-Rotate: prüft ob die gedrehte Orientation näher
 * an einer Wand snapped als die aktuelle. Liefert die
 * empfohlene rotation (0 oder 90) ODER null wenn aktuelle
 * Orientation ok ist.
 *
 * Heuristik: "näher" = snapped=true bei rotated UND
 * snapped=false bei current.
 */
export function smartRotateSuggestion(
  current: { widthCm: number; lengthCm: number },
  posX: number,
  posY: number,
  trailer: TrailerBounds,
  others: SnapItem[],
): 0 | 90 | null {
  const a = snapToWall(current, posX, posY, trailer, others);
  if (a.snapped) return null; // current ist ok
  const rotated = { widthCm: current.lengthCm, lengthCm: current.widthCm };
  const b = snapToWall(rotated, posX, posY, trailer, others);
  if (b.snapped) return 90;
  return null;
}

/**
 * Side-by-side Slot neben non-stackable target auf gleicher Z.
 * Sucht in 4 Richtungen (right/left/front/back). Returns null
 * wenn keine kollisionsfreie Position gefunden.
 *
 * Reihenfolge: right (posX+target.w) > left (posX-d.w) >
 *              front (posY+target.l) > back (posY-d.l).
 */
export function findAdjacentSlot(
  dragged: { widthCm: number; lengthCm: number },
  target: SnapItem,
  others: SnapItem[],
  trailer: TrailerBounds,
): { posX: number; posY: number; posZ: number } | null {
  const candidates = [
    // right of target
    { posX: target.posX + target.widthCm, posY: target.posY },
    // left of target
    { posX: target.posX - dragged.widthCm, posY: target.posY },
    // front of target (smaller Y)
    { posX: target.posX, posY: target.posY - dragged.lengthCm },
    // back of target (larger Y)
    { posX: target.posX, posY: target.posY + target.lengthCm },
  ];
  for (const c of candidates) {
    if (c.posX < 0 || c.posY < 0) continue;
    if (c.posX + dragged.widthCm > trailer.widthCm) continue;
    if (c.posY + dragged.lengthCm > trailer.lengthCm) continue;
    const rect = {
      x1: c.posX,
      x2: c.posX + dragged.widthCm,
      y1: c.posY,
      y2: c.posY + dragged.lengthCm,
    };
    let conflict = false;
    for (const o of others) {
      if (o.id === target.id) continue;
      if (Math.abs(o.posZ - target.posZ) > 1) continue;
      const oth = {
        x1: o.posX,
        x2: o.posX + o.widthCm,
        y1: o.posY,
        y2: o.posY + o.lengthCm,
      };
      if (rectsOverlap(rect, oth)) {
        conflict = true;
        break;
      }
    }
    if (!conflict) return { posX: c.posX, posY: c.posY, posZ: target.posZ };
  }
  return null;
}

const AUTO_ROTATE_KEY = 'tms.loading.autoRotate';

export function loadAutoRotateSetting(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(AUTO_ROTATE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveAutoRotateSetting(on: boolean) {
  try {
    window.localStorage.setItem(AUTO_ROTATE_KEY, on ? '1' : '0');
  } catch {
    /* quota / SSR — silent */
  }
}
