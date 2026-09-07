import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Html, OrbitControls, Sparkles, Stars, useGLTF } from "@react-three/drei";
import { Suspense, useLayoutEffect, useRef } from "react";
import type { Mesh, Group } from "three";
import * as THREE from "three";
import { ZONES, type Zone } from "./zones";


function Satellite() {
  const g = useRef<Group>(null);
  const { scene } = useGLTF("/satellite.glb");

  useLayoutEffect(() => {
    scene.traverse((o) => {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
    });
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    scene.position.copy(box.getCenter(new THREE.Vector3())).negate();
    scene.scale.setScalar(3.0 / maxDim);
    scene.rotation.set(Math.PI , 0 ,Math.PI/2 );
  }, [scene]);

  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = clock.getElapsedTime() * 0.35;
    g.current.position.set(Math.sin(t) * 2.0, 3, Math.cos(t) * 1.2);
    g.current.rotation.set(0, -t, 0);
  });

  return (
    <group ref={g} position={[0, 0, 0]}>
      <primitive object={scene} />
      <pointLight position={[0, 1, 0]} intensity={40} color="#38bdf8" distance={12} />
      <Html center distanceFactor={9} position={[0, 0, 0]}>
        <span className="whitespace-nowrap rounded-full bg-primary/80 px-2 py-0.5 text-[10px] font-semibold text-white">
          Satellite 👀 sees the surface
        </span>
      </Html>
    </group>
  );
}

function ArgoFloat() {
  const m = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!m.current) return;
    m.current.position.y = -1 + Math.sin(clock.getElapsedTime() * 0.6) * 1.6;
  });
  return (
    <group ref={m} position={[2.1, -1, 0.4]}>
      <mesh>
        <capsuleGeometry args={[0.22, 0.7, 8, 16]} />
        <meshStandardMaterial color="#facc15" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#fb7185" />
      </mesh>
      <Html center distanceFactor={10} position={[0, -0.75, 0]}>
        <span className="whitespace-nowrap rounded-full bg-yellow-400/90 px-2 py-0.5 text-[10px] font-bold text-slate-900">
          Argo float 🤖 dives &amp; measures
        </span>
      </Html>
    </group>
  );
}

function Fish({
  position,
  color,
  speed = 1,
  scale = 1,
}: {
  position: [number, number, number];
  color: string;
  speed?: number;
  scale?: number;
}) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = clock.getElapsedTime() * speed;
    g.current.position.x = position[0] + Math.sin(t) * 1.4;
    g.current.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI;
  });
  return (
    <group ref={g} position={position} scale={scale}>
      <mesh>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      <mesh position={[-0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.16, 0.3, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.16, 0.08, 0.2]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.19, 0.08, 0.24]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function Whale() {
  return (
    <Float speed={1.2} floatIntensity={0.6} rotationIntensity={0.2}>
      <group position={[-2.3, -3.4, -0.6]} scale={1.1}>
        <mesh>
          <sphereGeometry args={[0.6, 24, 24]} />
          <meshStandardMaterial color="#60a5fa" roughness={0.4} />
        </mesh>
        <mesh position={[-0.65, 0.1, 0]} rotation={[0, 0, Math.PI / 2.4]}>
          <coneGeometry args={[0.3, 0.55, 14]} />
          <meshStandardMaterial color="#60a5fa" />
        </mesh>
        <mesh position={[0.35, 0.2, 0.42]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.4, 0.2, 0.49]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      </group>
    </Float>
  );
}

function ZoneSlab({
  zone,
  y,
  height,
  active,
  onSelect,
}: {
  zone: Zone;
  y: number;
  height: number;
  active: boolean;
  onSelect: () => void;
}) {
  const mesh = useRef<Mesh>(null);
  return (
    <mesh
      ref={mesh}
      position={[0, y, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <boxGeometry args={[7, height, 4]} />
      <meshStandardMaterial
        color={zone.color}
        transparent
        opacity={active ? 0.55 : 0.28}
        roughness={0.1}
      />
      <Html center distanceFactor={12} position={[-4.4, 0, 0]}>
        <button
          type="button"
          onClick={onSelect}
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
            active ? "bg-white text-slate-900" : "bg-slate-900/70 text-white"
          }`}
        >
          {zone.emoji} {zone.name} · {zone.from}–{zone.to} m
        </button>
      </Html>
    </mesh>
  );
}

export default function OceanScene({
  activeZone,
  onSelectZone,
}: {
  activeZone: string;
  onSelectZone: (id: string) => void;
}) {
  return (
    <Canvas camera={{ position: [0, 0.5, 12], fov: 45 }} dpr={[1, 1.8]}>
      <color attach="background" args={["#04182f"]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 8, 6]} intensity={1.5} />
      <pointLight position={[-4, -4, 3]} intensity={30} color="#38bdf8" />
      <Stars radius={40} depth={20} count={800} factor={2} fade speed={0.6} />
      <Sparkles count={60} scale={[7, 8, 4]} size={2} speed={0.3} color="#a5f3fc" />

      <Suspense fallback={null}>
        <Satellite />
      </Suspense>

      {/* Sea surface */}
      <mesh position={[0, 2.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 4]} />
        <meshStandardMaterial color="#7dd3fc" transparent opacity={0.5} />
      </mesh>

      <ZoneSlab
        zone={ZONES[0]!}
        y={1.1}
        height={2.2}
        active={activeZone === "sunlight"}
        onSelect={() => onSelectZone("sunlight")}
      />
      <ZoneSlab
        zone={ZONES[1]!}
        y={-1.2}
        height={2.4}
        active={activeZone === "twilight"}
        onSelect={() => onSelectZone("twilight")}
      />
      <ZoneSlab
        zone={ZONES[2]!}
        y={-3.8}
        height={2.8}
        active={activeZone === "midnight"}
        onSelect={() => onSelectZone("midnight")}
      />

      <Fish position={[-1.2, 1.4, 1.2]} color="#fb923c" speed={0.7} />
      <Fish position={[1.4, 0.6, 1.4]} color="#f472b6" speed={0.5} scale={0.8} />
      <Fish position={[-0.6, -1.4, 1.2]} color="#22d3ee" speed={0.4} scale={0.9} />
      <Whale />
      <ArgoFloat />

      <OrbitControls
        enablePan={false}
        minDistance={7}
        maxDistance={18}
        maxPolarAngle={Math.PI / 1.6}
      />
    </Canvas>
  );
}
