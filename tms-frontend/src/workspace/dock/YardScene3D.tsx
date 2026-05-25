/**
 * S-6 YardScene3D — read-only Hof-Visualisierung.
 *
 * Achsen-Konvention (= LoadingPlan3D)
 *   posX (cm, ACROSS WIDTH) → Three.z
 *   posY (cm, ALONG  LENGTH) → Three.x
 *   posZ (cm, VERT   HEIGHT) → Three.y
 *   1 unit = 1 m = 100 cm.
 *
 * Szene
 *   · Trailer-Box (highlighted gold) bei (L/2, H/2, 0)
 *   · N "Stellplaetze" (Slots) rechts daneben — gleiche Bodenflaeche
 *     L × W, ueber +Z (Width-Achse) verteilt, mit gap=50cm.
 *   · Pro Slot: Boden-Plane (Asphalt-Grau) + 4 Park-Streifen +
 *     Html-Label (z.B. "PLZ 80331 (3)").
 *   · Pro Sendung: Box (representative cuboid) entlang Slot-Laenge
 *     row-bin gepackt. Click → onShipmentClick.
 *   · Ueberlauf-Slot (Sondertyp): gleiches Bodenraster, aber rote
 *     Streifen + Label "Ueberlauf (N nicht plazierbar)".
 *
 * Phase 1: read-only, KEIN Drag, KEIN Pack-Algorithmus (Boxes sind
 * representative — eine pro Sendung, nicht per package_item).
 */
import { Canvas } from '@react-three/fiber';
import { Edges, Html, OrbitControls } from '@react-three/drei';
import { useMemo } from 'react';

export interface YardShipment {
  id: string;
  shipmentNumber?: string | null;
  /** Volumen-basierte Box-Dimensionen (S-6.1).
   *  Bevorzugte Quelle: volumeM3 (BE volume_m3). Fallback: L×W×H der
   *  Sendung (length_cm/width_cm/height_cm). Letzter Fallback: ein
   *  generischer Euro-Pal-Stellplatz (120×80×100). KEINE Gewichts-
   *  Heuristik mehr — Vol ist die richtige Visual-Metrik fuer den Hof.
   */
  volumeM3?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  /** Optionaler Marker — Ueberlauf-Box rot faerben. */
  isOverflow?: boolean;
  /** S-6.3: kurzer Grund (z.B. "Σ Vol > Kapazität" oder
   *  "Pack-Grenze (Reserve)") — wird im Label sichtbar gemacht,
   *  damit Disponent unterscheiden kann zwischen echtem
   *  Kapazitaets-Limit und Pack-Inefficiency. */
  overflowReason?: string | null;
  /** S-6.2 Per-Sendung-Label-Felder. Box-Label = customer
   *  (kompakt), Hover-Tooltip zeigt full address. mode steuert
   *  ob NV-Abhol-Adresse oder FV-Zustell-Detail. */
  customerName?: string | null;
  loadingStreet?: string | null;
  loadingZip?: string | null;
  loadingCity?: string | null;
  loadingCountry?: string | null;
  deliveryZip?: string | null;
  deliveryCity?: string | null;
  deliveryCountry?: string | null;
  transportType?: string | null;
  relationCode?: string | null;
  depotLabel?: string | null;
  mode?: 'nv' | 'fv';
}

/**
 * S-6.2 / S-6.2-Adjust: Per-Sendung-Label.
 *
 * Verhalten
 *   · IMMER sichtbar (touch-tauglich; KEIN hover-Toggle).
 *   · Position vom Caller: am Slot-Edge AUSSERHALB der Boden-Streifen
 *     (nicht ueber der Box, kein Overlap).
 *   · Mehrzeilig kompakt: Sendungs-Nr · Kunde · Adresse/Empfaenger.
 *     Truncate via max-w + truncate; Bei zu vielen Sendungen pro
 *     Slot greift der count-Threshold im SlotMesh (siehe unten).
 *   · Distance-Fade: Html-Prop distanceFactor + transform. Weiter
 *     entfernt → kleiner gerendert; verschwindet quasi-organisch
 *     bei Out-Zoom (kein Custom-useFrame noetig).
 */
