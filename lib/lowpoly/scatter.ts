/**
 * Instanced ground detail: grass tufts, pebbles, shrubs and generic trees,
 * chosen per biome. Every category is one draw call; wind sway runs in the
 * vertex shader from a shared time uniform, so frames stay deterministic.
 */
import * as THREE from "three";
import type { Setting, Settlement, Weather } from "@/lib/schema/video";
import { Builder, makeRng, range, type Rng } from "@/lib/lowpoly/core";

export interface ScatterSpec {
  setting: Setting;
  weather: Weather;
  night: boolean;
  seed: number;
  center: { x: number; z: number };
  heightAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  /** True where nothing may be placed (path, subjects, set dressing). */
  blocked(x: number, z: number, r: number): boolean;
  /** Add generic trees (off when the script supplies its own vegetation). */
  trees: boolean;
  /** Built-up places keep only sparse weeds and stones on their paving. */
  settlement?: Settlement;
}

const DENSITY: Record<Settlement, number> = { wild: 1, village: 0.8, town: 0.3, city: 0.12 };

export interface Scatter {
  group: THREE.Group;
  update(t: number): void;
  dispose(): void;
}

type TreeStyle = "broadleaf" | "pine" | "dead" | "tall";

interface Biome {
  tufts: number;
  tuftColors: string[];
  tuftStyle: "blades" | "fern" | "mound" | "dry";
  rocks: number;
  rockColors: string[];
  shrubs: number;
  shrubColors: string[];
  trees: number;
  treeStyles: TreeStyle[];
  canopy: string[];
}

const GREEN = ["#6f9e43", "#5f8f3a", "#82ad4f", "#557f36"];
const STONE = ["#8f8a80", "#7d786f", "#a29c90"];

const BIOMES: Partial<Record<Setting, Biome>> = {
  plains: {
    tufts: 2600,
    tuftColors: GREEN,
    tuftStyle: "blades",
    rocks: 150,
    rockColors: STONE,
    shrubs: 90,
    shrubColors: GREEN,
    trees: 70,
    treeStyles: ["broadleaf", "broadleaf", "pine"],
    canopy: ["#4f8a3c", "#5f9a3e", "#6aa448"],
  },
  hills: {
    tufts: 2300,
    tuftColors: GREEN,
    tuftStyle: "blades",
    rocks: 220,
    rockColors: STONE,
    shrubs: 110,
    shrubColors: GREEN,
    trees: 90,
    treeStyles: ["broadleaf", "pine"],
    canopy: ["#4f8a3c", "#5f9a3e", "#3f7a3a"],
  },
  forest: {
    tufts: 1900,
    tuftColors: GREEN,
    tuftStyle: "fern",
    rocks: 140,
    rockColors: STONE,
    shrubs: 210,
    shrubColors: GREEN,
    trees: 320,
    treeStyles: ["broadleaf", "pine", "tall"],
    canopy: ["#3f7a3a", "#4f8a3c", "#2f6b3f"],
  },
  jungle: {
    tufts: 2200,
    tuftColors: ["#3f924a", "#2f7a3a", "#5aa857"],
    tuftStyle: "fern",
    rocks: 90,
    rockColors: STONE,
    shrubs: 260,
    shrubColors: ["#2f7a3a", "#40924a"],
    trees: 300,
    treeStyles: ["tall", "broadleaf"],
    canopy: ["#2f7a3a", "#40924a", "#2a6b35"],
  },
  river: {
    tufts: 2400,
    tuftColors: GREEN,
    tuftStyle: "blades",
    rocks: 180,
    rockColors: STONE,
    shrubs: 110,
    shrubColors: GREEN,
    trees: 90,
    treeStyles: ["broadleaf", "broadleaf", "pine"],
    canopy: ["#4f8a3c", "#5f9a3e", "#6aa448"],
  },
  coast: {
    tufts: 1800,
    tuftColors: ["#8aab55", "#7a9d48", "#a3b866"],
    tuftStyle: "blades",
    rocks: 240,
    rockColors: STONE,
    shrubs: 80,
    shrubColors: GREEN,
    trees: 50,
    treeStyles: ["broadleaf", "pine"],
    canopy: ["#4f8a3c", "#5f9a3e"],
  },
  desert: {
    tufts: 450,
    tuftColors: ["#b9a060", "#a68d52", "#c9b072"],
    tuftStyle: "dry",
    rocks: 420,
    rockColors: ["#c08e52", "#a87a46", "#d3a66a"],
    shrubs: 40,
    shrubColors: ["#8a8a4a", "#9a8f55"],
    trees: 0,
    treeStyles: [],
    canopy: [],
  },
  snow: {
    tufts: 520,
    tuftColors: ["#eef3f8", "#dde6ef"],
    tuftStyle: "mound",
    rocks: 190,
    rockColors: ["#8a8f96", "#767c84"],
    shrubs: 40,
    shrubColors: ["#5f7360"],
    trees: 90,
    treeStyles: ["pine"],
    canopy: ["#2f5a45", "#38664f"],
  },
  mountains: {
    tufts: 900,
    tuftColors: ["#7f9a52", "#6c8746"],
    tuftStyle: "blades",
    rocks: 520,
    rockColors: STONE,
    shrubs: 60,
    shrubColors: GREEN,
    trees: 120,
    treeStyles: ["pine"],
    canopy: ["#2f6b3f", "#376f45"],
  },
  city: {
    tufts: 520,
    tuftColors: ["#7f9a52", "#6c8746"],
    tuftStyle: "blades",
    rocks: 220,
    rockColors: ["#8d897f", "#9d998f", "#7a766e"],
    shrubs: 30,
    shrubColors: GREEN,
    trees: 18,
    treeStyles: ["broadleaf"],
    canopy: ["#4f8a3c", "#5f9a3e"],
  },
  battlefield: {
    tufts: 900,
    tuftColors: ["#8a8456", "#77714a", "#9a9060"],
    tuftStyle: "dry",
    rocks: 420,
    rockColors: ["#6d6255", "#5f5548", "#7f7466"],
    shrubs: 30,
    shrubColors: ["#6c6a45"],
    trees: 18,
    treeStyles: ["dead"],
    canopy: [],
  },
  lunar: {
    tufts: 0,
    tuftColors: [],
    tuftStyle: "dry",
    rocks: 700,
    rockColors: ["#8a8a8f", "#9d9da2", "#77777c"],
    shrubs: 0,
    shrubColors: [],
    trees: 0,
    treeStyles: [],
    canopy: [],
  },
};

