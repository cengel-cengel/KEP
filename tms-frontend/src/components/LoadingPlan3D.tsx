import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Edges, Html, Line } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeAxleLoads,
  VEHICLE_AXLES,
  type AxleStatus,
  type AxleLoadEntry,
} from '../lib/axleLoad';
import { canStackOn } from '../lib/stackingRules';

const SNAP_CM = 10;
const TOL = 1e-6;

/**
 * Phase B: Trailer + Pakete als 3D-Boxen.
 * 1 unit == 1 Meter == 100 cm.
 *
 * Achsen (Three.js Standard):
 *   x = Trailer-Laenge (z.B. 13.6 m)
 *   y = Vertikal (Hoehe)
 *   z = Trailer-Breite (z.B. 2.45 m)
 *
 * placedPackages.posX/posY/posZ sind Corner-Koordinaten in cm
 * (aus placePackages-Logik). Wir verschieben jedes Mesh um
 * (halbe Box) damit das Three.js-Mesh-Center stimmt.
 */
export type Plan3DVehicle = {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type Plan3DPackage = {
  id: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  posX: number; // cm, entlang Laenge
  posY: number; // cm, entlang Breite
  posZ: number; // cm, entlang Hoehe (Stack-Etage)
  weightKg?: number;
  color?: string;
  isStackable?: boolean;
};

interface Props {
  vehicle: Plan3DVehicle;
  packages: Plan3DPackage[];
  /** Optional: Wenn gesetzt, werden Achslast-Marker im 3D angezeigt. */
  vehicleType?: string;
  /** Optional: Anzahl Spanngurte zur Visualisierung. */
  securementStraps?: number;
  /**
   * Wird nach erfolgreichem Drag mit gueltiger Position aufgerufen.
   * id ist die DB-uuid wenn vorhanden — sonst die synth-id.
   * Caller entscheidet ob persistiert wird.
   */
  onPositionChange?: (id: string, posXCm: number, posYCm: number, posZCm: number) => void;
}

const AXLE_COLOR: Record<AxleStatus, string> = {
  ok: '#10b981',
  warning: '#f59e0b',
  critical: '#dc2626',
};

export default function LoadingPlan3D({
  vehicle,
  packages,
  vehicleType,
  securementStraps = 0,
  onPositionChange,
}: Props) {
  const trailer = useMemo(() => {
    const L = vehicle.lengthCm / 100;
    const W = vehicle.widthCm / 100;
    const H = vehicle.heightCm / 100;
    return { L, W, H };
  }, [vehicle.lengthCm, vehicle.widthCm, vehicle.heightCm]);

  // E1+E2: Drag-Override + Live-Validity.
  const [dragActive, setDragActive] = useState<string | null>(null);
  const [dragOverrides, setDragOverrides] = useState<
    Map<string, { posX: number; posY: number; posZ: number }>
  >(() => new Map());
  const [dragValid, setDragValid] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const offsetRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const originalPosRef = useRef<{ posX: number; posY: number; posZ: number } | null>(null);
  // OrbitControls-Ref fuer synchrones enable/disable beim Drag
  const orbitRef = useRef<any>(null);
  function setOrbit(enabled: boolean) {
    if (orbitRef.current) orbitRef.current.enabled = enabled;
  }

  // Stack-Alignment-Panel-State (nur bei Overhang sichtbar)
  type AlignmentMode = 'centered' | 'front' | 'back' | 'left' | 'right';
  const [alignmentTarget, setAlignmentTarget] = useState<{
    itemId: string;
    belowId: string;
    mode: AlignmentMode;
  } | null>(null);

  function effectivePos(p: Plan3DPackage): { posX: number; posY: number; posZ: number } {
    const ov = dragOverrides.get(p.id);
    return {
      posX: ov?.posX ?? p.posX,
      posY: ov?.posY ?? p.posY,
      posZ: ov?.posZ ?? p.posZ,
    };
  }

  /**
   * Bug 3: Snap-to-Stack.
   * Wenn das gedraggte Paket >=50% Footprint-Overlap mit einem
   * anderen Paket hat, snap auf dessen X/Y. Sonst: 10-cm-Grid.
   */
  function snapXY(
    p: Plan3DPackage,
    posX: number,
    posY: number,
  ): { posX: number; posY: number; viaStack: boolean; belowId?: string } {
    const candArea = Math.max(1, p.widthCm * p.lengthCm);
    let bestPct = 0;
    let best: { posX: number; posY: number; belowId: string } | null = null;
    const ax1 = posX;
    const ax2 = posX + p.widthCm;
    const ay1 = posY;
    const ay2 = posY + p.lengthCm;
    for (const o of packages) {
      if (o.id === p.id) continue;
      const oc = effectivePos(o);
      const bx1 = oc.posX;
      const bx2 = oc.posX + o.widthCm;
      const by1 = oc.posY;
      const by2 = oc.posY + o.lengthCm;
      const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
      const iy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
      const pct = (ix * iy) / candArea;
      if (pct > 0 && pct > bestPct) {
        bestPct = pct;
        best = { posX: oc.posX, posY: oc.posY, belowId: o.id };
      }
    }
    if (best) return { posX: best.posX, posY: best.posY, viaStack: true, belowId: best.belowId };
    return {
      posX: Math.round(posX / SNAP_CM) * SNAP_CM,
      posY: Math.round(posY / SNAP_CM) * SNAP_CM,
      viaStack: false,
    };
  }

  function isOverhang(below: Plan3DPackage, on: Plan3DPackage): boolean {
    return on.widthCm > below.widthCm + TOL || on.lengthCm > below.lengthCm + TOL;
  }

  function computeAlignment(
    below: Plan3DPackage,
    on: Plan3DPackage,
    mode: AlignmentMode,
  ): { posX: number; posY: number } {
    const bp = effectivePos(below);
    let posX: number;
    let posY: number;
    // X-Achse (Breite)
    switch (mode) {
      case 'left':
        posX = bp.posX;
        break;
      case 'right':
        posX = bp.posX + below.widthCm - on.widthCm;
        break;
      case 'centered':
      case 'front':
      case 'back':
      default:
        posX = bp.posX + (below.widthCm - on.widthCm) / 2;
    }
    // Y-Achse (Länge)
    switch (mode) {
      case 'front':
        posY = bp.posY;
        break;
      case 'back':
        posY = bp.posY + below.lengthCm - on.lengthCm;
        break;
      case 'centered':
      case 'left':
      case 'right':
      default:
        posY = bp.posY + (below.lengthCm - on.lengthCm) / 2;
    }
    return { posX, posY };
  }

  function withinTrailer(
    p: Plan3DPackage,
    posX: number,
    posY: number,
  ): boolean {
    return (
      posX >= -TOL &&
      posY >= -TOL &&
      posX + p.widthCm <= trailer.W * 100 + TOL &&
      posY + p.lengthCm <= trailer.L * 100 + TOL
    );
  }

  /**
   * Bug 2: Gravity. Items mit posZ > 0 fallen auf naechste
   * Stuetz-Oberkante (oder Boden). Iterativ.
   */
  function applyGravity(
    overrides: Map<string, { posX: number; posY: number; posZ: number }>,
  ): Map<string, { posX: number; posY: number; posZ: number }> {
    const next = new Map(overrides);
    const getPos = (p: Plan3DPackage) => {
      const ov = next.get(p.id);
      return ov ?? { posX: p.posX, posY: p.posY, posZ: p.posZ };
    };
    for (let safety = 0; safety < 50; safety++) {
      let changed = false;
      for (const p of packages) {
        const cur = getPos(p);
        if (cur.posZ <= TOL) continue;
        let supportTop = 0;
        const ax1 = cur.posX;
        const ax2 = cur.posX + p.widthCm;
        const ay1 = cur.posY;
        const ay2 = cur.posY + p.lengthCm;
        for (const o of packages) {
          if (o.id === p.id) continue;
          const oc = getPos(o);
          const otherTop = oc.posZ + o.heightCm;
          if (otherTop > cur.posZ + TOL) continue; // nicht darunter
          const bx1 = oc.posX;
          const bx2 = oc.posX + o.widthCm;
          const by1 = oc.posY;
          const by2 = oc.posY + o.lengthCm;
          if (ax2 - TOL <= bx1 || bx2 - TOL <= ax1 || ay2 - TOL <= by1 || by2 - TOL <= ay1) continue;
          if (otherTop > supportTop) supportTop = otherTop;
        }
        const newZ = Math.max(0, supportTop);
        if (Math.abs(newZ - cur.posZ) > TOL) {
          next.set(p.id, { posX: cur.posX, posY: cur.posY, posZ: newZ });
          changed = true;
        }
      }
      if (!changed) break;
    }
    return next;
  }

  // Bug 1: applyGravity beim Initial-Render und bei echten
  // Paket-Änderungen. Stable Signature verhindert Re-Run bei
  // bloßen Parent-Re-Renders (neuer Array-Reference).
  const packageSignature = useMemo(
    () =>
      packages
        .map(
          (p) =>
            `${p.id}|${p.posX}|${p.posY}|${p.posZ}|${p.isStackable ? 1 : 0}`,
        )
        .join(';'),
    [packages],
  );
  useEffect(() => {
    setDragOverrides((prev) => applyGravity(prev));
    // applyGravity haengt von packages ab — Trigger via Signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageSignature]);

  // E2: Pure-Helper für Drop-Validität
  function rectsOverlap(
    a: { x1: number; x2: number; y1: number; y2: number },
    b: { x1: number; x2: number; y1: number; y2: number },
  ): boolean {
    return !(
      a.x2 - TOL <= b.x1 ||
      b.x2 - TOL <= a.x1 ||
      a.y2 - TOL <= b.y1 ||
      b.y2 - TOL <= a.y1
    );
  }

  /**
   * Auto-Stack-Resolver:
   * Sucht ab posZ=0 die erste Etage in der das Paket
   * frei steht. Falls Etage besetzt → versuche Stapeln,
   * canStackOn entscheidet. Trailer-Hoehe als Hard-Limit.
   */
  function resolveDrop(
    p: Plan3DPackage,
    posX: number,
    posY: number,
  ): { valid: boolean; suggestedZ: number; reason?: string } {
    const trailerW_cm = trailer.W * 100;
    const trailerL_cm = trailer.L * 100;
    const trailerH_cm = trailer.H * 100;
    if (posX < -TOL || posY < -TOL) {
      return { valid: false, suggestedZ: 0, reason: 'Außerhalb Trailer' };
    }
    if (posX + p.widthCm > trailerW_cm + TOL || posY + p.lengthCm > trailerL_cm + TOL) {
      return { valid: false, suggestedZ: 0, reason: 'Außerhalb Trailer' };
    }
    const cand = {
      x1: posX,
      x2: posX + p.widthCm,
      y1: posY,
      y2: posY + p.lengthCm,
    };
    let posZ = 0;
    for (let i = 0; i < 50; i++) {
      const overlaps: Plan3DPackage[] = [];
      for (const other of packages) {
        if (other.id === p.id) continue;
        const op = effectivePos(other);
        if (Math.abs(op.posZ - posZ) > TOL) continue;
        const oth = {
          x1: op.posX,
          x2: op.posX + other.widthCm,
          y1: op.posY,
          y2: op.posY + other.lengthCm,
        };
        if (rectsOverlap(cand, oth)) overlaps.push(other);
      }
      if (overlaps.length === 0) {
        if (posZ + p.heightCm > trailerH_cm + TOL) {
          return { valid: false, suggestedZ: posZ, reason: 'Stapel zu hoch' };
        }
        return { valid: true, suggestedZ: posZ };
      }
      // Stapeln: jeder Overlap muss canStackOn allowen
      for (const o of overlaps) {
        const ok = canStackOn(
          { isStackable: o.isStackable !== false },
          { isStackable: p.isStackable !== false },
        ).allowed;
        if (!ok) {
          return {
            valid: false,
            suggestedZ: posZ,
            reason: 'Nicht stapelbar (Basis oder Paket)',
          };
        }
      }
      const top = Math.max(
        ...overlaps.map((o) => effectivePos(o).posZ + o.heightCm),
      );
      posZ = top;
    }
    return { valid: false, suggestedZ: posZ, reason: 'Stapel-Loop-Limit' };
  }

  // Achslast-Berechnung (nur wenn vehicleType bekannt)
  const axleResult = useMemo(() => {
    if (!vehicleType || !VEHICLE_AXLES[vehicleType]) return null;
    return computeAxleLoads(
      packages.map((p) => ({ posY: p.posY, weightKg: p.weightKg ?? 0 })),
      vehicleType,
      trailer.L,
    );
  }, [packages, vehicleType, trailer.L]);

  const maxAxleLoad = useMemo(() => {
    if (!axleResult) return 0;
    return Math.max(0, ...axleResult.axles.map((a) => a.load_kg));
  }, [axleResult]);

  // LS3: Spanngurt-Positionen + Spitzenhoehe entlang Trailer-Laenge
  function peakHeightAt(xMeters: number): number {
    let peak = 0;
    for (const p of packages) {
      const eff = effectivePos(p);
      const x1 = eff.posY / 100;
      const x2 = x1 + p.lengthCm / 100;
      if (xMeters >= x1 - 1e-6 && xMeters <= x2 + 1e-6) {
        const top = (eff.posZ + p.heightCm) / 100;
        if (top > peak) peak = top;
      }
    }
    return peak;
  }

  // Camera Distance ~ 1.6 × Diagonale
  const cameraPos = useMemo<[number, number, number]>(() => {
    const d = Math.max(trailer.L, trailer.W, trailer.H) * 1.4;
    return [trailer.L * 0.6, trailer.H * 1.5 + 2, d];
  }, [trailer]);

  function applyAlignment(mode: AlignmentMode) {
    if (!alignmentTarget) return;
    const on = packages.find((x) => x.id === alignmentTarget.itemId);
    const below = packages.find((x) => x.id === alignmentTarget.belowId);
    if (!on || !below) return;
    const { posX, posY } = computeAlignment(below, on, mode);
    if (!withinTrailer(on, posX, posY)) return;
    const r = resolveDrop(on, posX, posY);
    if (!r.valid) return;
    setAlignmentTarget({ ...alignmentTarget, mode });
    setDragOverrides((prev) => {
      const m = new Map(prev);
      m.set(on.id, { posX, posY, posZ: r.suggestedZ });
      return applyGravity(m);
    });
    if (onPositionChange) {
      onPositionChange(on.id, posX, posY, r.suggestedZ);
    }
  }

  function alignmentDisabled(mode: AlignmentMode): boolean {
    if (!alignmentTarget) return true;
    const on = packages.find((x) => x.id === alignmentTarget.itemId);
    const below = packages.find((x) => x.id === alignmentTarget.belowId);
    if (!on || !below) return true;
    const { posX, posY } = computeAlignment(below, on, mode);
    return !withinTrailer(on, posX, posY);
  }

  const ALIGN_BUTTONS: Array<{ mode: AlignmentMode; label: string }> = [
    { mode: 'centered', label: 'Zentriert' },
    { mode: 'front', label: 'Vorne' },
    { mode: 'back', label: 'Hinten' },
    { mode: 'left', label: 'Links' },
    { mode: 'right', label: 'Rechts' },
  ];

  return (
    <div className="relative w-full h-[480px] rounded-lg border border-gray-200 bg-gradient-to-b from-slate-50 to-slate-100 overflow-hidden">
      <div className="absolute bottom-2 left-2 z-10 rounded bg-white/90 border border-gray-200 px-2 py-1 text-[11px] text-gray-600 shadow-sm pointer-events-none">
        🖱️ Links: drehen · Rechts: pan · Rad: zoom
        <span className="block sm:inline sm:ml-2 text-gray-500">
          📱 Mobile: 1 Finger drehen · 2 Finger pan
        </span>
      </div>
      {alignmentTarget && (
        <div className="absolute top-2 right-2 z-20 rounded-lg border border-gray-300 bg-white/95 shadow-lg p-2 text-xs">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-medium text-gray-800">Stack-Ausrichtung</span>
            <button
              type="button"
              onClick={() => setAlignmentTarget(null)}
              className="text-gray-400 hover:text-gray-700"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {ALIGN_BUTTONS.map((b) => {
              const active = alignmentTarget.mode === b.mode;
              const disabled = alignmentDisabled(b.mode);
              return (
                <button
                  key={b.mode}
                  type="button"
                  disabled={disabled}
                  onClick={() => applyAlignment(b.mode)}
                  title={
                    disabled ? 'Würde Trailer-Grenze überschreiten' : undefined
                  }
                  className={
                    'rounded border px-2 py-1 text-[11px] ' +
                    (active
                      ? 'bg-[#1e40af] text-white border-[#1e40af]'
                      : disabled
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
                  }
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Canvas camera={{ position: cameraPos, fov: 45 }} shadows>
        <ambientLight intensity={0.5} />
        <directionalLight position={[8, 10, 5]} intensity={0.9} castShadow />
        <directionalLight position={[-5, 4, -3]} intensity={0.3} />

        {/* Bodengrid relativ zum Trailer */}
        <gridHelper
          args={[Math.max(trailer.L, 16), Math.max(trailer.L, 16), '#cbd5e1', '#e2e8f0']}
          position={[trailer.L / 2, 0, 0]}
        />

        {/* Trailer-Volumen: transparent + Edges */}
        <mesh position={[trailer.L / 2, trailer.H / 2, 0]}>
          <boxGeometry args={[trailer.L, trailer.H, trailer.W]} />
          <meshStandardMaterial
            color="#94a3b8"
            transparent
            opacity={0.06}
            depthWrite={false}
          />
          <Edges color="#475569" threshold={1} />
        </mesh>

        {/* Trailer-Boden (solide Flaeche) */}
        <mesh position={[trailer.L / 2, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[trailer.L, trailer.W]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>

        {/* Pakete als 3D-Boxen
            Achsen-Konvention placePackages:
              posX (cm)  ACROSS  WIDTH    → Three.z
              posY (cm)  ALONG   LENGTH   → Three.x
              posZ (cm)  VERT    HEIGHT   → Three.y
        */}
        {packages.map((p) => {
          const eff = effectivePos(p);
          const lx = p.lengthCm / 100;
          const ly = p.heightCm / 100;
          const lz = p.widthCm / 100;
          const cx = eff.posY / 100 + lx / 2;
          const cy = eff.posZ / 100 + ly / 2;
          const cz = eff.posX / 100 - trailer.W / 2 + lz / 2;
          const isDragging = dragActive === p.id;
          const isHover = hoveredId === p.id && !dragActive;
          const dragInvalid = isDragging && !dragValid;
          return (
            <mesh
              key={p.id}
              position={[cx, cy, cz]}
              castShadow
              receiveShadow
              onPointerEnter={(e) => {
                e.stopPropagation();
                setHoveredId(p.id);
                if (!dragActive) document.body.style.cursor = 'grab';
              }}
              onPointerLeave={(e) => {
                e.stopPropagation();
                setHoveredId((cur) => (cur === p.id ? null : cur));
                if (!dragActive) document.body.style.cursor = '';
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setOrbit(false); // synchron, vor React-Render
                offsetRef.current = {
                  x: e.point.x - cx,
                  z: e.point.z - cz,
                };
                originalPosRef.current = {
                  posX: eff.posX,
                  posY: eff.posY,
                  posZ: eff.posZ,
                };
                setDragValid(true);
                setDragActive(p.id);
                document.body.style.cursor = 'grabbing';
              }}
            >
              <boxGeometry args={[lx, ly, lz]} />
              <meshStandardMaterial
                color={p.color ?? '#9ca3af'}
                emissive={
                  dragInvalid
                    ? '#dc2626'
                    : isDragging
                    ? '#fde047'
                    : isHover
                    ? '#d1d5db'
                    : '#000000'
                }
                emissiveIntensity={isDragging ? 0.5 : isHover ? 0.25 : 0}
              />
              <Edges
                color={
                  dragInvalid
                    ? '#dc2626'
                    : isDragging
                    ? '#facc15'
                    : isHover
                    ? '#94a3b8'
                    : '#1f2937'
                }
                threshold={1}
              />
            </mesh>
          );
        })}

        {/* Drag-Plane: nur aktiv waehrend Drag, faengt PointerMove ab. */}
        {dragActive && (
          <mesh
            position={[trailer.L / 2, 0.005, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerMove={(e) => {
              const pkg = packages.find((p) => p.id === dragActive);
              if (!pkg) return;
              const lx = pkg.lengthCm / 100;
              const lz = pkg.widthCm / 100;
              const newCx = e.point.x - offsetRef.current.x;
              const newCz = e.point.z - offsetRef.current.z;
              const newPosY = (newCx - lx / 2) * 100;
              const newPosX = (newCz + trailer.W / 2 - lz / 2) * 100;
              const cur = dragOverrides.get(dragActive);
              setDragOverrides((prev) => {
                const m = new Map(prev);
                m.set(dragActive, {
                  posX: newPosX,
                  posY: newPosY,
                  posZ: cur?.posZ ?? pkg.posZ,
                });
                return m;
              });
              setDragValid(resolveDrop(pkg, newPosX, newPosY).valid);
            }}
            onPointerUp={() => {
              const pkg = packages.find((p) => p.id === dragActive);
              const orig = originalPosRef.current;
              if (pkg) {
                const cur = dragOverrides.get(pkg.id);
                if (!cur) {
                  // Nichts bewegt; revert für Sauberkeit
                  setDragOverrides((prev) => {
                    const m = new Map(prev);
                    if (orig) m.set(pkg.id, orig);
                    else m.delete(pkg.id);
                    return m;
                  });
                } else {
                  let snap = snapXY(pkg, cur.posX, cur.posY);
                  // Overhang-Detection: Wenn auf groesserer Stack-Basis,
                  // Standard centered-Alignment + Panel triggern.
                  if (snap.viaStack && snap.belowId) {
                    const belowId: string = snap.belowId;
                    const below = packages.find((x) => x.id === belowId);
                    if (below && isOverhang(below, pkg)) {
                      const aligned = computeAlignment(below, pkg, 'centered');
                      snap = {
                        posX: aligned.posX,
                        posY: aligned.posY,
                        viaStack: true,
                        belowId,
                      };
                      setAlignmentTarget({
                        itemId: pkg.id,
                        belowId,
                        mode: 'centered',
                      });
                    }
                  }
                  const r = resolveDrop(pkg, snap.posX, snap.posY);
                  if (r.valid) {
                    setDragOverrides((prev) => {
                      const m = new Map(prev);
                      m.set(pkg.id, {
                        posX: snap.posX,
                        posY: snap.posY,
                        posZ: r.suggestedZ,
                      });
                      return applyGravity(m);
                    });
                    if (onPositionChange) {
                      onPositionChange(pkg.id, snap.posX, snap.posY, r.suggestedZ);
                    }
                  } else if (orig) {
                    setDragOverrides((prev) => {
                      const m = new Map(prev);
                      m.set(pkg.id, orig);
                      return applyGravity(m);
                    });
                  }
                }
              }
              originalPosRef.current = null;
              setDragActive(null);
              setDragValid(true);
              setOrbit(true);
              document.body.style.cursor = '';
            }}
            onPointerLeave={() => {
              // Raus aus Plane = Cancel = Revert
              const pkg = packages.find((p) => p.id === dragActive);
              const orig = originalPosRef.current;
              if (pkg && orig) {
                setDragOverrides((prev) => {
                  const m = new Map(prev);
                  m.set(pkg.id, orig);
                  return m;
                });
              }
              originalPosRef.current = null;
              setDragActive(null);
              setDragValid(true);
              setOrbit(true);
              document.body.style.cursor = '';
            }}
          >
            <planeGeometry args={[trailer.L * 4, trailer.W * 4]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        )}

        {/* Schwerpunkt + Achs-Marker (nur wenn vehicleType bekannt) */}
        {axleResult && (
          <>
            {/* COG: gold-Kugel + Vertical-Stab vom Boden */}
            <mesh position={[axleResult.centerOfGravity_m, 1.0, 0]}>
              <sphereGeometry args={[0.18, 24, 16]} />
              <meshStandardMaterial
                color="#facc15"
                emissive="#ca8a04"
                emissiveIntensity={0.4}
              />
            </mesh>
            <mesh position={[axleResult.centerOfGravity_m, 0.5, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 1.0, 12]} />
              <meshStandardMaterial color="#ca8a04" />
            </mesh>
            <Html
              position={[axleResult.centerOfGravity_m, 1.35, 0]}
              center
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  background: 'rgba(250,204,21,0.95)',
                  color: '#1f2937',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                COG · {axleResult.centerOfGravity_m.toFixed(2)} m
              </div>
            </Html>

            {/* Achsen-Indikatoren unter dem Trailer */}
            {axleResult.axles.map((a: AxleLoadEntry) => {
              const ratio = maxAxleLoad > 0 ? a.load_kg / maxAxleLoad : 0;
              const arrowH = 0.25 + ratio * 0.7;
              const color = AXLE_COLOR[a.status];
              return (
                <group
                  key={a.label}
                  position={[a.distanceFromFront_m, 0, 0]}
                >
                  {/* Bodenlinie (kurzer Streifen quer ueber Trailer-Breite) */}
                  <mesh position={[0, 0.005, 0]}>
                    <boxGeometry args={[0.06, 0.01, trailer.W + 0.4]} />
                    <meshBasicMaterial color={color} />
                  </mesh>
                  {/* Pfeil-Schaft (Cylinder unter Trailer) */}
                  <mesh position={[0, -arrowH / 2 - 0.05, 0]}>
                    <cylinderGeometry args={[0.04, 0.04, arrowH, 12]} />
                    <meshStandardMaterial color={color} />
                  </mesh>
                  {/* Pfeil-Spitze (Cone) */}
                  <mesh position={[0, -arrowH - 0.18, 0]}>
                    <coneGeometry args={[0.12, 0.18, 16]} />
                    <meshStandardMaterial color={color} />
                  </mesh>
                  <Html
                    position={[0, -arrowH - 0.4, 0]}
                    center
                    style={{ pointerEvents: 'none' }}
                  >
                    <div
                      style={{
                        background: color,
                        color: '#fff',
                        padding: '1px 5px',
                        borderRadius: 3,
                        fontSize: 10,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {Math.round(a.load_kg)} kg · {a.loadPercent.toFixed(0)}%
                    </div>
                  </Html>
                </group>
              );
            })}
          </>
        )}

        {/* LS3: Spanngurte als Linien ueber die Paletten */}
        {securementStraps > 0 &&
          Array.from({ length: securementStraps }).map((_, i) => {
            const xRatio = (i + 0.5) / securementStraps;
            const xM = trailer.L * xRatio;
            const peak = peakHeightAt(xM);
            const topY = (peak > 0 ? peak : 0.1) + 0.05;
            return (
              <group key={`strap-${i}`}>
                <Line
                  points={[
                    [xM, 0.02, -trailer.W / 2 - 0.05],
                    [xM, topY, -trailer.W / 2 + 0.1],
                    [xM, topY, +trailer.W / 2 - 0.1],
                    [xM, 0.02, +trailer.W / 2 + 0.05],
                  ]}
                  color="#10b981"
                  lineWidth={3}
                />
                {/* Anker-Markierungen */}
                <mesh position={[xM, 0.03, -trailer.W / 2 - 0.05]}>
                  <sphereGeometry args={[0.05, 8, 6]} />
                  <meshStandardMaterial color="#374151" />
                </mesh>
                <mesh position={[xM, 0.03, +trailer.W / 2 + 0.05]}>
                  <sphereGeometry args={[0.05, 8, 6]} />
                  <meshStandardMaterial color="#374151" />
                </mesh>
              </group>
            );
          })}

        <OrbitControls
          ref={orbitRef}
          makeDefault
          enableDamping
          dampingFactor={0.1}
          enablePan={true}
          target={[trailer.L / 2, trailer.H / 2, 0]}
        />
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#111827" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
