import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Submarine } from "./Submarine";
import { FishSchool, Anglerfish, Jellyfish } from "./Fish";
import { Reef } from "./Reef";
import { InspectControls } from "./InspectControls";
import { oceanState, SURFACE_Y, FLOOR_Y } from "../lib/ocean-state";

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

/** Camera follows scroll depth; fog and background shift with depth. */
function DepthRig({ inspect }: { inspect: boolean }) {
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
      18,
      depth + 0.5 + Math.sin(t * 0.8) * 0.3,
      0,
    );
    // In inspect mode the user owns the camera — only drive fog/lighting.
    if (!inspect) {
      // Adaptive follow: smooth cinematic tracking normally, but snap hard
      // when a fast dive opens a big gap so the sub never leaves the frame.
      const gap = camera.position.distanceTo(target);
      const rate = gap > 30 ? 1000 : gap > 12 ? 10 : 4;
      camera.position.lerp(target, 1 - Math.exp(-rate * delta));
      camera.lookAt(0, depth, 0);
    }

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

/** Wavy ocean surface seen from below at the start. */
function Surface() {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const geo = mesh.current?.geometry as THREE.PlaneGeometry | undefined;
    if (!geo) return;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.4 + t * 1.4) * 0.5 + Math.cos(y * 0.3 + t) * 0.5);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <mesh ref={mesh} rotation-x={Math.PI / 2} position-y={SURFACE_Y + 6}>
      <planeGeometry args={[140, 140, 40, 40]} />
      <meshStandardMaterial color="#7fdcef" transparent opacity={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Marine snow — always-on particles around the camera. */
function MarineSnow() {
  const COUNT = 400;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        x: (Math.random() - 0.5) * 40,
        y: Math.random() * 160,
        z: (Math.random() - 0.5) * 40,
        v: 0.2 + Math.random() * 0.5,
        s: 0.02 + Math.random() * 0.05,
      })),
    [],
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
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial color="#cfe8f0" transparent opacity={0.6} />
    </instancedMesh>
  );
}

export function OceanCanvas({
  inspect = false,
  onInspectChange,
}: {
  inspect?: boolean;
  onInspectChange?: (v: boolean) => void;
}) {
  return (
    <div className="fixed inset-0">
      <Canvas
        camera={{ position: [18, SURFACE_Y + 0.5, 0], fov: 62, near: 0.1, far: 220 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
        onPointerMissed={() => onInspectChange?.(false)}
      >
        <DepthRig inspect={inspect} />
        <InspectControls inspect={inspect} getProgress={() => oceanState.progress} />
        <Surface />
        <MarineSnow />
        <Submarine getProgress={() => oceanState.progress} onInspect={() => onInspectChange?.(true)} />

        {/* Sunlight zone — bright tropical schools */}
        <FishSchool count={28} center={[-6, -10, -8]} spread={[10, 8, 10]} color="#ffb64d" speed={1.2} />
        <FishSchool count={22} center={[7, -22, -4]} spread={[12, 8, 12]} color="#5dd6ff" speed={1.4} />
        <FishSchool count={18} center={[0, -34, -14]} spread={[14, 8, 10]} color="#8dff9e" speed={1} />

        {/* Twilight zone */}
        <FishSchool count={20} center={[-8, -58, -10]} spread={[14, 10, 12]} color="#7a8fd4" speed={0.8} />
        <FishSchool count={16} center={[9, -72, -6]} spread={[12, 10, 12]} color="#4c5f9e" speed={0.7} />
        <Jellyfish position={[-5, -64, -6]} />
        <Jellyfish position={[6, -80, -10]} color="#ff8cd0" />
        <Jellyfish position={[1, -95, -4]} color="#8cd0ff" />

        {/* Midnight zone */}
        <Anglerfish position={[4, -104, -6]} />
        <Anglerfish position={[-6, -116, -4]} />
        <Anglerfish position={[2, -128, -8]} />
        <Jellyfish position={[8, -120, -8]} color="#7dffd4" />

        <Reef />
      </Canvas>
    </div>
  );
}
