import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { Submarine } from "./Submarine";
import { FishSchool, Anglerfish, Jellyfish } from "./Fish";
import { Reef } from "./Reef";
import { BubbleTrail } from "./BubbleTrail";
import { InspectControls } from "./InspectControls";
import { SeaTurtle, Whale, GlowingPlankton, Octopus } from "./MoreMarineLife";
import { SURFACE_Y, FLOOR_Y, MAX_DEPTH_METERS } from "../lib/ocean-state";

export function depthToProgress(depthMeters: number) {
  return Math.max(0, Math.min(1, depthMeters / 1000));
}

function localProgress(depthMeters: number) {
  return depthToProgress(depthMeters);
}

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

function DepthRig({ depthMeters, inspect }: { depthMeters: number; inspect: boolean }) {
  const { camera, scene } = useThree();
  const fog = useMemo(() => new THREE.Fog("#3ec6d8", 6, 55), []);
  const bg = useMemo(() => new THREE.Color("#3ec6d8"), []);
  const ambient = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const p = localProgress(depthMeters);
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

/** Animated wavy ocean surface with improved water material. */
function WaterSurface() {
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
        Math.sin(x * 0.4 + t * 1.4) * 0.5 +
          Math.cos(y * 0.3 + t) * 0.5 +
          Math.sin(x * 0.8 + y * 0.6 + t * 0.9) * 0.15,
      );
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <mesh ref={mesh} rotation-x={Math.PI / 2} position-y={SURFACE_Y + 6}>
      <planeGeometry args={[140, 140, 60, 60]} />
      <meshPhysicalMaterial
        color="#7fdcef"
        transparent
        opacity={0.82}
        roughness={0.15}
        metalness={0.1}
        transmission={0.3}
        thickness={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** God rays — angled light cones from the surface, fading with depth. */
function GodRays() {
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    group.current.rotation.y = Math.sin(t * 0.15) * 0.05;
  });

  const rays = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        x: -8 + i * 3.2,
        width: 0.6 + Math.random() * 0.8,
        opacity: 0.06 + Math.random() * 0.06,
      })),
    [],
  );

  return (
    <group ref={group}>
      {rays.map((ray, i) => (
        <mesh key={i} position={[ray.x, SURFACE_Y + 2, -4 + (i % 3) * 2]}>
          <planeGeometry args={[ray.width, 60]} />
          <meshBasicMaterial
            color="#d4f5ff"
            transparent
            opacity={ray.opacity}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function MarineSnow({ count = 300 }: { count?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
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
    const depth = SURFACE_Y + (FLOOR_Y - SURFACE_Y) * localProgress(depthMeters());
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

let currentDepth = 0;
function depthMeters() {
  return currentDepth;
}

export function DiveScene({
  depthMeters: depth,
  inspect = false,
  onInspectChange,
}: {
  depthMeters: number;
  inspect?: boolean;
  onInspectChange?: (v: boolean) => void;
}) {
  useMemo(() => {
    currentDepth = depth;
  }, [depth]);

  const p = localProgress(depth);

  return (
    <Canvas
      camera={{ position: [18, SURFACE_Y + 0.5, 0], fov: 62, near: 0.1, far: 220 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={() => onInspectChange?.(false)}
    >
      <DepthRig depthMeters={depth} inspect={inspect} />
      <InspectControls inspect={inspect} getProgress={() => localProgress(depth)} />
      <WaterSurface />
      <GodRays />
      <MarineSnow />
      <Submarine getProgress={() => localProgress(depth)} onInspect={() => onInspectChange?.(true)} />
      <BubbleTrail getProgress={() => localProgress(depth)} />

      {/* Sunlight zone — surface to ~200m */}
      {p < 0.45 && (
        <>
          <FishSchool count={28} center={[-6, -10, -8]} spread={[10, 8, 10]} color="#ffb64d" speed={1.2} />
          <FishSchool count={22} center={[7, -22, -4]} spread={[12, 8, 12]} color="#5dd6ff" speed={1.4} />
          <FishSchool count={18} center={[0, -34, -14]} spread={[14, 8, 10]} color="#8dff9e" speed={1} />
          <SeaTurtle start={[-18, -25, 2]} speed={0.5} />
        </>
      )}

      {/* Twilight zone — 200m to ~1000m */}
      {p >= 0.2 && p < 0.8 && (
        <>
          <FishSchool count={20} center={[-8, -58, -10]} spread={[14, 10, 12]} color="#7a8fd4" speed={0.8} />
          <FishSchool count={16} center={[9, -72, -6]} spread={[12, 10, 12]} color="#4c5f9e" speed={0.7} />
          <Jellyfish position={[-5, -64, -6]} />
          <Jellyfish position={[6, -80, -10]} color="#ff8cd0" />
          <Octopus position={[12, -55, -8]} color="#c86bfa" />
          <Octopus position={[-14, -70, -4]} color="#ff8cd0" />
        </>
      )}

      {/* Midnight / deep zone — 1000m+ */}
      {p >= 0.6 && (
        <>
          <Anglerfish position={[4, -104, -6]} />
          <Anglerfish position={[-6, -116, -4]} />
          <Anglerfish position={[0, -125, -10]} />
          <Jellyfish position={[8, -120, -8]} color="#7dffd4" />
          <Whale start={[18, -90, -15]} />
          <GlowingPlankton count={250} radius={18} />
        </>
      )}

      <Reef />
    </Canvas>
  );
}