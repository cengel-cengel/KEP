import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Edges } from '@react-three/drei';
import { useMemo } from 'react';

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
  color?: string;
  isStackable?: boolean;
};

interface Props {
  vehicle: Plan3DVehicle;
  packages: Plan3DPackage[];
}

export default function LoadingPlan3D({ vehicle, packages }: Props) {
  const trailer = useMemo(() => {
    const L = vehicle.lengthCm / 100;
    const W = vehicle.widthCm / 100;
    const H = vehicle.heightCm / 100;
    return { L, W, H };
  }, [vehicle.lengthCm, vehicle.widthCm, vehicle.heightCm]);

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

        {/* Pakete als 3D-Boxen */}
        {packages.map((p) => {
          const lx = p.lengthCm / 100;
          const ly = p.heightCm / 100;
          const lz = p.widthCm / 100;
          // Trailer-Boden geht von x=0..L, z=-W/2..+W/2, y=0..H
          const cx = p.posX / 100 + lx / 2;
          const cy = p.posZ / 100 + ly / 2;
          const cz = p.posY / 100 - trailer.W / 2 + lz / 2;
          return (
            <mesh
              key={p.id}
              position={[cx, cy, cz]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[lx, ly, lz]} />
              <meshStandardMaterial color={p.color ?? '#9ca3af'} />
              <Edges color="#1f2937" threshold={1} />
            </mesh>
          );
        })}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          target={[trailer.L / 2, trailer.H / 2, 0]}
        />
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#111827" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