function ShipmentLabel({ s }: { s: YardShipment }) {
  const isFv = s.mode === 'fv';
  const tt = (s.transportType ?? '').toUpperCase();
  const fvIsSammelgut =
    tt === 'SAMMELGUT' || tt === 'TEILLAST' || tt === 'KOMPLETT';

  // Zweite Zeile: Adresse (NV) / Empfaenger (FV).
  const country = isFv
    ? (s.deliveryCountry ?? s.loadingCountry)
    : s.loadingCountry;
  const showCountry = country && country !== 'DE' ? country : null;

  let secondary: string | null = null;
  if (isFv) {
    if (fvIsSammelgut) {
      secondary = s.depotLabel
        ? `Depot ${s.depotLabel}`
        : s.relationCode
          ? `Relation ${s.relationCode}`
          : s.deliveryZip
            ? `Empfangs-PLZ ${s.deliveryZip}`
            : null;
    } else {
      secondary = s.deliveryZip ? `Empfangs-PLZ ${s.deliveryZip}` : null;
    }
  } else {
    if (s.loadingStreet || s.loadingZip || s.loadingCity) {
      secondary = [
        s.loadingStreet,
        [s.loadingZip, s.loadingCity].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', ');
    }
  }
  if (showCountry && secondary) secondary = `${showCountry} · ${secondary}`;

  return (
    <div className="text-[10px] leading-tight bg-white/90 text-gray-800 px-1.5 py-0.5 rounded border border-gray-300 shadow-sm whitespace-nowrap max-w-[16rem] truncate pointer-events-none">
      <div className="font-mono font-semibold text-gray-900">
        {s.shipmentNumber ?? s.id.slice(0, 8)}
        {s.customerName && (
          <>
            <span className="text-gray-400"> · </span>
            <span className="font-normal">{s.customerName}</span>
          </>
        )}
      </div>
      {secondary && <div className="text-gray-600">{secondary}</div>}
      {s.overflowReason && (
        <div className="text-red-700 font-semibold">
          ⚠ {s.overflowReason}
        </div>
      )}
    </div>
  );
}

export interface YardSlot {
  /** Slot-Key (z.B. PLZ-string oder "ueberlauf"). */
  id: string;
  /** Label im Slot (z.B. "PLZ 80331" oder "Ueberlauf"). */
  label: string;
  /** Ueberlauf-Slot bekommt rote Streifen. */
  variant?: 'normal' | 'overflow';
  /** Sendungen in diesem Slot. */
  shipments: YardShipment[];
}

/**
 * S-6.2 Auflieger-Vorladung — placed Pakete der aktiven Tour.
 * Identische Position-Formel wie LoadingPlan3D L675-680. Look
 * leicht abgehoben (niedrigere Opacity, kalt-blauer Farbton)
 * damit der Hof-Inhalt visuell vom Auflieger-Inhalt
 * unterscheidbar bleibt.
 */
export interface YardPlacedPackage {
  id: string;
  shipmentId?: string | null;
  /** placePackages-Output: cm. */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  posX: number;
  posY: number;
  posZ: number;
  color?: string | null;
}

interface Props {
  /** Trailer-Geometrie (cm). */
  trailerLengthCm: number;
  trailerWidthCm: number;
  trailerHeightCm: number;
  /** Slot-Liste rechts neben dem Auflieger. */
  slots: YardSlot[];
  /** S-6.2: bereits im Auflieger platzierte Pakete der aktiven Tour. */
  placedInTrailer?: YardPlacedPackage[];
  onShipmentClick?: (id: string) => void;
  frameloop?: 'always' | 'never';
}

const GAP_CM = 80;
const SHIP_ROW_GAP_CM = 30;
const DEFAULT_PAL_L = 120;
const DEFAULT_PAL_W = 80;
const DEFAULT_PAL_H = 100;
const TRAILER_W_LIMIT = 240; // Boxes nicht breiter als Stellplatz
const TRAILER_H_LIMIT = 270;

