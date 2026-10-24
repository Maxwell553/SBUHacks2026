"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ModelLibrary, type ModelInstance } from "@/lib/lowpoly/compiler";
import { makeNoise2, makeRng } from "@/lib/lowpoly/core";
import {
  EXAMPLE_BIPLANE,
  EXAMPLE_BROADLEAF_TREE,
  EXAMPLE_CAMPFIRE,
  EXAMPLE_COG_SHIP,
  EXAMPLE_FOOT_SOLDIER,
  EXAMPLE_STONE_KEEP,
} from "@/lib/content/model-examples";
import { useInView } from "@/components/three/useInView";

interface Actor {
  inst: ModelInstance;
  group: THREE.Group;
  tick: (t: number) => void;
  moving: boolean;
}

/** Decorative diorama: example ModelDefinitions through the generic compiler. */
function Diorama({ still }: { still: boolean }) {
  const root = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  const built = useMemo(() => {
    const lib = new ModelLibrary([
      EXAMPLE_FOOT_SOLDIER,
      EXAMPLE_STONE_KEEP,
      EXAMPLE_COG_SHIP,
      EXAMPLE_BROADLEAF_TREE,
      EXAMPLE_CAMPFIRE,
      EXAMPLE_BIPLANE,
    ]);
    const group = new THREE.Group();
    const disposables: { dispose(): void }[] = [];
    const actors: Actor[] = [];
    const rng = makeRng(42);
    const noise = makeNoise2(9);
    const S = 0.32;

    // Hex plinth.
    const plinthMat = new THREE.MeshStandardMaterial({ color: "#d6c6a8", flatShading: true, roughness: 0.95 });
    const plinthGeo = new THREE.CylinderGeometry(10.4, 9.4, 2.2, 6);
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -1.6;
    plinth.receiveShadow = true;
    const rimGeo = new THREE.CylinderGeometry(10.5, 10.5, 0.16, 6);
    const rimMat = new THREE.MeshStandardMaterial({ color: "#a64f35", flatShading: true, roughness: 0.8 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = -0.48;
    group.add(plinth, rim);
    disposables.push(plinthMat, plinthGeo, rimGeo, rimMat);

    // Water.
    const waterGeo = new THREE.CylinderGeometry(10.1, 10.1, 0.5, 6, 1);
    const waterMat = new THREE.MeshStandardMaterial({
      color: "#2b8fb3",
      flatShading: true,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -0.55;
    water.receiveShadow = true;
    group.add(water);
    disposables.push(waterGeo, waterMat);

    // Island terrain.
    const isl = new THREE.CylinderGeometry(5.6, 6.4, 1.2, 9, 3).toNonIndexed();
    const pos = isl.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        y = pos.getY(i);
      if (y > 0.5) pos.setY(i, y + noise(x * 0.4, z * 0.4) * 0.35);
      pos.setX(i, x * (1 + noise(x * 0.3 + 4, z * 0.3) * 0.08));
    }
    isl.computeVertexNormals();
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const yAvg = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      c.set(yAvg > 0.45 ? (rng() > 0.5 ? "#7fae4f" : "#6b9a43") : yAvg > -0.2 ? "#e2cf98" : "#8a7a5a");
      for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
    }
    isl.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const islMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    const island = new THREE.Mesh(isl, islMat);
    island.position.y = -0.2;
    island.receiveShadow = true;
    island.castShadow = true;
    group.add(island);
    disposables.push(isl, islMat);

    const add = (
      id: string,
      o: {
        x: number;
        z: number;
        y?: number;
        rot?: number;
        scale?: number;
        tint?: string;
        variant?: number;
        seed?: number;
      },
    ) => {
      const inst = lib.instance(id, { tint: o.tint, variant: o.variant ?? 0, seed: o.seed ?? 1 });
      if (!inst) return null;
      const g = new THREE.Group();
      g.add(inst.object);
      g.position.set(o.x, o.y ?? 0.42, o.z);
      g.rotation.y = o.rot ?? 0;
      g.scale.setScalar(o.scale ?? S);
      group.add(g);
      return { inst, g };
    };

    const keep = add("stone_keep", { x: -0.8, z: -1.4, rot: 0.5, tint: "#3f5fa8", scale: 0.3 });
    if (keep) actors.push({ inst: keep.inst, group: keep.g, tick: () => {}, moving: false });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const r = 3.6 + rng() * 1.2;
      const t = add("broadleaf_tree", {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        rot: rng() * 6,
        variant: i % 4,
        scale: 0.3 + rng() * 0.12,
        seed: i,
      });
      if (t) actors.push({ inst: t.inst, group: t.g, tick: () => {}, moving: false });
    }
    const fire = add("campfire", { x: 2.0, z: 1.2, scale: 0.55 });
    if (fire) actors.push({ inst: fire.inst, group: fire.g, tick: () => {}, moving: false });

    // Patrol of soldiers walking a loop.
    for (let i = 0; i < 7; i++) {
      const s = add("foot_soldier", {
        x: 0,
        z: 0,
        tint: i % 2 ? "#3f5fa8" : "#8b3a2b",
        variant: i,
        seed: i + 10,
        scale: 0.36,
      });
      if (!s) continue;
      const off = i * 0.42;
      actors.push({
        inst: s.inst,
        group: s.g,
        moving: true,
        tick: (t) => {
          const a = t * 0.16 + off;
          s.g.position.set(Math.cos(a) * 2.7 + 0.6, 0.42, Math.sin(a) * 2.0 + 0.8);
          s.g.rotation.y = -a - Math.PI / 2 + Math.PI;
        },
      });
    }

    // Ship circling on the water.
    const ship = add("cog_ship", { x: 0, z: 0, y: -0.35, tint: "#efe6d0", scale: 0.2 });
    if (ship)
      actors.push({
        inst: ship.inst,
        group: ship.g,
        moving: true,
        tick: (t) => {
          const a = -t * 0.12;
          ship.g.position.set(Math.cos(a) * 8.0, -0.32 + Math.sin(t * 1.3) * 0.05, Math.sin(a) * 8.0);
          ship.g.rotation.y = -a + Math.PI;
          ship.g.rotation.x = Math.sin(t * 0.9) * 0.04;
        },
      });

    // Biplane overhead.
    const plane = add("biplane", { x: 0, z: 0, y: 7, tint: "#c8a24a", scale: 0.32 });
    if (plane)
      actors.push({
        inst: plane.inst,
        group: plane.g,
        moving: true,
        tick: (t) => {
          const a = t * 0.35;
          plane.g.position.set(Math.cos(a) * 7.5, 6.5 + Math.sin(t * 0.8) * 0.5, Math.sin(a) * 6.5);
          plane.g.rotation.set(0.25, -a - Math.PI / 2, 0);
        },
      });

    // Clouds.
    const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 1 });
    const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
    disposables.push(cloudMat, cloudGeo);
    const clouds: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(cloudGeo, cloudMat);
        m.scale.set(1.3 + rng(), 0.8 + rng() * 0.4, 1 + rng() * 0.5);
        m.position.set(k * 1.4 - 1.4, rng() * 0.5, rng() * 0.6);
        g.add(m);
      }
      g.position.set(-8 + i * 5.5, 8.5 + rng() * 2.5, -4 + rng() * 6);
      clouds.push(g);
      group.add(g);
    }

    return { lib, group, disposables, actors, clouds };
  }, []);

  useEffect(
    () => () => {
      built.actors.forEach((a) => a.inst.dispose());
      built.disposables.forEach((d) => d.dispose());
      built.lib.dispose();
    },
    [built],
  );

  useFrame((state) => {
    // Reduced motion: a single static pose, no drift or pointer parallax.
    const t = still ? 6 : state.clock.elapsedTime;
    for (const a of built.actors) {
      a.tick(t);
      a.inst.update({ time: t, progress: 0, moving: a.moving && !still, night: false, phase: 0 });
    }
    if (!still) built.clouds.forEach((c, i) => (c.position.x = ((c.position.x + 0.006 + i * 0.001 + 12) % 24) - 12));
    if (root.current) {
      root.current.rotation.y = still ? 0.35 : t * 0.06 + pointer.x * 0.35;
      root.current.rotation.x = still ? 0 : -pointer.y * 0.08;
      root.current.position.y = still ? 0 : Math.sin(t * 0.6) * 0.15;
    }
  });

  return (
    <group ref={root}>
      <primitive object={built.group} />
    </group>
  );
}

export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduce = !!useReducedMotion();
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        shadows="percentage"
        frameloop={reduce ? "demand" : inView ? "always" : "never"}
        dpr={[1, 1.75]}
        camera={{ position: [15, 11, 17], fov: 34 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
        onCreated={({ camera }) => camera.lookAt(0, 0.8, 0)}
      >
        <hemisphereLight args={["#fff4e0", "#8a7a62", 1.25]} />
        <directionalLight
          position={[12, 18, 8]}
          intensity={2.8}
          color="#fff1dc"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-10, 6, -12]} intensity={0.8} color="#ff9b5e" />
        <Diorama still={reduce} />
      </Canvas>
    </div>
  );
}
