import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const dummy = new THREE.Object3D();

type SchoolProps = {
  count: number;
  center: [number, number, number];
  spread: [number, number, number];
  color: string;
  speed?: number;
  scale?: number;
};

/** A school of simple low-poly fish swimming in a lazy loop. */
export function FishSchool({
  count,
  center,
  spread,
  color,
  speed = 1,
  scale = 1,
}: SchoolProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const fish = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: center[0] + (Math.random() - 0.5) * spread[0],
        y: center[1] + (Math.random() - 0.5) * spread[1],
        z: center[2] + (Math.random() - 0.5) * spread[2],
        phase: Math.random() * Math.PI * 2,
        radius: 1 + Math.random() * 2,
        dir: i % 2 === 0 ? 1 : -1,
      })),
    [count, center, spread],
  );

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime * speed;
    fish.forEach((f, i) => {
      const a = t * 0.4 * f.dir + f.phase;
      dummy.position.set(
        f.x + Math.cos(a) * f.radius,
        f.y + Math.sin(t * 1.6 + f.phase) * 0.35,
        f.z + Math.sin(a) * f.radius,
      );
      dummy.rotation.y = -a + (f.dir > 0 ? 0 : Math.PI);
      dummy.scale.setScalar(scale * (0.8 + Math.sin(f.phase) * 0.15));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} key={count}>
      {/* stretched cone body + tail fin merged visually */}
      <coneGeometry args={[0.16, 0.7, 5]} />
      <meshStandardMaterial color={color} roughness={0.6} flatShading />
    </instancedMesh>
  );
}

/** Deep-sea anglerfish with a glowing lure. */
export function Anglerfish({ position }: { position: [number, number, number] }) {
  const g = useRef<THREE.Group>(null);
  const lure = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) {
      g.current.position.y = position[1] + Math.sin(t * 0.8) * 0.5;
      g.current.position.x = position[0] + Math.sin(t * 0.25) * 3;
      g.current.rotation.y = Math.cos(t * 0.25) * 0.6;
    }
    if (lure.current) {
      const mat = lure.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.6 + Math.sin(t * 3) * 0.7;
    }
  });

  return (
    <group ref={g} position={position}>
      <mesh castShadow>
        <sphereGeometry args={[0.9, 10, 8]} />
        <meshStandardMaterial color="#3a2f45" roughness={0.8} flatShading />
      </mesh>
      {/* jaw */}
      <mesh position={[0, -0.4, -0.5]} rotation-x={0.5}>
        <coneGeometry args={[0.45, 0.8, 6]} />
        <meshStandardMaterial color="#2c2334" roughness={0.9} flatShading />
      </mesh>
      {/* tail */}
      <mesh position={[0, 0, 1.1]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.5, 1.1, 5]} />
        <meshStandardMaterial color="#3a2f45" roughness={0.8} flatShading />
      </mesh>
      {/* lure stalk */}
      <mesh position={[0, 0.9, -0.5]} rotation-x={-0.6}>
        <cylinderGeometry args={[0.03, 0.03, 1, 6]} />
        <meshStandardMaterial color="#2c2334" />
      </mesh>
      <mesh ref={lure} position={[0, 1.35, -0.9]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#8fe8ff" emissive="#6fdcff" emissiveIntensity={2} />
      </mesh>
      <pointLight position={[0, 1.35, -0.9]} intensity={6} color="#6fdcff" distance={9} />
    </group>
  );
}

/** A drifting jellyfish with a pulsing bell. */
export function Jellyfish({
  position,
  color = "#d98cff",
}: {
  position: [number, number, number];
  color?: string;
}) {
  const g = useRef<THREE.Group>(null);
  const bell = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) {
      g.current.position.y = position[1] + Math.sin(t * 0.5 + position[0]) * 1.4;
    }
    if (bell.current) {
      const s = 1 + Math.sin(t * 2.2 + position[2]) * 0.12;
      bell.current.scale.set(s, 2 - s, s);
    }
  });

  return (
    <group ref={g} position={position}>
      <mesh ref={bell}>
        <sphereGeometry args={[0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.9}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      {[-0.35, 0, 0.35].map((x) => (
        <mesh key={x} position={[x, -1, 0]}>
          <cylinderGeometry args={[0.02, 0.01, 2, 5]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.5} />
        </mesh>
      ))}
      <pointLight intensity={2.5} color={color} distance={6} />
    </group>
  );
}
