import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FLOOR_Y } from "../lib/ocean-state";

const dummy = new THREE.Object3D();

/** Branching coral made of stacked cones near the seafloor. */
function Coral({
  position,
  color,
  branches = 5,
}: {
  position: [number, number, number];
  color: string;
  branches?: number;
}) {
  const segs = useMemo(
    () =>
      Array.from({ length: branches }, (_, i) => ({
        x: (Math.random() - 0.5) * 1.4,
        z: (Math.random() - 0.5) * 1.4,
        h: 0.8 + Math.random() * 1.6,
        tilt: (Math.random() - 0.5) * 0.6,
        r: 0.18 + Math.random() * 0.16,
        key: i,
      })),
    [branches],
  );
  return (
    <group position={position}>
      {segs.map((s) => (
        <mesh
          key={s.key}
          position={[s.x, s.h / 2, s.z]}
          rotation={[s.tilt, 0, s.tilt * 0.7]}
          castShadow
        >
          <coneGeometry args={[s.r, s.h, 6]} />
          <meshStandardMaterial color={color} roughness={0.7} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Fan coral — a flat splayed fan. */
function FanCoral({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={position} rotation={[0, Math.random() * Math.PI, 0.15]}>
      <circleGeometry args={[1.2, 10, 0, Math.PI]} />
      <meshStandardMaterial color={color} roughness={0.8} side={THREE.DoubleSide} flatShading />
    </mesh>
  );
}

export function Reef() {
  const corals = useMemo(() => {
    const palette = ["#ff6f91", "#ff9671", "#f9f871", "#6fe3c1", "#c86bfa"];
    const items: { pos: [number, number, number]; color: string; fan: boolean }[] = [];
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 26;
      items.push({
        pos: [Math.cos(angle) * r, FLOOR_Y + 0.2, Math.sin(angle) * r],
        color: palette[i % palette.length]!,
        fan: Math.random() > 0.6,
      });
    }
    return items;
  }, []);

  const bubbles = useRef<THREE.InstancedMesh>(null);
  const bubbleData = useMemo(
    () =>
      Array.from({ length: 60 }, () => ({
        x: (Math.random() - 0.5) * 24,
        y: Math.random() * 60,
        z: (Math.random() - 0.5) * 24,
        s: 0.04 + Math.random() * 0.09,
        v: 0.6 + Math.random() * 1.2,
      })),
    [],
  );

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const m = bubbles.current;
    if (!m) return;
    bubbleData.forEach((b, i) => {
      b.y += b.v * delta;
      if (b.y > 60) b.y = 0;
      dummy.position.set(b.x + Math.sin(b.y * 0.8 + i) * 0.3, FLOOR_Y + b.y, b.z);
      dummy.scale.setScalar(b.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* seafloor */}
      <mesh rotation-x={-Math.PI / 2} position-y={FLOOR_Y} receiveShadow>
        <circleGeometry args={[80, 40]} />
        <meshStandardMaterial color="#243447" roughness={1} />
      </mesh>

      {/* rocks */}
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const r = 6 + ((i * 37) % 24);
        const s = 0.6 + ((i * 13) % 10) / 6;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, FLOOR_Y + s * 0.3, Math.sin(a) * r]}
            scale={[s, s * 0.7, s]}
            castShadow
          >
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#33465c" roughness={1} flatShading />
          </mesh>
        );
      })}

      {corals.map((c, i) =>
        c.fan ? (
          <FanCoral key={i} position={c.pos} color={c.color} />
        ) : (
          <Coral key={i} position={c.pos} color={c.color} branches={4 + (i % 4)} />
        ),
      )}

      {/* rising bubbles */}
      <instancedMesh ref={bubbles} args={[undefined, undefined, 60]}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshStandardMaterial color="#bfe8ff" transparent opacity={0.4} />
      </instancedMesh>
    </group>
  );
}
