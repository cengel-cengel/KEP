/**
 * S-6.3 C: First-Fit-Decreasing (FFD) Sendungs-Bin-Packing.
 *
 * Carlos-Regel #2: Pack-Einheit ist die SENDUNG (alle ihre items
 * zusammen) — eine Sendung kommt KOMPLETT auf einen Trailer, NIE
 * über zwei LKW gesplittet. FFD ordnet Sendungen Trailern zu,
 * NICHT items.
 *
 * Algorithmus
 *   1. Sortiere Sendungen nach Volumen absteigend (groesste zuerst).
 *   2. Pro Sendung: First-Fit — den ersten existierenden Trailer
 *      suchen, der noch genug Vol UND Gewicht hat.
 *   3. Wenn keiner passt: neuen Trailer aufmachen.
 *
 * Constraints pro Trailer
 *   · max_volume_m3   (Sattel-Default 88.13)
 *   · max_weight_kg   (Sattel-Default 24000)
 *   · Eine ueberdimensionale Sendung (z.B. Vol > 88 m³) bekommt
 *     ihren eigenen Trailer (auch wenn sie ueber 100% liegt) —
 *     besser sichtbar machen als verstecken.
 *
 * Output
 *   Array<{ shipmentIds: string[]; volumeM3: number; weightKg: number }>
 *   ↑ in derselben Reihenfolge wie die Sendungen erstellt wurden.
 *
 * Aggregat-Vol/Gewicht sind die TRAILER-Capacity-Verbrauchs-Summen —
 * der echte 3D-Pack (placePackages) kann darunter liegen wenn die
 * Items hervorragend stapeln, aber FFD ist eine konservative obere
 * Schranke fuer "Anzahl LKWs".
 */

export interface FfdShipment {
  id: string;
  volumeM3: number;
  weightKg: number;
}

export interface FfdTrailer {
  shipmentIds: string[];
  volumeM3: number;
  weightKg: number;
}

export interface FfdOpts {
  /** Trailer-Vol-Kapazitaet (m³). Default Sattel 88.13. */
  maxVolumeM3?: number;
  /** Trailer-Gewichts-Kapazitaet (kg). Default Sattel 24000. */
  maxWeightKg?: number;
}

const DEFAULT_MAX_VOL = 88.13;
const DEFAULT_MAX_WEIGHT = 24000;

export function ffdPackShipments(
  shipments: FfdShipment[],
  opts: FfdOpts = {},
): FfdTrailer[] {
  const maxVol = opts.maxVolumeM3 ?? DEFAULT_MAX_VOL;
  const maxKg = opts.maxWeightKg ?? DEFAULT_MAX_WEIGHT;

  // Sortiere nach Vol desc; Tie-Break nach Gewicht desc.
  const sorted = [...shipments].sort((a, b) => {
    if (a.volumeM3 !== b.volumeM3) return b.volumeM3 - a.volumeM3;
    return b.weightKg - a.weightKg;
  });

  const trailers: FfdTrailer[] = [];
  for (const s of sorted) {
    let placed = false;
    for (const t of trailers) {
      if (
        t.volumeM3 + s.volumeM3 <= maxVol + 1e-6 &&
        t.weightKg + s.weightKg <= maxKg + 1e-6
      ) {
        t.shipmentIds.push(s.id);
        t.volumeM3 += s.volumeM3;
        t.weightKg += s.weightKg;
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Neuer Trailer. Bei Ueberdimensions-Sendung (vol > maxVol)
      // landet sie trotzdem allein — sichtbar.
      trailers.push({
        shipmentIds: [s.id],
        volumeM3: s.volumeM3,
        weightKg: s.weightKg,
      });
    }
  }
  return trailers;
}
