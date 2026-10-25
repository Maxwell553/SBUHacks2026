"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ModelLibrary } from "@/lib/lowpoly/compiler";
import type { ModelDefinition } from "@/lib/schema/model";
import { useInView } from "@/components/three/useInView";

function Turntable({
  def,
  tint,
  moving,
  still,
}: {
  def: ModelDefinition;
  tint?: string;
  moving: boolean;
  still: boolean;
}) {
  const { camera, size } = useThree();
  const built = useMemo(() => {
    const lib = new ModelLibrary([def]);
    const inst = lib.instance(def.id, { tint, variant: 0, seed: 3 })!;
    inst.update({ time: 0, progress: 0, moving: false, night: false, phase: 0 });
    const bounds = new THREE.Box3().setFromObject(inst.object);
    const extent = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 3.8 / Math.max(extent.x, extent.y, extent.z, 0.1);
    const root = new THREE.Group();
    const subject = new THREE.Group();
    // Center the mesh and its ground using the exact same measured rest pose.
    inst.object.position.set(-center.x, -bounds.min.y, -center.z);
    subject.add(inst.object);
    subject.scale.setScalar(scale);
    subject.rotation.y = def.placement === "water" ? -0.55 : def.placement === "air" ? -0.45 : -0.65;
    const subjectHeight = extent.y * scale;
    const floor = -subjectHeight * 0.45;
    subject.position.y = floor + (def.placement === "air" ? 0.4 : def.placement === "water" ? -0.12 : 0);
    root.add(subject);
    const resources: { dispose(): void }[] = [];
    const mesh = (geometry: THREE.BufferGeometry, color: string, position: [number, number, number]) => {
      const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(...position);
      m.receiveShadow = true;
      m.castShadow = true;
      resources.push(geometry, mat);
      root.add(m);
      return m;
    };
    const radius = Math.max(1.3, Math.hypot(extent.x, extent.z) * scale * 0.5 + 0.35);
    if (def.placement !== "air") {
      mesh(new THREE.CylinderGeometry(radius, radius, 0.18, 64), def.placement === "water" ? "#358e9c" : "#8c9b74", [
        0,
        floor - 0.09,
        0,
      ]);
      mesh(new THREE.CylinderGeometry(radius * 1.01, radius * 0.97, 0.16, 64), "#c7b695", [0, floor - 0.26, 0]);
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        const r = radius * (0.78 + (i % 3) * 0.055);
        const detail = mesh(new THREE.IcosahedronGeometry(0.12, 0), def.placement === "water" ? "#b7d9d7" : "#d5c8a7", [
          Math.sin(angle) * r,
          floor + 0.025,
          Math.cos(angle) * r,
        ]);
        detail.scale.set(def.placement === "water" ? 2.4 : 1, def.placement === "water" ? 0.12 : 0.6, 0.5);
        detail.rotation.y = -angle;
      }
    } else {
      // Clouds remain behind the wings, never scattered across the silhouette.
      for (const [x, y, z] of [
        [-1.7, 1.4, -2.4],
        [1.9, 0.9, -2.8],
        [-1.5, -0.8, -2.2],
      ]) {
        for (let i = 0; i < 3; i++) {
          const cloud = mesh(new THREE.IcosahedronGeometry(0.35, 1), "#fffdf6", [
            x + i * 0.3,
            y + (i === 1 ? 0.12 : 0),
            z,
          ]);
          cloud.scale.set(1.1, 0.6, 0.7);
        }
      }
    }
    const fullBounds = new THREE.Box3().setFromObject(root);
    return { lib, inst, root, subject, baseY: subject.position.y, resources, bounds: fullBounds };
  }, [def, tint]);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const center = built.bounds.getCenter(new THREE.Vector3());
    const extent = built.bounds.getSize(new THREE.Vector3());
    const distance =
      Math.max(extent.y / 0.78, extent.x / (size.width / size.height) / 0.84) /
        (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) +
      extent.z * 0.2;
    cam.position.copy(center).add(new THREE.Vector3(0.6, 0.35, 1).normalize().multiplyScalar(distance));
    cam.lookAt(center);
    cam.updateProjectionMatrix();
  }, [built, camera, size.width, size.height]);
  useEffect(
    () => () => {
      built.inst.dispose();
      built.lib.dispose();
      built.resources.forEach((r) => r.dispose());
    },
    [built],
  );
  useFrame((state) => {
    const t = still ? 0 : state.clock.elapsedTime;
    built.inst.update({ time: t, progress: 0, moving: moving && !still, night: false, phase: 0 });
    // Keep a readable three-quarter view; animate the subject instead of spinning the display.
    if (def.placement === "water") {
      built.subject.position.setY(built.baseY + Math.sin(t * 1.2) * 0.025);
      built.subject.rotation.set(0, built.subject.rotation.y, Math.sin(t * 0.9) * 0.015);
    } else if (def.placement === "air") {
      built.subject.position.setY(built.baseY + Math.sin(t * 0.8) * 0.06);
      built.subject.rotation.set(Math.sin(t * 0.6) * 0.035, built.subject.rotation.y, 0);
    }
  });
  return <primitive object={built.root} />;
}

export function ModelTurntable({
  def,
  tint,
  moving = false,
}: {
  def: ModelDefinition;
  tint?: string;
  moving?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduce = !!useReducedMotion();
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows="percentage"
        frameloop={reduce ? "demand" : inView ? "always" : "never"}
        dpr={[1, 1.75]}
        camera={{ position: [4, 3, 6], fov: 38 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      >
        <hemisphereLight args={["#fff7e8", "#757a71", 1.6]} />
        <directionalLight
          position={[-3, 8, 5]}
          intensity={3}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-normalBias={0.03}
        />
        <directionalLight position={[4, 3, -4]} intensity={1.1} color="#9ecbd5" />
        <Turntable def={def} tint={tint} moving={moving} still={reduce} />
      </Canvas>
    </div>
  );
}
