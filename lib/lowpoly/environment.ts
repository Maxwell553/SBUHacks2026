/**
 * Procedural environments: faceted terrain per setting with world-scale
 * ground texture, a street or path along the shot corridor, animated
 * low-poly water, gradient sky dome with sun glow, distant ridge silhouettes,
 * exponential haze, clouds, stars and weather. Everything is seeded and a
 * pure function of time.
 */
import * as THREE from "three";
import type { Banks, Setting, Settlement, TimeOfDay, Weather } from "@/lib/schema/video";
import { clamp, lerp, makeNoise2, makeRng, range, smooth } from "@/lib/lowpoly/core";
import { makeSmoke, type Effect } from "@/lib/lowpoly/effects";
import { buildGlobe } from "@/lib/lowpoly/globe";
import { GROUND_TILE_METRES, glowTexture, groundTexture, type GroundKind } from "@/lib/lowpoly/textures";
import type { Corridor } from "@/lib/lowpoly/world";

export interface EnvSpec {
  setting: Setting;
  timeOfDay: TimeOfDay;
  weather: Weather;
  palette?: { sky?: string; ground?: string; accent?: string };
}

export interface EnvOptions {
  forceWater?: boolean;
  /** World point the shot is about; terrain detail and the sky centre here. */
  focus?: { x: number; z: number };
  /** Street/path corridor: ground is flattened and paved along it. */
  corridor?: Corridor | null;
  /** Indoor shot: no falling or drifting weather particles. */
  interior?: boolean;
  /** River or canal channel running along the view axis (replaces the legacy band). */
  waterway?: Waterway | null;
  /** How built-up the ground around the action is. */
  settlement?: Settlement;
  /** Coast shot of a vessel: the sea lies toward the camera and the shoreline this far behind the focus. */
  offshore?: number | null;
}

export interface Waterway {
  /** The channel runs along z through x = cx. */
  cx: number;
  halfWidth: number;
  banks: Banks;
  /** Paved quay width on each bank (embankments). */
  quay: number;
  /** Bank-top height above the water surface. */
  bankHeight: number;
}

export interface Environment {
  group: THREE.Group;
  fog: THREE.Fog | THREE.FogExp2 | null;
  background: THREE.Color;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Unit vector toward the sun (or moon). */
  sunDir: THREE.Vector3;
  night: boolean;
  hasWater: boolean;
  /** Height of the rendered ground surface (exactly matches the mesh). */
  heightAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
  flash(t: number): number;
  update(t: number): void;
  dispose(): void;
}

interface Light {
  top: string;
  horizon: string;
  sun: string;
  sunI: number;
  elev: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  water: string;
}

const TOD: Record<TimeOfDay, Light> = {
  dawn: {
    top: "#3d4a8c",
    horizon: "#ffb38a",
    sun: "#ffc9a0",
    sunI: 2.5,
    elev: 11,
    hemiSky: "#c3c8ff",
    hemiGround: "#6a5040",
    hemiI: 0.95,
    water: "#3a6f9a",
  },
  day: {
    top: "#3f7fd6",
    horizon: "#d6eaff",
    sun: "#fff1da",
    sunI: 3.1,
    elev: 38,
    hemiSky: "#d4e6ff",
    hemiGround: "#6f6a52",
    hemiI: 1.05,
    water: "#2b8fb3",
  },
  dusk: {
    top: "#2a2152",
    horizon: "#ff7a45",
    sun: "#ff9b5e",
    sunI: 2.4,
    elev: 8,
    hemiSky: "#a08ad0",
    hemiGround: "#4a3330",
    hemiI: 0.8,
    water: "#3c4f80",
  },
  night: {
    top: "#04060e",
    horizon: "#1d2748",
    sun: "#9fb4ff",
    sunI: 0.9,
    elev: 40,
    hemiSky: "#40508a",
    hemiGround: "#151520",
    hemiI: 0.55,
    water: "#11314f",
  },
};

const GROUND: Record<Setting, [string, string, string]> = {
  plains: ["#86b352", "#6f9c45", "#9cbd5e"],
  hills: ["#73a34b", "#5d8c3e", "#93b663"],
  forest: ["#558f3f", "#437a35", "#6ea04c"],
  desert: ["#e4bb76", "#d4a35c", "#efcc8e"],
  snow: ["#e8eef5", "#d3dce8", "#ffffff"],
  mountains: ["#829070", "#6c7660", "#9ea493"],
  coast: ["#86b352", "#6f9c45", "#9cbd5e"],
  ocean: ["#86b352", "#6f9c45", "#9cbd5e"],
  river: ["#86b352", "#6f9c45", "#9cbd5e"],
  city: ["#a8a296", "#968f83", "#b6b0a4"],
  jungle: ["#40924a", "#2f7a3a", "#5aa857"],
  battlefield: ["#7d6e51", "#62563f", "#8f7f5e"],
  lunar: ["#a3a3a8", "#85858b", "#bdbdc2"],
  orbit: ["#000000", "#000000", "#000000"],
};