function tuftGeometry(style: Biome["tuftStyle"], rng: Rng) {
  const b = new Builder(rng, 0.12);
  if (style === "mound") {
    b.ico(0.5, 0, "#ffffff", { p: [0, 0.08, 0], s: [1.3, 0.35, 1] });
  } else if (style === "fern") {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.cone(0.07, 0.75, 3, "#ffffff", {
        p: [Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12],
        r: [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7],
      });
    }
  } else {
    const n = style === "dry" ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng();
      const h = range(rng, 0.22, 0.42);
      b.cone(0.035, h, 3, "#ffffff", {
        p: [Math.cos(a) * 0.05, h / 2, Math.sin(a) * 0.05],
        r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35],
      });
    }
  }
  return b.geometries().solid!;
}

function treeGeometry(style: TreeStyle, canopy: string, rng: Rng) {
  const b = new Builder(rng, 0.08);
  const bark = style === "dead" ? "#5a4a3c" : "#6b4a2f";
  if (style === "pine") {
    b.cyl(0.12, 0.2, 1.6, 5, bark, { p: [0, 0.8, 0] });
    [
      [1.6, 2.2, 1.9],
      [1.25, 1.9, 3.1],
      [0.85, 1.6, 4.2],
    ].forEach(([r, h, y]) => b.cone(r, h, 6, canopy, { p: [0, y, 0], r: [0, rng() * 3, 0] }));
  } else if (style === "dead") {
    b.cyl(0.08, 0.18, 3.2, 5, bark, { p: [0, 1.6, 0] });
    b.cyl(0.04, 0.07, 1.3, 4, bark, { p: [0.35, 2.4, 0], r: [0, 0, -0.8] });
    b.cyl(0.04, 0.06, 1.0, 4, bark, { p: [-0.3, 2.8, 0.1], r: [0.3, 0, 0.9] });
  } else {
    const tall = style === "tall";
    const th = tall ? 3.6 : 2.0;
    b.cyl(0.14, 0.24, th, 6, bark, { p: [0, th / 2, 0] });
    b.ico(tall ? 1.7 : 1.5, 1, canopy, { p: [0, th + (tall ? 1.1 : 0.9), 0], s: [1, 0.85, 1], r: [rng(), rng(), 0] });
    b.ico(tall ? 1.1 : 1.0, 0, canopy, { p: [0.8, th + 0.3, 0.35] });
    b.ico(0.95, 0, canopy, { p: [-0.7, th + 0.5, -0.4] });
  }
  return b.geometries().solid!;
}

function shrubGeometry(rng: Rng) {
  const b = new Builder(rng, 0.1);
  b.ico(0.6, 0, "#ffffff", { p: [0, 0.4, 0], s: [1.2, 0.8, 1.1] });
  b.ico(0.45, 0, "#ffffff", { p: [0.45, 0.3, 0.2] });
  b.ico(0.4, 0, "#ffffff", { p: [-0.4, 0.28, -0.15] });
  return b.geometries().solid!;
}

