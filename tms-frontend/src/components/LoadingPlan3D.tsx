import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Edges, Html, Line } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
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
  const offsetRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const originalPosRef = useRef<{ posX: number; posY: number; posZ: number } | null>(null);

  function effectivePos(p: Plan3DPackage): { posX: number; posY: number; posZ: number } {
    const ov = dragOverrides.get(p.id);
    return {
      posX: ov?.posX ?? p.posX,
      posY: ov?.posY ?? p.posY,
      posZ: ov?.posZ ?? p.posZ,
    };
  }

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

  return (
    <div className="w-full h-[480px] rounded-lg border border-gray-200 bg-gradient-to-b from-slate-50 to-slate-100 overflow-hidden">
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
          const dragInvalid = isDragging && !dragValid;
          return (
            <mesh
              key={p.id}
              position={[cx, cy, cz]}
              castShadow
              receiveShadow
              onPointerDown={(e) => {
                e.stopPropagation();
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
              }}
            >
              <boxGeometry args={[lx, ly, lz]} />
              <meshStandardMaterial
                color={p.color ?? '#9ca3af'}
                emissive={
                  dragInvalid ? '#dc2626' : isDragging ? '#fde047' : '#000000'
                }
                emissiveIntensity={isDragging ? 0.5 : 0}
              />
              <Edges
                color={dragInvalid ? '#dc2626' : isDragging ? '#facc15' : '#1f2937'}
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
                  const snappedX = Math.round(cur.posX / SNAP_CM) * SNAP_CM;
                  const snappedY = Math.round(cur.posY / SNAP_CM) * SNAP_CM;
                  const r = resolveDrop(pkg, snappedX, snappedY);
                  if (r.valid) {
                    setDragOverrides((prev) => {
                      const m = new Map(prev);
                      m.set(pkg.id, {
                        posX: snappedX,
                        posY: snappedY,
                        posZ: r.suggestedZ,
                      });
                      return m;
                    });
                  } else if (orig) {
                    setDragOverrides((prev) => {
                      const m = new Map(prev);
                      m.set(pkg.id, orig);
                      return m;
                    });
                  }
                }
              }
              originalPosRef.current = null;
              setDragActive(null);
              setDragValid(true);
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
          makeDefault
          enableDamping
          dampingFactor={0.1}
          target={[trailer.L / 2, trailer.H / 2, 0]}
          enabled={!dragActive}
        />
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#111827" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