const GROUND_KIND: Record<Setting, GroundKind | null> = {
  plains: "grass",
  hills: "grass",
  forest: "grass",
  jungle: "grass",
  coast: "grass",
  river: "grass",
  ocean: "sand",
  desert: "sand",
  snow: "snow",
  mountains: "rock",
  city: "paving",
  battlefield: "mud",
  lunar: "regolith",
  orbit: null,
};

/** Surface, colour and width share of the corridor's street or track. */
const PATH: Partial<Record<Setting, { kind: GroundKind; color: string; share: number }>> = {
  city: { kind: "cobble", color: "#8b867d", share: 1 },
  plains: { kind: "dirt", color: "#a48d68", share: 0.42 },
  hills: { kind: "dirt", color: "#a08a66", share: 0.4 },
  forest: { kind: "dirt", color: "#8f7a58", share: 0.38 },
  jungle: { kind: "mud", color: "#7d6a4e", share: 0.38 },
  coast: { kind: "sand", color: "#d8c595", share: 0.45 },
  river: { kind: "dirt", color: "#a48d68", share: 0.42 },
  desert: { kind: "sand", color: "#cfa66c", share: 0.45 },
  snow: { kind: "snow", color: "#c9d3de", share: 0.42 },
  mountains: { kind: "dirt", color: "#8f8471", share: 0.4 },
  battlefield: { kind: "mud", color: "#6b5d48", share: 0.6 },
};

/** Ridge silhouette height multiplier per setting (0 = none). */
const RIDGE: Partial<Record<Setting, number>> = {
  plains: 0.7,
  hills: 1.3,
  forest: 1.1,
  jungle: 1.2,
  coast: 0.9,
  river: 0.9,
  desert: 0.8,
  snow: 1.5,
  mountains: 2.4,
  city: 0.6,
  battlefield: 0.8,
  lunar: 0.9,
};

const WATER_SETTINGS = new Set<Setting>(["coast", "ocean", "river"]);
const tmp = new THREE.Color();
const mix = (a: string, b: string, k: number) => "#" + tmp.set(a).lerp(new THREE.Color(b), k).getHexString();

function lighting(spec: EnvSpec): Light & { haze: number } {
  const base = { ...TOD[spec.timeOfDay] };
  let haze = 0.0034;
  const greyTo = (k: number, grey = "#8d939c") => {
    base.horizon = mix(base.horizon, grey, k);
    base.top = mix(base.top, grey, k * 0.8);
    base.sunI *= 1 - k * 0.6;
  };
  switch (spec.weather) {
    case "cloudy":
      greyTo(0.3, "#b8bec6");
      haze = 0.0045;
      break;
    case "rain":
      greyTo(0.5);
      haze = 0.0085;
      break;
    case "storm":
      greyTo(0.7, "#5d6470");
      haze = 0.0105;
      break;
    case "fog":
      greyTo(0.55, "#c9ced3");
      haze = 0.03;
      break;
    case "dust":
      base.horizon = mix(base.horizon, "#d9b27a", 0.6);
      base.top = mix(base.top, "#c9a46a", 0.4);
      haze = 0.013;
      break;
    case "smoke":
      base.horizon = mix(base.horizon, "#8a7f73", 0.5);
      base.top = mix(base.top, "#5f5852", 0.35);
      base.sunI *= 0.7;
      haze = 0.011;
      break;
    case "snow":
      greyTo(0.35, "#dfe6ee");
      haze = 0.0085;
      break;
    default:
      break;
  }
  if (spec.setting === "lunar" || spec.setting === "orbit") {
    base.top = "#000000";
    base.horizon = "#05060c";
    base.sun = "#ffffff";
    base.sunI = 3.2;
    base.hemiI = 0.35;
    base.hemiSky = "#8090b0";
    base.hemiGround = "#202024";
  }
  if (spec.palette?.sky) {
    base.top = mix(base.top, spec.palette.sky, 0.5);
    base.horizon = mix(base.horizon, spec.palette.sky, 0.35);
  }
  return { ...base, haze };
}