/**
 * S-6.1: Volumen-treue Box-Dimensionen.
 *
 * Priorisierung
 *   1. L × W × H direkt aus shipment.length_cm/width_cm/height_cm,
 *      wenn alle drei plausibel (>0). Wird auf Stellplatz-Bounds
 *      geclipped.
 *   2. volume_m3 + effective_pallets → Grundflaeche aus Paletten
 *      (1 Pal ≈ 120×80 cm), Hoehe = vol / Grundflaeche.
 *      Wenn Hoehe > 270 → Hoehe auf 270 clippen, Grundflaeche
 *      proportional vergroessern (mehr Pal-Stellplaetze nebeneinander).
 *   3. volume_m3 alleine → cubed root als Kantenlaenge (representativ).
 *   4. Default Euro-Pal 120×80×100.
 *
 * Gibt cm zurueck. KEINE Gewichts-Heuristik mehr.
 */
function shipBoxDims(
  s: YardShipment & { effectivePallets?: number | null },
): { lengthCm: number; widthCm: number; heightCm: number } {
  // 1. echte Dimensionen
  const L = Number(s.lengthCm) || 0;
  const W = Number(s.widthCm) || 0;
  const H = Number(s.heightCm) || 0;
  if (L > 0 && W > 0 && H > 0) {
    return {
      lengthCm: Math.min(360, Math.max(40, L)),
      widthCm: Math.min(TRAILER_W_LIMIT, Math.max(40, W)),
      heightCm: Math.min(TRAILER_H_LIMIT, Math.max(40, H)),
    };
  }
  // 2./3. Volumen-Pfad
  const vol = Number(s.volumeM3 ?? 0);
  if (vol > 0) {
    const ep = Number(s.effectivePallets ?? 0);
    if (ep > 0) {
      // Grundflaeche aus Pal: ep × 120×80 cm² = 0.96 m² × ep.
      const areaM2 = 0.96 * ep;
      let height = (vol / areaM2) * 100; // m → cm
      if (height > TRAILER_H_LIMIT) {
        // Hoehe gedeckelt — Grundflaeche entsprechend skalieren.
        height = TRAILER_H_LIMIT;
      }
      // Pal nebeneinander: Reihen × Spalten = ep. Wir wickeln 1×ep
      // entlang Length-Achse, max 3 Spalten parallel (Stellplatz-W).
      const cols = Math.min(3, Math.max(1, Math.ceil(ep / 4)));
      const rows = Math.ceil(ep / cols);
      return {
        lengthCm: Math.min(360, DEFAULT_PAL_L * rows),
        widthCm: Math.min(TRAILER_W_LIMIT, DEFAULT_PAL_W * cols),
        heightCm: Math.max(40, Math.round(height)),
      };
    }
    // Cubed-Root als Kantenlaenge (representativer Wuerfel).
    const edgeCm = Math.cbrt(vol) * 100;
    const clamped = Math.min(240, Math.max(40, edgeCm));
    return {
      lengthCm: clamped,
      widthCm: clamped,
      heightCm: clamped,
    };
  }
  // 4. Fallback Euro-Pal
  return {
    lengthCm: DEFAULT_PAL_L,
    widthCm: DEFAULT_PAL_W,
    heightCm: DEFAULT_PAL_H,
  };
}

function scaleVec3(x: number, y: number, z: number): [number, number, number] {
  return [x / 100, y / 100, z / 100];
}

