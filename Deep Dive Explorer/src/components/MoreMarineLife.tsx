import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const dummy = new THREE.Object3D();

/**
 * A slow-moving sea turtle gliding through the ocean.
 */
export function SeaTurtle({ start = [-20, -30, 0], speed = 0.6 }: { start?: [number, number, number]; speed?: number }) {
  const g = useRef<THREE.Group>(null);
  const leftFlipper = useRef<THREE.Mesh>(null);
  const rightFlipper = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed;
    if (!g.current) return;

    // Gentle figure-eight swimming path
    g.current.position.x = start[0] + Math.sin(t * 0.3) * 12;
    g.current.position.y = start[1] + Math.sin(t * 0.6) * 2;
    g.current.position.z = start[2] + Math.cos(t * 0.3) * 6;

    // Face direction of travel
    const dx = 12 * Math.cos(t * 0.3) * 0.3;
    const dy = 2 * Math.cos(t * 0.6) * 0.6;
    g.current.rotation.y = -Math.atan2(dx, 0.5);
    g.current.rotation.z = Math.sin(t * 0.3) * 0.08;

    // Flipper animation
    if (leftFlipper.current) leftFlipper.current.rotation.z = Math.sin(t * 2.5) * 0.4 + 0.3;
    if (rightFlipper.current) rightFlipper.current.rotation.z = -(Math.sin(t * 2.5) * 0.4 + 0.3);
  });

  return (
    <group ref={g} position={start}>
      {/* shell */}
      <mesh castShadow>
        <sphereGeometry args={[0.9, 8, 6]} />
        <meshStandardMaterial color="#3d7a4a" roughness={0.7} flatShading />
      </mesh>
      {/* head */}
      <mesh position={[0, 0, -1.1]} castShadow>
        <sphereGeometry args={[0.3, 6, 5]} />
        <meshStandardMaterial color="#4a8a5a" roughness={0.7} flatShading />
      </mesh>
      {/* flippers */}
      <mesh ref={leftFlipper} position={[-0.8, -0.2, -0.3]}>
        <boxGeometry args={[1, 0.08, 0.4]} />
        <meshStandardMaterial color="#4a8a5a" roughness={0.6} flatShading />
      </mesh>
      <mesh ref={rightFlipper} position={[0.8, -0.2, -0.3]}>
        <boxGeometry args={[1, 0.08, 0.4]} />
        <meshStandardMaterial color="#4a8a5a" roughness={0.6} flatShading />
      </mesh>
      {/* tail */}
      <mesh position={[0, 0, 1]}>
        <coneGeometry args={[0.2, 0.6, 5]} />
        <meshStandardMaterial color="#4a8a5a" roughness={0.6} flatShading />
      </mesh>
    </group>
  );
}

/**
 * Simple low-poly whale — a large dark silhouette drifting slowly.
 */
export function Whale({ start = [15, -70, -10], speed = 0.15 }: { start?: [number, number, number]; speed?: number }) {
  const g = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed;
    if (!g.current) return;

    g.current.position.x = start[0] + Math.sin(t * 0.2) * 20;
    g.current.position.y = start[1] + Math.sin(t * 0.5) * 3;
    g.current.position.z = start[2] + Math.cos(t * 0.15) * 8;

    const dx = 20 * Math.cos(t * 0.2) * 0.2;
    g.current.rotation.y = -Math.atan2(dx, 0.5);
    g.current.rotation.z = Math.sin(t * 0.5) * 0.04;
  });

  return (
    <group ref={g} scale={1.6}>
      {/* body */}
      <mesh rotation-x={Math.PI / 2} castShadow>
        <capsuleGeometry args={[1.4, 4, 6, 12]} />
        <meshStandardMaterial color="#2c3e5a" roughness={0.85} flatShading />
      </mesh>
      {/* tail fluke */}
      <mesh position={[0, 0, 3.2]} rotation-y={Math.PI / 2} castShadow>
        <boxGeometry args={[0.15, 2.8, 1.2]} />
        <meshStandardMaterial color="#24344a" roughness={0.8} flatShading />
      </mesh>
      {/* dorsal fin */}
      <mesh position={[0, 0.9, -0.5]} castShadow>
        <coneGeometry args={[0.4, 0.9, 5]} />
        <meshStandardMaterial color="#24344a" roughness={0.8} flatShading />
      </mesh>
    </group>
  );
}

/**
 * Glowing plankton particles in the deep zone — bioluminescent dots.
 */
export function GlowingPlankton({ count = 200, radius = 20 }: { count?: number; radius?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const colors = useMemo(
    () => ["#00ff88", "#4dc9f6", "#7dffd4", "#8cd0ff", "#a8ff78"],
    [],
  );

  const particles = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * radius * 2,
        y: (Math.random() - 0.5) * 40,
        z: (Math.random() - 0.5) * radius * 2,
        s: 0.03 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
        colorIdx: Math.floor(Math.random() * colors.length),
      })),
    [count, radius, colors.length],
  );

  const colorArray = useMemo(() => {
    const arr = new Float32Array(count * 3);
    particles.forEach((p, i) => {
      const c = new THREE.Color(colors[p.colorIdx]!);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    });
    return arr;
  }, [count, particles, colors]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;

    particles.forEach((p, i) => {
      const glow = 0.5 + Math.sin(t * p.speed + p.phase) * 0.5;
      dummy.position.set(
        p.x + Math.sin(t * 0.3 + p.phase) * 1.5,
        p.y + Math.sin(t * 0.5 + p.phase) * 0.8,
        p.z + Math.cos(t * 0.2 + p.phase) * 1.5,
      );
      dummy.scale.setScalar(p.s * glow);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 4, 4]} />
      <meshBasicMaterial color="#7dffd4" transparent opacity={0.8} />
    </instancedMesh>
  );
}

/**
 * Simple octopus drifting with pulsing body.
 */
export function Octopus({ position = [-10, -50, -5], color = "#c86bfa" }: { position?: [number, number, number]; color?: string }) {
  const g = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) {
      g.current.position.y = position[1] + Math.sin(t * 0.4 + position[0]) * 2;
      g.current.position.x = position[0] + Math.sin(t * 0.2) * 4;
      g.current.rotation.y = t * 0.3;
    }
    if (body.current) {
      const s = 1 + Math.sin(t * 1.8) * 0.1;
      body.current.scale.set(s, 2 - s, s);
    }
  });

  return (
    <group ref={g} position={position}>
      {/* head */}
      <mesh ref={body} castShadow>
        <sphereGeometry args={[0.7, 10, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.6} flatShading />
      </mesh>
      {/* eyes */}
      <mesh position={[-0.25, 0.15, -0.6]}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0.25, 0.15, -0.6]}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.4} />
      </mesh>
      {/* tentacles */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 0.4, -0.6, Math.sin(angle) * 0.4]} rotation-x={0.3}>
            <cylinderGeometry args={[0.04, 0.02, 1.4, 5]} />
            <meshStandardMaterial color={color} roughness={0.6} flatShading />
          </mesh>
        );
      })}
      <pointLight intensity={1.5} color={color} distance={5} />
    </group>
  );
}