import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';

/**
 * Phase A: 3D-Skeleton fuer den Beladeplan.
 * Nur Canvas + Light + Test-Cube + OrbitControls.
 * Trailer + Pakete kommen in Phase B.
 */
export default function LoadingPlan3D() {
  return (
    <div className="w-full h-[480px] rounded-lg border border-gray-200 bg-gradient-to-b from-slate-50 to-slate-100 overflow-hidden">
      <Canvas camera={{ position: [6, 4, 8], fov: 45 }} shadows>
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[8, 10, 5]}
          intensity={0.9}
          castShadow
        />
        <directionalLight position={[-5, 4, -3]} intensity={0.3} />

        {/* Boden-Grid (visueller Anker) */}
        <gridHelper args={[20, 20, '#cbd5e1', '#e2e8f0']} />

        {/* Platzhalter-Cube */}
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#1e40af" />
        </mesh>

        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#111827" />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
