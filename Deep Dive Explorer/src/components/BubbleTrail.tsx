import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SURFACE_Y, FLOOR_Y } from "../lib/ocean-state";

const dummy = new THREE.Object3D();

/**
 * Bubbles that stream behind the submarine propeller as it dives.
 * Only active when depth is changing (user is dragging slider).
 */
export function BubbleTrail({ count = 80, getProgress }: { count?: number; getProgress: () => number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lastDepth = useRef(0);

  const bubbles = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: 0,
        y: 0,
        z: 0,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.4 + Math.random() * 0.8,
        vz: 0.8 + Math.random() * 1.2,
        s: 0.04 + Math.random() * 0.12,
        life: 0,
        maxLife: 1.2 + Math.random() * 1.5,
      })),
    [count],
  );

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const m = mesh.current;
    if (!m) return;

    const p = getProgress();
    const depth = SURFACE_Y + (FLOOR_Y - SURFACE_Y) * p;
    const speed = Math.abs(p - lastDepth.current);
    lastDepth.current = p;

    bubbles.forEach((b, i) => {
      if (b.life > 0) {
        b.life += delta;
        b.x += b.vx * delta;
        b.y += b.vy * delta;
        b.z += b.vz * delta;
        b.vy += 0.3 * delta;
      }

      // Spawn new bubbles from the submarine tail (motor sits at -Z) when moving
      if (b.life <= 0 && speed > 0.0003) {
        b.x = (Math.random() - 0.5) * 0.8;
        b.y = depth + (Math.random() - 0.5) * 0.6;
        b.z = -3.5 - Math.random() * 0.5;
        b.vx = (Math.random() - 0.5) * 0.6;
        b.vy = 0.3 + Math.random() * 0.6;
        b.vz = 0.5 + Math.random() * 1.0;
        b.life = 0.01;
        b.s = 0.04 + Math.random() * 0.12;
      }

      const alive = b.life > 0 && b.life < b.maxLife;
      dummy.position.set(b.x, b.y + (alive ? 0 : 9999), b.z);
      const fade = alive ? Math.max(0, 1 - b.life / b.maxLife) : 0;
      dummy.scale.setScalar(b.s * fade);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });

    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 5, 5]} />
      <meshStandardMaterial color="#c8f4ff" transparent opacity={0.5} emissive="#a0e8ff" emissiveIntensity={0.3} />
    </instancedMesh>
  );
}