export default function YardScene3D({
  trailerLengthCm,
  trailerWidthCm,
  trailerHeightCm,
  slots,
  placedInTrailer,
  onShipmentClick,
  frameloop = 'always',
}: Props) {
  // Layout: Trailer bei z=0; Slots rechts daneben mit gap.
  // Slot[i] center.z = +W/2 + gap + W/2 + i * (W + gap)
  const slotLayouts = useMemo(() => {
    const out: Array<{
      slot: YardSlot;
      centerZ: number;
    }> = [];
    let nextZ = trailerWidthCm / 2 + GAP_CM + trailerWidthCm / 2;
    for (const slot of slots) {
      out.push({ slot, centerZ: nextZ });
      nextZ += trailerWidthCm + GAP_CM;
    }
    return out;
  }, [slots, trailerWidthCm]);

  // Camera position: weit genug raus, damit alle Slots sichtbar sind.
  const cameraPos = useMemo<[number, number, number]>(() => {
    const sceneLength = trailerLengthCm;
    const sceneWidth =
      trailerWidthCm + slots.length * (trailerWidthCm + GAP_CM) + GAP_CM;
    const m = Math.max(sceneLength, sceneWidth) / 100;
    // Kamera schraeg von oben, ein Stueck rechts vom Schwerpunkt.
    return [m * 0.4, m * 0.8, m * 0.7];
  }, [trailerLengthCm, trailerWidthCm, slots.length]);

  // Total grid-size: groesser als Auflieger + alle Slots
  const gridSize = useMemo(() => {
    const sceneWidth =
      trailerWidthCm + slots.length * (trailerWidthCm + GAP_CM) + GAP_CM * 2;
    return Math.max(trailerLengthCm, sceneWidth) / 100;
  }, [trailerLengthCm, trailerWidthCm, slots.length]);

  return (
    <Canvas
      camera={{ position: cameraPos, fov: 45 }}
      frameloop={frameloop}
      shadows
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 10, 5]} intensity={0.9} castShadow />
      <directionalLight position={[-5, 4, -3]} intensity={0.3} />
      <gridHelper
        args={[gridSize, Math.floor(gridSize), '#cbd5e1', '#e2e8f0']}
        position={[trailerLengthCm / 200, 0, 0]}
      />

      {/* Auflieger (highlighted, gold) */}
      <mesh
        position={scaleVec3(
          trailerLengthCm / 2,
          trailerHeightCm / 2,
          0,
        )}
      >
        <boxGeometry
          args={[
            trailerLengthCm / 100,
            trailerHeightCm / 100,
            trailerWidthCm / 100,
          ]}
        />
        <meshStandardMaterial
          color="#f59e0b"
          transparent
          opacity={0.08}
          depthWrite={false}
        />
        <Edges color="#b45309" threshold={1} />
      </mesh>
      {/* Auflieger-Boden */}
      <mesh
        position={scaleVec3(trailerLengthCm / 2, 0.5, 0)}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[trailerLengthCm / 100, trailerWidthCm / 100]} />
        <meshStandardMaterial color="#fef3c7" />
      </mesh>
      <Html
        position={scaleVec3(trailerLengthCm / 2, 0, -trailerWidthCm / 2 - 20)}
        center
        zIndexRange={[0, 0]}
      >
        <div className="text-[11px] font-semibold text-amber-800 bg-white/70 px-2 py-0.5 rounded shadow-sm whitespace-nowrap pointer-events-none">
          Auflieger
        </div>
      </Html>

      {/* S-6.2 Auflieger-Vorladung: bereits platzierte Pakete der
          aktiven Tour. Positions-Formel identisch zu LoadingPlan3D
          L675-680. Look leicht abgehoben (kalt-blau, opacity 0.7).
          Click → onShipmentClick. */}
      {(placedInTrailer ?? []).map((p) => {
        const lx = p.lengthCm / 100;
        const ly = p.heightCm / 100;
        const lz = p.widthCm / 100;
        const cx = p.posY / 100 + lx / 2;
        const cy = p.posZ / 100 + ly / 2;
        const cz = p.posX / 100 - trailerWidthCm / 200 + lz / 2;
        return (
          <mesh
            key={p.id}
            position={[cx, cy, cz]}
            onClick={(e) => {
              e.stopPropagation();
              if (p.shipmentId) onShipmentClick?.(p.shipmentId);
            }}
            onPointerOver={(e) => {
              if (!p.shipmentId) return;
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = '';
            }}
          >
            <boxGeometry args={[lx, ly, lz]} />
            <meshStandardMaterial
              color={p.color ?? '#60a5fa'}
              transparent
              opacity={0.7}
            />
            <Edges color="#1e3a8a" threshold={1} />
          </mesh>
        );
      })}

      {/* Stellplaetze */}
      {slotLayouts.map(({ slot, centerZ }) => (
        <SlotMesh
          key={slot.id}
          slot={slot}
          centerZ={centerZ}
          trailerLengthCm={trailerLengthCm}
          trailerWidthCm={trailerWidthCm}
          onShipmentClick={onShipmentClick}
        />
      ))}

      <OrbitControls makeDefault enablePan enableRotate enableZoom />
    </Canvas>
  );
}

