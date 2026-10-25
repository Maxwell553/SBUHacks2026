"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import glyphData from "@/lib/typography/facet-glyphs.json";
import { useInView } from "@/components/three/useInView";

type GlyphJson = {
  unitsPerEm: number;
  cap: number;
  space: number;
  glyphs: Record<string, { advance: number; polygons: number[][][][] }>;
};
const DATA = glyphData as unknown as GlyphJson;

/** Our Facet typeface, extruded into faceted 3D letters straight from its outline data. */
function Word({ text, still }: { text: string; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  const built = useMemo(() => {
    const front = new THREE.MeshStandardMaterial({ color: "#fbf7ef", flatShading: true, roughness: 0.6 });
    const side = new THREE.MeshStandardMaterial({ color: "#a64f35", flatShading: true, roughness: 0.75 });
    const scale = 1 / DATA.unitsPerEm;
    let x = 0;
    const letters: { mesh: THREE.Mesh; x: number; phase: number }[] = [];
    const geos: THREE.BufferGeometry[] = [];
    for (const ch of text) {
      const g = DATA.glyphs[ch];
      if (!g) {
        x += DATA.space;
        continue;
      }
      const shapes = g.polygons.map((poly) => {
        const [outer, ...holes] = poly;
        const shape = new THREE.Shape(outer.map(([px, py]) => new THREE.Vector2(px, py)));
        holes.forEach((h) => shape.holes.push(new THREE.Path(h.map(([px, py]) => new THREE.Vector2(px, py)))));
        return shape;
      });
      const geo = new THREE.ExtrudeGeometry(shapes, {
        depth: 160,
        bevelEnabled: true,
        bevelThickness: 26,
        bevelSize: 16,
        bevelSegments: 1,
      });
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const cx = (bb.min.x + bb.max.x) / 2;
      geo.translate(-cx, 0, -80);
      geos.push(geo);
      const mesh = new THREE.Mesh(geo, [front, side]);
      mesh.castShadow = true;
      letters.push({ mesh, x: x + cx, phase: letters.length * 0.55 });
      x += g.advance;
    }
    const total = x;
    const root = new THREE.Group();
    letters.forEach((l) => {
      l.mesh.position.x = l.x - total / 2;
      root.add(l.mesh);
    });
    root.scale.setScalar(scale);
    return { root, letters, front, side, geos };
  }, [text]);

  useEffect(
    () => () => {
      built.geos.forEach((g) => g.dispose());
      built.front.dispose();
      built.side.dispose();
    },
    [built],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    built.letters.forEach((l, i) => {
      if (still) {
        l.mesh.position.y = 0;
        l.mesh.rotation.set(0, i % 2 ? 0.08 : -0.08, 0);
        return;
      }
      const k = Math.sin(t * 1.4 - l.phase);
      l.mesh.position.y = Math.max(0, k) * 90;
      l.mesh.rotation.y = Math.sin(t * 0.9 - l.phase) * 0.35 + (i % 2 ? 0.05 : -0.05);
      l.mesh.rotation.x = Math.max(0, k) * -0.18;
    });
    if (group.current) {
      group.current.rotation.y = still ? 0 : pointer.x * 0.35;
      group.current.rotation.x = -0.18 - (still ? 0 : pointer.y * 0.12);
    }
  });

  return (
    <group ref={group}>
      <primitive object={built.root} />
    </group>
  );
}

export function GlyphScene({ text = "POLYCHRONICLE" }: { text?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduce = !!useReducedMotion();
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        frameloop={reduce ? "demand" : inView ? "always" : "never"}
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.9, 8.6], fov: 38 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      >
        <hemisphereLight args={["#fff4e0", "#1d4f4b", 1.3]} />
        <directionalLight position={[4, 6, 6]} intensity={2.4} color="#fff1dc" />
        <directionalLight position={[-6, -2, 3]} intensity={0.9} color="#f2c9a8" />
        <group position={[0, -0.25, 0]}>
          <Word text={text} still={reduce} />
        </group>
      </Canvas>
    </div>
  );
}
