"use client";
import { Canvas, useFrame } from "@react-three/fiber";
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
  const spin = useRef<THREE.Group>(null);
  const built = useMemo(() => {
    const lib = new ModelLibrary([def]);
    const inst = lib.instance(def.id, { tint, variant: 0, seed: 3 })!;
    const b = lib.bounds(def.id);
    const size = Math.max(b.radius * 2, b.height);
    const s = 3.2 / size;
    const g = new THREE.Group();
    g.add(inst.object);
    g.scale.setScalar(s);
    g.position.y = -b.minY * s - (b.height * s) / 2 + (def.placement === "air" ? 0 : 0.1);
    const baseGeo = new THREE.CylinderGeometry(2.2, 2.4, 0.25, 7);
    const baseMat = new THREE.MeshStandardMaterial({ color: "#d6c6a8", flatShading: true, roughness: 0.95 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = g.position.y - 0.13;
    base.receiveShadow = true;
    return { lib, inst, g, base, baseGeo, baseMat };
  }, [def, tint]);
  useEffect(
    () => () => {
      built.inst.dispose();
      built.lib.dispose();
      built.baseGeo.dispose();
      built.baseMat.dispose();
    },
    [built],
  );
  useFrame((state) => {
    const t = still ? 0 : state.clock.elapsedTime;
    built.inst.update({ time: t, progress: 0, moving: moving && !still, night: false, phase: 0 });
    if (spin.current) spin.current.rotation.y = still ? 0.7 : t * 0.45;
  });
  return (
    <group ref={spin}>
      <primitive object={built.g} />
      {def.placement !== "air" ? <primitive object={built.base} /> : null}
    </group>
  );
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
        dpr={[1, 1.5]}
        camera={{ position: [4.6, 2.6, 4.6], fov: 38 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <hemisphereLight args={["#fff4e0", "#8a7a62", 1.2]} />
        <directionalLight position={[5, 8, 4]} intensity={2.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-5, 2, -4]} intensity={0.7} color="#ff9b5e" />
        <Turntable def={def} tint={tint} moving={moving} still={reduce} />
      </Canvas>
    </div>
  );
}
