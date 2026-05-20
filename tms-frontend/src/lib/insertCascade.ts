/**
 * B-2 Insert-Mode-Helper.
 *
 * Beim Drop während Insert-Mode wandert der gedraggte Index VOR
 * den target-Index. Downstream-Items shiften automatisch nach
 * unten/rechts (durch placePackages-Re-Run mit neuer Order).
 *
 * Returns: neue Array-Reihenfolge der Packages. Caller ruft
 * dann placePackages(newOrder, …) für die Y-Repack-Berechnung.
 */

export function computeInsertedOrder<T extends { id: string }>(
  packages: T[],
  draggedId: string,
  targetId: string,
): T[] {
  const dIdx = packages.findIndex((p) => p.id === draggedId);
  const tIdx = packages.findIndex((p) => p.id === targetId);
  if (dIdx < 0 || tIdx < 0 || dIdx === tIdx) return packages;
  const next = packages.slice();
  const [dragged] = next.splice(dIdx, 1);
  // Nach dem splice: tIdx-1 wenn dIdx < tIdx, sonst tIdx.
  const insertAt = dIdx < tIdx ? tIdx - 1 : tIdx;
  // VOR target einfügen → Drag-Item rutscht in target-Position,
  // target + downstream shiften nach hinten.
  next.splice(insertAt, 0, dragged);
  return next;
}

/**
 * Findet das ID des Pakets das die Drop-Position überlappt
 * (closest match nach posY-distance). Returns null wenn keiner
 * passt (z.B. drop ins leere).
 */
export function findInsertTarget<T extends { id: string; posY: number; lengthCm: number }>(
  placed: T[],
  dropPosY: number,
  excludeId?: string,
): string | null {
  let best: { id: string; dist: number } | null = null;
  for (const p of placed) {
    if (excludeId && p.id === excludeId) continue;
    const center = p.posY + p.lengthCm / 2;
    const dist = Math.abs(center - dropPosY);
    if (!best || dist < best.dist) {
      best = { id: p.id, dist };
    }
  }
  return best?.id ?? null;
}
