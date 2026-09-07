import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { SURFACE_Y, FLOOR_Y } from "../lib/ocean-state";

/**
 * Free orbit/zoom camera focused on the submarine.
 * Active only in inspect mode; the target gently follows the sub as it dives.
 */
export function InspectControls({
  inspect,
  getProgress,
}: {
  inspect: boolean;
  getProgress: () => number;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useRef<any>(null);
  const target = useRef(new THREE.Vector3());

  useFrame(() => {
    const c = controls.current;
    if (!inspect || !c) return;
    const p = getProgress();
    target.current.set(0, SURFACE_Y + (FLOOR_Y - SURFACE_Y) * p, 0);
    c.target.lerp(target.current, 0.15);
    c.update();
  });

  if (!inspect) return null;
  return <OrbitControls ref={controls} enablePan={false} minDistance={4} maxDistance={45} />;
}
