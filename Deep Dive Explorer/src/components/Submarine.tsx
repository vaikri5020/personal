import { useLayoutEffect, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SURFACE_Y, FLOOR_Y } from "../lib/ocean-state";

/**
 * Center + normalize the GLB once, measured in the parent group's local
 * space (NOT world space — the parent sits at the dive depth, so a world
 * bbox would bake the depth into the model's local offset and displace it).
 */
function centerModel(model: THREE.Object3D, parent: THREE.Object3D | null) {
  model.position.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  if (parent) {
    parent.updateWorldMatrix(true, false);
    box.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  model.position.copy(center).negate();
  model.scale.setScalar(8 / maxDim);
}

export function Submarine({
  getProgress,
  onInspect,
}: {
  getProgress: () => number;
  onInspect?: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const spotTarget = useRef<THREE.Object3D>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const centered = useRef(false);
  const prevY = useRef<number | null>(null);
  const pitch = useRef(0);

  // Load the GLB submarine model.
  const { scene } = useGLTF("/submarine.glb");

  useLayoutEffect(() => {
    if (centered.current) return;
    centered.current = true;
    centerModel(scene, group.current);
  }, [scene]);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = clock.elapsedTime;
    const g = group.current;
    if (!g) return;

    const progress = getProgress();
    const depthY = SURFACE_Y + (FLOOR_Y - SURFACE_Y) * progress;

    // Slow floating drift — always on, most visible at the surface.
    const bob = Math.sin(t * 0.9) * 0.3;
    const driftX = Math.sin(t * 0.25) * 0.6;
    const subTarget = new THREE.Vector3(driftX, depthY + bob, 0);
    // Same adaptive catch-up as the camera: glide smoothly when close,
    // snap to the target depth on fast dives so the sub stays in frame.
    const gapY = Math.abs(subTarget.y - g.position.y);
    const followRate = gapY > 25 ? 1000 : gapY > 8 ? 12 : 5;
    g.position.lerp(subTarget, 1 - Math.exp(-followRate * delta));

    // Dive tilt from vertical velocity: nose down while descending,
    // nose up while ascending, easing back to level when still.
    const vy = prevY.current === null ? 0 : (depthY - prevY.current) / Math.max(delta, 1e-3);
    prevY.current = depthY;
    const targetPitch =
      THREE.MathUtils.clamp(-vy * 0.06, -0.35, 0.5) + progress * 0.12 + Math.sin(t * 0.7) * 0.02;
    pitch.current = THREE.MathUtils.lerp(pitch.current, targetPitch, 1 - Math.exp(-3 * delta));
    g.rotation.x = pitch.current;

    // Gentle roll + slow yaw wander so it feels alive while floating.
    g.rotation.z = Math.sin(t * 0.9) * 0.03;
    g.rotation.y = Math.sin(t * 0.3) * 0.06;

    if (spot.current && spotTarget.current) {
      spot.current.target = spotTarget.current;
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onInspect?.();
  };

  return (
    <group
      ref={group}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <primitive object={scene} />
      {/* headlight at the nose (+Z), aimed forward-down in local space */}
      <pointLight position={[0, 0.5, 4.5]} intensity={18} color="#bfe8ff" distance={26} />
      <spotLight
        ref={spot}
        position={[0, 0.5, 4]}
        angle={0.5}
        penumbra={0.6}
        intensity={60}
        color="#cfeaff"
        distance={42}
      />
      <object3D ref={spotTarget} position={[0, -2, 14]} />
    </group>
  );
}
