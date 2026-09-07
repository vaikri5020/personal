import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export const SURFACE_Y = 0;
export const FLOOR_Y = -140;
export const MAX_DEPTH_METERS = 2000;

// Keep a mutable progress value in sync (0 = surface, 1 = seafloor).
// Set this from a scroll handler or slider.
export const oceanState = { progress: 0 };

const dummy = new THREE.Object3D();

/** Depth-graded water color: turquoise surface → deep indigo → black abyss. */
const STOPS: [number, THREE.Color][] = [
  [0, new THREE.Color("#3ec6d8")],
  [0.25, new THREE.Color("#1b7fa6")],
  [0.5, new THREE.Color("#0d3a63")],
  [0.75, new THREE.Color("#071a33")],
  [1, new THREE.Color("#02060f")],
];

function waterColor(t: number, out: THREE.Color) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const s0 = STOPS[i]!;
    const s1 = STOPS[i + 1]!;
    if (t <= s1[0]) {
      return out.copy(s0[1]).lerp(s1[1], (t - s0[0]) / (s1[0] - s0[0]));
    }
  }
  return out.copy(STOPS[STOPS.length - 1]![1]);
}

/** Animated wavy ocean surface — the water you see at the top. */
export function WaterSurface({ positionY = SURFACE_Y + 6 }: { positionY?: number }) {
  const mesh = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const geo = mesh.current?.geometry as THREE.PlaneGeometry | undefined;
    if (!geo) return;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(
        i,
        Math.sin(x * 0.4 + t * 1.4) * 0.5 + Math.cos(y * 0.3 + t) * 0.5,
      );
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });

  return (
    <mesh ref={mesh} rotation-x={Math.PI / 2} position-y={positionY}>
      <planeGeometry args={[140, 140, 40, 40]} />
      <meshStandardMaterial color="#7fdcef" transparent opacity={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Depth-dependent camera, fog, background, and lighting. */
function WaterDepthRig() {
  const { camera, scene } = useThree();
  const fog = useMemo(() => new THREE.Fog("#3ec6d8", 6, 55), []);
  const bg = useMemo(() => new THREE.Color("#3ec6d8"), []);
  const ambient = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const p = oceanState.progress;
    const depth = SURFACE_Y + (FLOOR_Y - SURFACE_Y) * p;
    const t = clock.elapsedTime;

    const target = new THREE.Vector3(
      Math.sin(t * 0.3) * 1.2,
      depth + 3.2 + Math.sin(t * 0.8) * 0.3,
      9.5,
    );
    camera.position.lerp(target, 1 - Math.exp(-4 * delta));
    camera.lookAt(0, depth + 0.8, -4);

    waterColor(p, bg);
    fog.color.copy(bg);
    fog.near = 5;
    fog.far = THREE.MathUtils.lerp(60, 22, p);
    scene.fog = fog;
    scene.background = bg;

    if (ambient.current) ambient.current.intensity = THREE.MathUtils.lerp(0.85, 0.12, p);
    if (sun.current) sun.current.intensity = THREE.MathUtils.lerp(1.6, 0.05, Math.min(p * 1.6, 1));
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={0.85} color="#9fd8e8" />
      <directionalLight ref={sun} position={[6, 20, 8]} intensity={1.6} color="#dff6ff" />
    </>
  );
}

/** Marine snow — gentle falling particles. */
export function MarineSnow({ count = 400 }: { count?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 40,
        y: Math.random() * 160,
        z: (Math.random() - 0.5) * 40,
        v: 0.2 + Math.random() * 0.5,
        s: 0.02 + Math.random() * 0.05,
      })),
    [count],
  );

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const m = mesh.current;
    if (!m) return;
    const depth = SURFACE_Y + (FLOOR_Y - SURFACE_Y) * oceanState.progress;
    parts.forEach((pt, i) => {
      pt.y -= pt.v * delta;
      if (pt.y < 0) pt.y = 160;
      dummy.position.set(pt.x, depth - 80 + pt.y, pt.z);
      dummy.scale.setScalar(pt.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial color="#cfe8f0" transparent opacity={0.6} />
    </instancedMesh>
  );
}

/** Minimal water-only canvas ready to drop into any React page. */
export function OceanWater({
  scrollProgress = oceanState.progress,
}: {
  scrollProgress?: number;
}) {
  oceanState.progress = scrollProgress;
  return (
    <div className="fixed inset-0">
      <Canvas
        camera={{ position: [0, SURFACE_Y + 3, 9.5], fov: 62, near: 0.1, far: 220 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <WaterDepthRig />
        <WaterSurface />
        <MarineSnow />
      </Canvas>
    </div>
  );
}
