/**
 * B-2.2: NV Re-Pack-Heuristik für Insert-Mode-Cascade.
 *
 * Anders als FV-Beladeplan (mit fullem placePackages-Algorithmus)
 * nutzt NV eine vereinfachte single/multi-row-Heuristik:
 *
 * - dragged-pkg landet an target.posY/posX/posZ
 * - alle pkg mit posY >= target.posY werden um draggedLengthCm + GAP_CM
 *   nach hinten geshiftet
 * - wenn shifted-posY + pkg.lengthCm > trailerLength → wrap zu next-row
 *   (posY = 0, posX += pkg.widthCm + GAP)
 *
 * Pure helper — Caller iteriert über `actions` und sendet PATCHes.
 */

export interface NvPackageLite {
  id: string;
  posX: number;
  posY: number;
  posZ: number;
  lengthCm: number;
  widthCm: number;
}

export interface NvShiftAction {
  itemId: string;
  posXCm: number;
  posYCm: number;
  posZCm: number;
}

const GAP_CM = 5;

export function planNvInsertShift(args: {
  packages: NvPackageLite[];
  draggedId: string;
  targetId: string;
  trailerLengthCm: number;
  trailerWidthCm: number;
}): NvShiftAction[] {
  const { packages, draggedId, targetId, trailerLengthCm, trailerWidthCm } = args;
  const dragged = packages.find((p) => p.id === draggedId);
  const target = packages.find((p) => p.id === targetId);
  if (!dragged || !target) return [];

  const shiftY = dragged.lengthCm + GAP_CM;
  // Downstream-Items in posY-order.
  const downstream = packages
    .filter((p) => p.id !== draggedId && p.posY >= target.posY)
    .sort((a, b) => a.posY - b.posY);

  const actions: NvShiftAction[] = [];
  // Track cursor für wrap-detection.
  let cursorY = target.posY + shiftY;
  let cursorX = target.posX;
  let rowMaxLength = shiftY;

  for (const pkg of downstream) {
    let newPosY = pkg.posY + shiftY;
    let newPosX = pkg.posX;

    if (newPosY + pkg.lengthCm > trailerLengthCm) {
      // Wrap zu next-row: cursorX um rowMaxWidth shift; cursorY = 0
      // Simpler: shifte alle ab hier auf neue Reihe basierend auf
      // cursor-Tracking.
      cursorX = cursorX + pkg.widthCm + GAP_CM;
      if (cursorX + pkg.widthCm > trailerWidthCm) {
        // Trailer voll — bestes was wir tun können: zurücksetzen
        // (Item bleibt an alter Position, FB wird auf invalidate
        // korrigieren).
        continue;
      }
      newPosY = 0;
      newPosX = cursorX;
      cursorY = pkg.lengthCm + GAP_CM;
      rowMaxLength = pkg.lengthCm + GAP_CM;
    } else {
      cursorY = Math.max(cursorY, newPosY + pkg.lengthCm + GAP_CM);
      rowMaxLength = Math.max(rowMaxLength, pkg.lengthCm + GAP_CM);
    }

    actions.push({
      itemId: pkg.id,
      posXCm: Math.round(newPosX),
      posYCm: Math.round(newPosY),
      posZCm: Math.round(pkg.posZ),
    });
  }

  // Dragged an target-Position.
  actions.push({
    itemId: draggedId,
    posXCm: Math.round(target.posX),
    posYCm: Math.round(target.posY),
    posZCm: Math.round(target.posZ),
  });

  return actions;
}