function SlotMesh({
  slot,
  centerZ,
  trailerLengthCm,
  trailerWidthCm,
  onShipmentClick,
}: {
  slot: YardSlot;
  centerZ: number;
  trailerLengthCm: number;
  trailerWidthCm: number;
  onShipmentClick?: (id: string) => void;
}) {
  const stripeColor =
    slot.variant === 'overflow' ? '#dc2626' : '#cbd5e1';
  const floorColor =
    slot.variant === 'overflow' ? '#fee2e2' : '#f8fafc';
  // Row-bin pack der Sendungs-Boxen entlang der Length-Achse.
  // Box-Dims volumen-treu (S-6.1) statt Gewichts-Heuristik.
  const layout = useMemo(() => {
    let cursor = 0;
    return slot.shipments.map((s) => {
      const dims = shipBoxDims(s);
      const posY = cursor + dims.lengthCm / 2; // Mitte
      cursor += dims.lengthCm + SHIP_ROW_GAP_CM;
      return { s, dims, posY };
    });
  }, [slot.shipments]);

  return (
    <group position={scaleVec3(0, 0, centerZ)}>
      {/* Slot-Boden (Asphalt) */}
      <mesh
        position={scaleVec3(trailerLengthCm / 2, 0.4, 0)}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry
          args={[trailerLengthCm / 100, trailerWidthCm / 100]}
        />
        <meshStandardMaterial color={floorColor} />
      </mesh>
      {/* 4 Park-Streifen entlang der Stellplatz-Laenge */}
      {[-1, -0.33, 0.33, 1].map((zFrac, i) => (
        <mesh
          key={i}
          position={scaleVec3(
            trailerLengthCm / 2,
            0.5,
            (trailerWidthCm / 2) * zFrac,
          )}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[trailerLengthCm / 100, 0.05]} />
          <meshStandardMaterial color={stripeColor} />
        </mesh>
      ))}
      <Html
        position={scaleVec3(trailerLengthCm / 2, 0, -trailerWidthCm / 2 - 20)}
        center
        zIndexRange={[0, 0]}
      >
        <div
          className={`text-[11px] font-medium px-2 py-0.5 rounded shadow-sm whitespace-nowrap pointer-events-none ${
            slot.variant === 'overflow'
              ? 'text-red-800 bg-red-50'
              : 'text-slate-700 bg-white/70'
          }`}
        >
          {slot.label}
        </div>
      </Html>
      {/* Sendungs-Boxen — Dims volumen-treu (S-6.1) */}
      {layout.map(({ s, dims, posY }) => (
        <mesh
          key={s.id}
          position={scaleVec3(posY, dims.heightCm / 2 + 5, 0)}
          onClick={(e) => {
            e.stopPropagation();
            onShipmentClick?.(s.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
        >
          <boxGeometry
            args={[
              dims.lengthCm / 100,
              dims.heightCm / 100,
              dims.widthCm / 100,
            ]}
          />
          <meshStandardMaterial
            color={s.isOverflow ? '#dc2626' : '#2563eb'}
            transparent
            opacity={0.85}
          />
          <Edges color={s.isOverflow ? '#991b1b' : '#1e3a8a'} threshold={1} />
        </mesh>
      ))}
      {/* S-6.2-Adjust: Per-Sendung-Labels IMMER sichtbar (touch),
          am Anfang der Reihe (posY - lengthCm/2), AUSSERHALB der
          Boden-Streifen (+z-Seite, kameranah). Distance-Fade ueber
          Html distanceFactor — Out-Zoom schrumpft Labels organisch. */}
      {layout.map(({ s, dims, posY }) => (
        <Html
          key={`label-${s.id}`}
          position={scaleVec3(
            posY - dims.lengthCm / 2 - 10,
            50,
            trailerWidthCm / 2 + 30,
          )}
          center
          distanceFactor={6}
          zIndexRange={[0, 0]}
        >
          <ShipmentLabel s={s} />
        </Html>
      ))}
    </group>
  );
}