function rockGeometry(rng: Rng) {
  const b = new Builder(rng, 0.14);
  b.dodeca(1, "#ffffff", { s: [1.2, 0.7, 1] });
  return b.geometries().solid!;
}

function swayMaterial(time: { value: number }, wind: number) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const uWind = { value: wind };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uWind = uWind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 phAt = instanceMatrix[3].xyz;
        #else
          vec3 phAt = vec3(0.0);
        #endif
        float phLift = max(0.0, position.y);
        transformed.x += sin(uTime * 1.6 + phAt.x * 0.35 + phAt.z * 0.27) * uWind * phLift;
        transformed.z += cos(uTime * 1.25 + phAt.z * 0.31) * uWind * 0.6 * phLift;`,
      );
  };
  mat.customProgramCacheKey = () => "ph-sway-v1";
  return mat;
}

export function buildScatter(spec: ScatterSpec): Scatter {
  const group = new THREE.Group();
  const biome = BIOMES[spec.setting];
  const disposables: { dispose(): void }[] = [];
  const time = { value: 0 };
  if (!biome) return { group, update() {}, dispose() {} };
  const rng = makeRng(spec.seed * 13 + 7);
  const windy = spec.weather === "storm" ? 2.4 : spec.weather === "rain" || spec.weather === "snow" ? 1.6 : 1;
  const snowy = spec.weather === "snow" || spec.setting === "snow";
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();

  const place = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    rMin: number,
    rMax: number,
    footprint: number,
    sizeLo: number,
    sizeHi: number,
    colors: string[],
    o: { shadow?: boolean; tilt?: number; squash?: [number, number] } = {},
  ) => {
    if (!count) return;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    let n = 0;
    for (let tries = 0; n < count && tries < count * 4; tries++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(range(rng, (rMin * rMin) / (rMax * rMax), 1)) * rMax;
      const x = spec.center.x + Math.cos(a) * r,
        z = spec.center.z + Math.sin(a) * r;
      const size = range(rng, sizeLo, sizeHi);
      if (spec.isWater(x, z) || spec.blocked(x, z, footprint * size)) continue;
      const tilt = o.tilt ?? 0;
      e.set(range(rng, -tilt, tilt), rng() * Math.PI * 2, range(rng, -tilt, tilt));
      const sq = o.squash ? range(rng, o.squash[0], o.squash[1]) : 1;
      m4.compose(v.set(x, spec.heightAt(x, z) - 0.03 * size, z), q.setFromEuler(e), sc.set(size, size * sq, size));
      mesh.setMatrixAt(n, m4);
      tint.set(colors[Math.floor(rng() * colors.length) % colors.length]).multiplyScalar(range(rng, 0.88, 1.1));
      if (snowy && colors !== biome.rockColors) tint.lerp(new THREE.Color("#eef3f8"), 0.45);
      mesh.setColorAt(n, tint);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = !!o.shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(geometry, mesh);
  };

  const plain = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  disposables.push(plain);
  const k = DENSITY[spec.settlement ?? "wild"];
  const built = spec.settlement === "town" || spec.settlement === "city";
  if (biome.tufts) {
    const mat = swayMaterial(time, (biome.tuftStyle === "mound" ? 0 : 0.06) * windy);
    disposables.push(mat);
    place(
      tuftGeometry(biome.tuftStyle, rng),
      mat,
      Math.round(biome.tufts * k),
      0.8,
      70,
      0.3,
      0.7,
      1.5,
      biome.tuftColors,
    );
  }
  place(
    rockGeometry(rng),
    plain,
    Math.round(biome.rocks * Math.max(k, 0.3)),
    1.5,
    110,
    1,
    0.08,
    0.7,
    biome.rockColors,
    {
      shadow: true,
      tilt: 0.4,
      squash: [0.5, 1],
    },
  );
  if (biome.shrubs) {
    const mat = swayMaterial(time, 0.025 * windy);
    disposables.push(mat);
    place(shrubGeometry(rng), mat, Math.round(biome.shrubs * k), 6, 140, 0.9, 0.6, 1.6, biome.shrubColors, {
      shadow: true,
    });
  }
  if (spec.trees && !built && biome.trees && biome.treeStyles.length) {
    const mat = swayMaterial(time, 0.012 * windy);
    disposables.push(mat);
    const styles = biome.treeStyles;
    const per = Math.ceil(biome.trees / styles.length);
    styles.forEach((style, i) => {
      const canopy = biome.canopy[i % Math.max(1, biome.canopy.length)] ?? "#4f8a3c";
      place(treeGeometry(style, canopy, rng), mat, per, 14, 260, 1.6, 0.75, 1.45, ["#ffffff"], { shadow: true });
    });
  }

  return {
    group,
    update(t) {
      time.value = t;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    },
  };
}