export function buildEnvironment(spec: EnvSpec, seed: number, o: EnvOptions = {}): Environment {
  const rng = makeRng(seed);
  const noise = makeNoise2(seed);
  const L = lighting(spec);
  const night = spec.timeOfDay === "night";
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const effects: Effect[] = [];
  const setting = spec.setting;
  const space = setting === "lunar" || setting === "orbit";
  const hasWater = WATER_SETTINGS.has(setting) || (!!o.forceWater && !space);
  const F = o.focus ?? { x: 0, z: 0 };
  const C = o.corridor ?? null;

  // ---------------------------------------------------------- height field
  const craters = Array.from({ length: setting === "lunar" ? 14 : setting === "battlefield" ? 9 : 0 }, () => ({
    x: F.x + range(rng, -40, 40),
    z: F.z + range(rng, -40, 40),
    r: range(rng, 1.5, setting === "lunar" ? 7 : 3),
    d: range(rng, 0.4, 1.4),
  }));
  const offshore = o.offshore ?? null;
  const shore = (x: number) => (offshore != null ? F.z - offshore : -5) + 3.5 * noise(x * 0.04 + 11, 3.7, 2);
  const riverZ = (x: number) => 3 * Math.sin(x * 0.07 + (seed % 7));
  const WW = space ? null : (o.waterway ?? null);
  const waterBand = WW
    ? "channel"
    : setting === "coast" || setting === "ocean" || setting === "river"
      ? setting
      : o.forceWater
        ? "coast"
        : null;
  const urban = o.settlement === "town" || o.settlement === "city";
  // Natural channels meander gently; built ones are straight.
  const channelX = (z: number) =>
    WW ? WW.cx + (WW.banks === "natural" ? WW.halfWidth * 0.14 * Math.sin(z * 0.011 + (seed % 5)) : 0) : 0;
  const bankTop = WW ? Math.max(0.4, WW.bankHeight) : 0;

  const rawHeight = (x: number, z: number): number => {
    if (setting === "orbit") return -1000;
    const n = noise(x * 0.035, z * 0.035, 3);
    const r = Math.hypot(x, z);
    const f = smooth(clamp((r - 18) / 40, 0, 1));
    let h: number;
    switch (setting) {
      case "hills":
      case "snow":
        h = 1.1 * n + f * 11 * (0.6 + n);
        break;
      case "forest":
      case "jungle":
        h = 0.8 * n + f * 7 * (0.6 + n);
        break;
      case "desert":
        h = 0.9 * Math.sin(x * 0.12 + n * 3) + 0.4 * n + f * 6 * (0.5 + n);
        break;
      case "mountains":
        h = n + f * f * 30 * (0.45 + Math.abs(n));
        break;
      case "city":
        h = 0.05 * n;
        break;
      case "lunar":
        h = 0.6 * n + f * 6 * (0.5 + n);
        break;
      case "ocean":
        h = -7 + (r > 45 && n > 0.25 ? (n - 0.25) * 20 : 0);
        break;
      default:
        h = 0.6 * n + f * 4 * (0.5 + n);
    }
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.r;
      if (d < 1.3) h += d < 1 ? -c.d * (1 - d * d) : (c.d * 0.35 * (1.3 - d)) / 0.3;
    }
    if (waterBand === "coast") {
      // Distance out to sea: behind the action, or toward the camera offshore.
      const out = offshore != null ? z - shore(x) : shore(x) - z;
      if (out > 0) h = Math.min(h, -1.8 - out * 0.18);
      else h = Math.max(h, 0.35 + Math.min(1, -out * 0.2) * 0.4);
    } else if (waterBand === "river") {
      const d = Math.abs(z - riverZ(x));
      if (d < 3.6) h = -1.6;
      else if (d < 6) h = Math.min(h, lerp(-1.6, 0.4, (d - 3.6) / 2.4));
    } else if (WW) {
      const hw = WW.halfWidth;
      const d = Math.abs(x - channelX(z));
      const deep = -1.4 - Math.min(2.6, hw * 0.06);
      if (d < hw) h = lerp(deep, -0.7, Math.pow(d / hw, 3));
      else if (WW.banks === "embankment") h = d < hw + 0.5 ? lerp(-0.7, bankTop, (d - hw) / 0.5) : Math.max(h, bankTop);
      else {
        const slope = 3 + hw * 0.12;
        h = d < hw + slope ? lerp(-0.7, bankTop, smooth((d - hw) / slope)) : Math.max(h, bankTop);
      }
    }
    return h;
  };

  // Level ground under the action, the street and the frontage either side,
  // so buildings and people sit flush; terrain rises again beyond the town.
  const flatLevel = C ? rawHeight(C.cx, C.cz) : 0;
  const flatTarget = WW ? bankTop : hasWater ? Math.max(0.4, flatLevel) : flatLevel;
  /** 1 on the levelled ground around the action/street, fading to 0 beyond. */
  const flatWeight = (x: number, z: number) => {
    if (!C) return 0;
    // A built street levels a long band; open land only levels the action.
    const d =
      C.paved === false
        ? Math.max(0, Math.hypot(x - C.cx, z - C.cz) - (C.halfWidth + 22))
        : Math.hypot(
            Math.max(0, Math.abs(x - C.cx) - (C.halfWidth + 34)),
            Math.max(0, C.cz - C.back - 50 - z, z - (C.cz + C.front + 15)),
          );
    return 1 - smooth(clamp(d / 30, 0, 1));
  };
  const field = (x: number, z: number): number => {
    const h = rawHeight(x, z);
    if (!C || setting === "orbit" || setting === "ocean" || (hasWater && h < -0.05)) return h;
    // Leave the channel's own bank profile (slope or wall) untouched.
    if (WW && Math.abs(x - channelX(z)) < WW.halfWidth + (WW.banks === "natural" ? 4 + WW.halfWidth * 0.12 : 0.6))
      return h;
    const w = flatWeight(x, z);
    if (w <= 0) return h;
    // Built waterfronts sit level with their quay; elsewhere a gentle undulation.
    const lift = WW && WW.banks === "embankment" ? 0 : 0.12 * noise(x * 0.09 + 3, z * 0.09 + 1, 2);
    return lerp(h, Math.max(flatTarget + lift, WW ? bankTop : -Infinity), w);
  };

  // ---------------------------------------------------------- terrain grid
  // Graded grid centred on the focus: ~0.7 m cells near the action, growing
  // to ~11 m at the edge. heightAt interpolates the same triangles.
  const N = 160;
  const R = 450;
  const grade = (u: number) => R * (0.12 * u + 0.88 * Math.sign(u) * Math.pow(Math.abs(u), 2.2));
  const xs = new Float64Array(N + 1),
    zs = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const g = grade(-1 + (2 * i) / N);
    xs[i] = F.x + g;
    zs[i] = F.z + g;
  }
  const H = new Float32Array((N + 1) * (N + 1));
  if (setting !== "orbit")
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = field(xs[i], zs[j]);
  const cell = (arr: Float64Array, v: number) => {
    let lo = 0,
      hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= v) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const heightAt = (x: number, z: number): number => {
    if (setting === "orbit") return -1000;
    if (x <= xs[0] || x >= xs[N] || z <= zs[0] || z >= zs[N]) return field(x, z);
    const i = cell(xs, x),
      j = cell(zs, z);
    const fx = (x - xs[i]) / (xs[i + 1] - xs[i]),
      fz = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const h00 = H[j * (N + 1) + i],
      h10 = H[j * (N + 1) + i + 1],
      h01 = H[(j + 1) * (N + 1) + i],
      h11 = H[(j + 1) * (N + 1) + i + 1];
    return fz >= fx ? h00 + fz * (h01 - h00) + fx * (h11 - h01) : h00 + fx * (h10 - h00) + fz * (h11 - h10);
  };
  const isWater = (x: number, z: number) => hasWater && heightAt(x, z) < -0.05;

  if (setting !== "orbit") {
    const tris = N * N * 2;
    const pos = new Float32Array(tris * 9);
    const uv = new Float32Array(tris * 6);
    const cols = new Float32Array(tris * 9);
    let [low, mid, high] = GROUND[setting];
    if (spec.palette?.ground) {
      low = mix(low, spec.palette.ground, 0.6);
      mid = mix(mid, spec.palette.ground, 0.6);
      high = mix(high, spec.palette.ground, 0.6);
    }
    if (spec.weather === "snow" && setting !== "desert") {
      low = mix(low, "#eef2f7", 0.65);
      mid = mix(mid, "#e2e8f0", 0.65);
      high = mix(high, "#ffffff", 0.65);
    }
    const cLow = new THREE.Color(low),
      cMid = new THREE.Color(mid),
      cHigh = new THREE.Color(high);
    // Built-up ground: worn paving and packed earth around the action.
    const cUrban = [new THREE.Color("#a39c90"), new THREE.Color("#928b7f"), new THREE.Color("#b2ab9f")];
    const steep = new THREE.Color(setting === "desert" ? "#c08e52" : setting === "lunar" ? "#78787e" : "#7f7a6e");
    const peak = new THREE.Color("#f4f7fb"),
      beach = new THREE.Color("#e2cf98"),
      riverbank = new THREE.Color(urban ? "#857c6c" : "#7d7452"),
      bed = new THREE.Color("#b9a77a");
    const c = new THREE.Color();
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      d = new THREE.Vector3(),
      n = new THREE.Vector3();
    let t = 0;
    const tri = (i0: number, j0: number, i1: number, j1: number, i2: number, j2: number) => {
      a.set(xs[i0], H[j0 * (N + 1) + i0], zs[j0]);
      b.set(xs[i1], H[j1 * (N + 1) + i1], zs[j1]);
      d.set(xs[i2], H[j2 * (N + 1) + i2], zs[j2]);
      n.subVectors(b, a).cross(d.clone().sub(a)).normalize();
      const y = (a.y + b.y + d.y) / 3,
        cx = (a.x + b.x + d.x) / 3,
        cz = (a.z + b.z + d.z) / 3;
      const v = noise(cx * 0.08 + 3, cz * 0.08, 2);
      c.copy(v < -0.15 ? cMid : v > 0.2 ? cHigh : cLow);
      if (urban && setting !== "city") {
        const u = flatWeight(cx, cz) * (o.settlement === "city" ? 1 : 0.85);
        if (u > 0) c.lerp(cUrban[v < -0.15 ? 1 : v > 0.2 ? 2 : 0], u);
      }
      if (setting === "city") c.lerp(cMid, 0.55);
      if (n.y < 0.72) c.copy(steep);
      if ((setting === "mountains" || setting === "snow") && y > 12) c.copy(peak);
      if (hasWater && y < 0.6 && y > -0.4) c.copy(WW ? riverbank : beach);
      if (hasWater && y <= -0.4) c.copy(bed);
      // Large-scale value drift reads as worn, sun-bleached ground.
      const j = 1 + (rng() - 0.5) * 0.07 + 0.06 * noise(cx * 0.02 + 7, cz * 0.02 + 5, 2);
      [a, b, d].forEach((p, k) => {
        pos.set([p.x, p.y, p.z], t * 9 + k * 3);
        uv.set([p.x / GROUND_TILE_METRES, -p.z / GROUND_TILE_METRES], t * 6 + k * 2);
        cols.set([c.r * j, c.g * j, c.b * j], t * 9 + k * 3);
      });
      t++;
    };
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        tri(i, j, i, j + 1, i + 1, j + 1);
        tri(i, j, i + 1, j + 1, i + 1, j);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const kind = urban && GROUND_KIND[setting] ? "paving" : GROUND_KIND[setting];
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
      metalness: 0,
      map: kind ? groundTexture(kind, seed) : null,
    });
    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    group.add(terrain);
    disposables.push(geo, mat);
  }

  // ---------------------------------------------------------- street / path
  // A waterway corridor is the channel itself; its quays are built below.
  const path = C && C.paved !== false && !WW ? PATH[setting] : undefined;
  if (C && path) {
    const half = C.halfWidth * path.share;
    const z0 = C.cz + C.front,
      z1 = C.cz - C.back - 30;
    const step = 1.5,
      across = 6;
    const rows = Math.ceil((z0 - z1) / step);
    const verts: number[] = [],
      uvs: number[] = [];
    const edge = (z: number, side: number) =>
      path.share < 1 ? half * (1 + 0.22 * noise(z * 0.21 + side * 13, side * 5.3, 2)) : half;
    const at = (k: number, r: number): [number, number, number] => {
      const z = z0 - r * step;
      const u = k / across;
      const x = C.cx + lerp(-edge(z, -1), edge(z, 1), u);
      return [x, heightAt(x, z) + 0.025, z];
    };
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < across; k++) {
        const p00 = at(k, r),
          p10 = at(k + 1, r),
          p01 = at(k, r + 1),
          p11 = at(k + 1, r + 1);
        if ([p00, p10, p01, p11].some((p) => isWater(p[0], p[2]))) continue;
        for (const p of [p00, p10, p11, p00, p11, p01]) {
          verts.push(...p);
          uvs.push(p[0] / 3, -p[2] / 3);
        }
      }
    if (verts.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({
        color: spec.weather === "snow" ? mix(path.color, "#e6ecf2", 0.5) : path.color,
        map: groundTexture(path.kind, seed + 3),
        roughness: 0.95,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      group.add(mesh);
      disposables.push(g, m);
    }
    if (path.share >= 1) {
      // Kerbs: two long stone strips at the street edges.
      const len = z0 - z1;
      const kg = new THREE.BoxGeometry(0.32, 0.18, len);
      const km = new THREE.MeshStandardMaterial({ color: "#b3ab9e", roughness: 0.9, flatShading: true });
      for (const side of [-1, 1]) {
        const x = C.cx + side * (half + 0.16);
        const k = new THREE.Mesh(kg, km);
        k.position.set(x, heightAt(x, C.cz) + 0.07, (z0 + z1) / 2);
        k.receiveShadow = true;
        k.castShadow = true;
        group.add(k);
      }
      disposables.push(kg, km);
    }
  }

  // ---------------------------------------------------------- water
  let waterUpdate: ((t: number) => void) | null = null;
  if (hasWater) {
    const wgeo = new THREE.PlaneGeometry(600, 600, 56, 56).toNonIndexed();
    wgeo.rotateX(-Math.PI / 2);
    wgeo.translate(F.x, 0, F.z);
    const wpos = wgeo.getAttribute("position") as THREE.BufferAttribute;
    const base = (wpos.array as Float32Array).slice();
    const wmat = new THREE.MeshStandardMaterial({
      // Town rivers and canals carry silt; open water keeps the sky colour.
      color: WW && urban ? mix(L.water, "#56665c", 0.38) : L.water,
      flatShading: true,
      roughness: 0.28,
      metalness: 0.15,
      transparent: true,
      opacity: 0.9,
    });
    const water = new THREE.Mesh(wgeo, wmat);
    water.receiveShadow = true;
    group.add(water);
    disposables.push(wgeo, wmat);
    waterUpdate = (t) => {
      const a = wpos.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        const x = base[i],
          z = base[i + 2];
        a[i + 1] =
          0.16 * Math.sin(x * 0.23 + t * 1.3) +
          0.11 * Math.cos(z * 0.31 + t * 0.95) +
          0.05 * Math.sin((x + z) * 0.6 + t * 2.1);
      }
      wpos.needsUpdate = true;
      wgeo.computeVertexNormals();
    };
  }

  // ---------------------------------------------------------- built banks
  // Embanked channels get stone river walls with coping, a paved quay and
  // bollards along the edge. One mesh (or instanced set) per element.
  if (WW && WW.banks === "embankment") {
    const z0 = F.z + 260,
      z1 = F.z - 320;
    const top = bankTop;
    const wallVerts: number[] = [],
      wallUv: number[] = [];
    const quayVerts: number[] = [],
      quayUv: number[] = [];
    for (const side of [-1, 1]) {
      const x = WW.cx + side * WW.halfWidth;
      const xq = x + side * WW.quay;
      for (let z = z0; z > z1; z -= 8) {
        const za = z,
          zb = Math.max(z1, z - 8);
        // Vertical wall face toward the water.
        const w = [
          [x, -2.6, za],
          [x, top, za],
          [x, top, zb],
          [x, -2.6, zb],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          wallVerts.push(...w[k]);
          wallUv.push(-w[k][2] / 2.4, w[k][1] / 2.4);
        }
        // Quay paving from the wall back to the frontage.
        const q = [
          [x, top + 0.02, za],
          [xq, top + 0.02, za],
          [xq, top + 0.02, zb],
          [x, top + 0.02, zb],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) {
          quayVerts.push(...q[k]);
          quayUv.push(q[k][0] / 3, -q[k][2] / 3);
        }
      }
    }
    const strip = (verts: number[], uvs: number[], color: string, kind: GroundKind, offset: boolean) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({
        color,
        map: groundTexture(kind, seed + 5),
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide,
        ...(offset ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } : {}),
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      group.add(mesh);
      disposables.push(g, m);
    };
    strip(wallVerts, wallUv, "#8e8578", "paving", false);
    strip(quayVerts, quayUv, "#a29a8d", "cobble", true);
    // Coping stones along the wall heads.
    const len = z0 - z1;
    const cg = new THREE.BoxGeometry(0.55, 0.22, len);
    const cm = new THREE.MeshStandardMaterial({ color: "#b8b0a2", roughness: 0.9, flatShading: true });
    for (const side of [-1, 1]) {
      const coping = new THREE.Mesh(cg, cm);
      coping.position.set(WW.cx + side * (WW.halfWidth + 0.27), top + 0.11, (z0 + z1) / 2);
      coping.castShadow = coping.receiveShadow = true;
      group.add(coping);
    }
    disposables.push(cg, cm);
    // Iron bollards on the quay edge.
    const spacing = 9;
    const n = Math.floor(len / spacing) * 2;
    const bg = new THREE.CylinderGeometry(0.15, 0.2, 0.75, 7).translate(0, 0.375, 0);
    const bm = new THREE.MeshStandardMaterial({ color: "#3b3a37", roughness: 0.5, metalness: 0.4, flatShading: true });
    const bollards = new THREE.InstancedMesh(bg, bm, n);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (const side of [-1, 1])
      for (let z = z0 - spacing / 2; z > z1 && k < n; z -= spacing)
        bollards.setMatrixAt(k++, m4.makeTranslation(WW.cx + side * (WW.halfWidth + 0.9), top + 0.02, z));
    bollards.count = k;
    bollards.instanceMatrix.needsUpdate = true;
    bollards.computeBoundingSphere();
    bollards.castShadow = true;
    group.add(bollards);
    disposables.push(bg, bm, bollards);
  }

  // ---------------------------------------------------------- sun direction
  // Side light by day for long shadows across the street; low back light at
  // dawn and dusk so the sun and its glow sit in the frame.
  const elev = THREE.MathUtils.degToRad(L.elev);
  const side = rng() < 0.5 ? -1 : 1;
  const az =
    spec.timeOfDay === "dawn" || spec.timeOfDay === "dusk"
      ? side * range(rng, 118, 148)
      : spec.timeOfDay === "night"
        ? side * range(rng, 40, 120)
        : side * range(rng, 52, 78);
  const azim = THREE.MathUtils.degToRad(az);
  const sunDir = new THREE.Vector3(
    Math.sin(azim) * Math.cos(elev),
    Math.sin(elev),
    Math.cos(azim) * Math.cos(elev),
  ).normalize();

  // ---------------------------------------------------------- sky
  const skyGeo = new THREE.SphereGeometry(460, 36, 20);
  const sp = skyGeo.getAttribute("position") as THREE.BufferAttribute;
  const skyCols = new Float32Array(sp.count * 3);
  const top = new THREE.Color(L.top),
    hor = new THREE.Color(L.horizon),
    below = new THREE.Color(L.horizon).multiplyScalar(0.7),
    glowCol = new THREE.Color(L.sun);
  const dir = new THREE.Vector3();
  const clearSky = spec.weather !== "storm" && spec.weather !== "fog" && !space;
  for (let i = 0; i < sp.count; i++) {
    dir.set(sp.getX(i), sp.getY(i), sp.getZ(i)).divideScalar(460);
    const y = dir.y;
    const col = y >= 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(below, Math.min(1, -y * 3));
    if (clearSky && !night) {
      const g = Math.max(0, dir.dot(sunDir));
      col.lerp(glowCol, Math.pow(g, 6) * (L.elev < 15 ? 0.6 : 0.3));
    }
    skyCols.set([col.r, col.g, col.b], i * 3);
  }
  skyGeo.setAttribute("color", new THREE.BufferAttribute(skyCols, 3));
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.set(F.x, 0, F.z);
  sky.renderOrder = -1;
  group.add(sky);
  disposables.push(skyGeo, skyMat);

  // ---------------------------------------------------------- ridges
  // Distant silhouettes with baked aerial perspective (fog-free) so the
  // horizon reads as a place rather than a flat line.
  const ridgeK = RIDGE[setting] ?? 0;
  if (ridgeK > 0 && L.haze < 0.02) {
    const base = new THREE.Color(mix(GROUND[setting][1], "#3c4552", 0.35));
    for (let k = 0; k < 2; k++) {
      const radius = 340 + k * 70;
      const haze = Math.max(1 - Math.exp(-Math.pow(L.haze * radius * 0.55, 2)), k ? 0.62 : 0.45);
      const col = base.clone().lerp(hor, Math.min(0.92, haze));
      const segs = 120;
      const verts: number[] = [];
      const peakAt = (s: number) => {
        const ang = (s / segs) * Math.PI * 2;
        const v = noise(Math.cos(ang) * 3 + k * 17, Math.sin(ang) * 3, 3);
        return (k ? 46 : 26) * ridgeK * (0.35 + 0.65 * Math.abs(v)) + (k ? 8 : 2);
      };
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2,
          a1 = ((s + 1) / segs) * Math.PI * 2;
        const x0 = F.x + Math.cos(a0) * radius,
          z0 = F.z + Math.sin(a0) * radius;
        const x1 = F.x + Math.cos(a1) * radius,
          z1 = F.z + Math.sin(a1) * radius;
        const h0 = peakAt(s),
          h1 = peakAt(s + 1);
        verts.push(x0, -20, z0, x1, -20, z1, x1, h1, z1, x0, -20, z0, x1, h1, z1, x0, h0, z0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      const m = new THREE.MeshBasicMaterial({ color: col, fog: false, side: THREE.DoubleSide });
      group.add(new THREE.Mesh(g, m));
      disposables.push(g, m);
    }
  }

  // ---------------------------------------------------------- lights
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -45;
  sc.right = 45;
  sc.top = 45;
  sc.bottom = -45;
  sc.near = 1;
  sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiI);
  group.add(hemi);
  group.add(new THREE.AmbientLight("#ffffff", night ? 0.1 : 0.14));

  // Sun / moon disc and halo.
  const sunVisible = L.elev > 2 && spec.weather !== "storm" && spec.weather !== "fog";
  const discMat = new THREE.MeshBasicMaterial({ color: night ? "#e8ecff" : L.sun, fog: false, toneMapped: false });
  const discGeo = new THREE.IcosahedronGeometry(night ? 10 : 15, 1);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.set(F.x, 0, F.z).addScaledVector(sunDir, 400);
  if (sunVisible) group.add(disc);
  disposables.push(discMat, discGeo);
  const glow = glowTexture();
  if (sunVisible && glow) {
    const gm = new THREE.SpriteMaterial({
      map: glow,
      color: night ? "#9fb0e0" : L.sun,
      transparent: true,
      opacity: night ? 0.35 : L.elev < 15 ? 0.85 : 0.55,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const halo = new THREE.Sprite(gm);
    halo.scale.setScalar(night ? 90 : 190);
    halo.position.copy(disc.position);
    halo.renderOrder = -1;
    group.add(halo);
    disposables.push(gm);
  }

  // Stars.
  if (night || space) {
    const n = 500;
    const sgeo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * Math.PI * 2,
        v = Math.acos(range(rng, space ? -1 : 0.05, 1));
      arr.set([F.x + Math.sin(v) * Math.cos(u) * 440, Math.cos(v) * 440, F.z + Math.sin(v) * Math.sin(u) * 440], i * 3);
    }
    sgeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const smat = new THREE.PointsMaterial({ color: "#ffffff", size: 1.8, sizeAttenuation: false, fog: false });
    group.add(new THREE.Points(sgeo, smat));
    disposables.push(sgeo, smat);
  }

  // Earth in the sky (lunar) or below (orbit).
  if (space) {
    const earth = buildGlobe(setting === "orbit" ? 70 : 22, setting === "orbit" ? 18 : 10, seed);
    if (setting === "orbit") {
      earth.group.position.set(F.x, -82, F.z - 30);
      earth.group.rotation.set(0.4, 1.2, 0);
    } else {
      earth.group.position.set(F.x - 90, 120, F.z - 320);
    }
    group.add(earth.group);
    disposables.push(earth);
  }

  // Clouds.
  const cloudCount = space
    ? 0
    : ({ clear: 14, cloudy: 30, rain: 34, storm: 36, fog: 6, dust: 8, smoke: 14, snow: 28 } as Record<Weather, number>)[
        spec.weather
      ];
  const cloudMat = new THREE.MeshStandardMaterial({
    color: spec.weather === "storm" || spec.weather === "rain" ? "#8a9099" : night ? "#5a6480" : "#ffffff",
    flatShading: true,
    roughness: 1,
    transparent: true,
    opacity: 0.95,
    // Clouds are sky, not scenery: distance haze would erase the band.
    fog: spec.weather === "fog",
  });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  disposables.push(cloudMat, cloudGeo);
  // A distant band all around the place, so no camera ends up beneath one.
  const clouds: { g: THREE.Group; a0: number; r: number; w: number }[] = [];
  for (let i = 0; i < cloudCount; i++) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 4);
    const size = range(rng, 7, 16);
    for (let k = 0; k < puffs; k++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      const s = size * range(rng, 0.6, 1.1);
      m.scale.set(s * 1.4, s * 0.62, s);
      m.position.set(
        (k - (puffs - 1) / 2) * size * 1.25 + range(rng, -2, 2),
        range(rng, -1, 2) * size * 0.25,
        range(rng, -1, 1) * size * 0.4,
      );
      g.add(m);
    }
    const a0 = rng() * Math.PI * 2,
      r = range(rng, 150, 380);
    g.position.set(F.x + Math.cos(a0) * r, range(rng, 45, 115) + r * 0.08, F.z + Math.sin(a0) * r);
    g.lookAt(F.x, g.position.y, F.z);
    group.add(g);
    clouds.push({ g, a0, r, w: range(rng, 0.6, 1.6) / r });
  }

  // ---------------------------------------------------------- weather
  let weatherUpdate: ((t: number) => void) | null = null;
  if (o.interior) {
    // Weather stays outside; the open side and sky still show it.
  } else if (spec.weather === "rain" || spec.weather === "storm") {
    const n = 1400;
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 6);
    const seeds = Array.from({ length: n }, () => [F.x + range(rng, -45, 45), F.z + range(rng, -45, 30), rng()]);
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const m = new THREE.LineBasicMaterial({ color: "#b8cde6", transparent: true, opacity: 0.55 });
    const lines = new THREE.LineSegments(g, m);
    lines.frustumCulled = false;
    group.add(lines);
    disposables.push(g, m);
    weatherUpdate = (t) => {
      for (let i = 0; i < n; i++) {
        const [x, z, ph] = seeds[i];
        const y = 32 - ((((t * 24 + ph * 32) % 32) + 32) % 32);
        arr.set([x, y, z, x + 0.18, y + 1.1, z], i * 6);
      }
      g.getAttribute("position").needsUpdate = true;
    };
  } else if (spec.weather === "snow" || spec.weather === "dust") {
    const n = spec.weather === "snow" ? 1000 : 600;
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    const seeds = Array.from({ length: n }, () => [range(rng, -45, 45), F.z + range(rng, -45, 30), rng()]);
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({
      color: spec.weather === "snow" ? "#ffffff" : "#d8b47e",
      size: spec.weather === "snow" ? 0.28 : 0.2,
      transparent: true,
      opacity: 0.9,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    group.add(pts);
    disposables.push(g, m);
    weatherUpdate = (t) => {
      for (let i = 0; i < n; i++) {
        const [x, z, ph] = seeds[i];
        if (spec.weather === "snow") {
          const y = 26 - ((((t * 1.9 + ph * 26) % 26) + 26) % 26);
          arr.set([F.x + x + Math.sin(t * 0.8 + ph * 9) * 0.8, y, z + Math.cos(t * 0.6 + ph * 7) * 0.5], i * 3);
        } else {
          const xx = ((((x + t * 6 + 45) % 90) + 90) % 90) - 45;
          arr.set([F.x + xx, 0.5 + ph * 8 + Math.sin(t + ph * 6) * 0.4, z], i * 3);
        }
      }
      g.getAttribute("position").needsUpdate = true;
    };
  }
  if (!o.interior && (spec.weather === "smoke" || setting === "battlefield")) {
    for (let i = 0; i < 4; i++) {
      const a = range(rng, -2.6, -0.5);
      const r = range(rng, 26, 42);
      const fx = makeSmoke(rng, {
        size: range(rng, 2.2, 3.4),
        rise: range(rng, 18, 28),
        color: "#6f6862",
        count: 10,
        life: 7,
      });
      const x = F.x + Math.cos(a) * r,
        z = F.z + Math.sin(a) * r;
      fx.object.position.set(x, heightAt(x, z), z);
      group.add(fx.object);
      effects.push(fx);
    }
  }

  const strikes = spec.weather === "storm" ? Array.from({ length: 6 }, () => rng() * 12) : [];
  const flash = (t: number) => {
    for (const s of strikes) {
      const d = (t % 12) - s;
      if (d >= 0 && d < 0.35) return d < 0.08 ? 1 : d > 0.16 && d < 0.22 ? 0.7 : 0.15;
    }
    return 0;
  };

  const fog = space ? null : new THREE.FogExp2(L.horizon, L.haze);

  return {
    group,
    fog,
    background: new THREE.Color(L.horizon),
    sun,
    hemi,
    sunDir,
    night,
    hasWater,
    heightAt,
    isWater,
    flash,
    update(t) {
      waterUpdate?.(t);
      weatherUpdate?.(t);
      for (const c of clouds) {
        const a = c.a0 + t * c.w;
        c.g.position.x = F.x + Math.cos(a) * c.r;
        c.g.position.z = F.z + Math.sin(a) * c.r;
      }
      const st = { time: t, progress: 0, moving: false, night, phase: 0 };
      for (const fx of effects) fx.update(st);
      const f = flash(t);
      hemi.intensity = L.hemiI + f * 2.5;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      effects.forEach((e) => e.dispose());
    },
  };
}
