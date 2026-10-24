import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type V3 = [number, number, number];
export type Rng = () => number;

/** mulberry32 — tiny, fast, deterministic. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();
export const pickOne = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** 2D value noise (deterministic, seedable) for terrain. */
export function makeNoise2(seed: number) {
  const perm = new Uint8Array(512);
  const rng = makeRng(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h: number) => (h / 255) * 2 - 1;
  const n = (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const a = grad(perm[(perm[xi & 255] + yi) & 511]);
    const b = grad(perm[(perm[(xi + 1) & 255] + yi) & 511]);
    const c = grad(perm[(perm[xi & 255] + yi + 1) & 511]);
    const d = grad(perm[(perm[(xi + 1) & 255] + yi + 1) & 511]);
    const u = smooth(xf),
      v = smooth(yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  return (x: number, y: number, octaves = 3) => {
    let amp = 1,
      freq = 1,
      sum = 0,
      norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += n(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

// ---------------------------------------------------------------- materials
export interface Materials {
  solid: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  dispose(): void;
}

export function makeMaterials(): Materials {
  const solid = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.88,
    metalness: 0.02,
  });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return {
    solid,
    glow,
    dispose() {
      solid.dispose();
      glow.dispose();
    },
  };
}

// ---------------------------------------------------------------- builder
export interface PartOpts {
  p?: V3;
  r?: V3;
  s?: V3 | number;
  glow?: boolean;
  jitter?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Composes primitive parts into a single flat-shaded, vertex-coloured
 * geometry (plus an optional unlit "glow" geometry). One draw call per model.
 */
export class Builder {
  solid: THREE.BufferGeometry[] = [];
  glow: THREE.BufferGeometry[] = [];
  constructor(
    private rng: Rng = Math.random,
    private defaultJitter = 0.06,
  ) {}

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const pos = src.getAttribute("position") as THREE.BufferAttribute;
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", pos.clone());
    const s = o.s ?? 1;
    _m.compose(
      _v.set(...(o.p ?? [0, 0, 0])),
      _q.setFromEuler(_e.set(...(o.r ?? [0, 0, 0]))),
      typeof s === "number" ? _s.set(s, s, s) : _s.set(...s),
    );
    out.applyMatrix4(_m);
    _c.set(color);
    const jitter = o.jitter ?? (o.glow ? 0 : this.defaultJitter);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 3) {
      const j = 1 + (this.rng() - 0.5) * jitter * 2;
      for (let k = 0; k < 3 && i + k < pos.count; k++) {
        colors[(i + k) * 3] = Math.min(1, _c.r * j);
        colors[(i + k) * 3 + 1] = Math.min(1, _c.g * j);
        colors[(i + k) * 3 + 2] = Math.min(1, _c.b * j);
      }
    }
    out.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    (o.glow ? this.glow : this.solid).push(out);
    if (src !== geo) src.dispose();
    geo.dispose();
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, o);
  }
  cyl(rt: number, rb: number, h: number, seg: number, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1), color, o);
  }
  cone(r: number, h: number, seg: number, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    return this.add(new THREE.ConeGeometry(r, h, seg, 1), color, o);
  }
  ico(r: number, detail: number, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, o);
  }
  dodeca(r: number, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    return this.add(new THREE.DodecahedronGeometry(r, 0), color, o);
  }
  sphere(r: number, ws: number, hs: number, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    return this.add(new THREE.SphereGeometry(r, ws, hs), color, o);
  }
  /** Horizontal triangular prism along x (gable roof). */
  prism(len: number, width: number, height: number, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2);
    g.rotateY(Math.PI / 2);
    return this.add(g, color, o);
  }
  /** Extrude an arbitrary 2D outline (x,y) by depth along z, centred. */
  extrude(points: [number, number][], depth: number, color: THREE.ColorRepresentation, o: PartOpts = {}) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return this.add(g, color, o);
  }
  /** Lofted boat hull: pointed bow at +x, flat-ish stern at -x, waterline at y=0. */
  hull(
    len: number,
    width: number,
    depth: number,
    color: THREE.ColorRepresentation,
    o: PartOpts & { deck?: number; sheer?: number } = {},
  ) {
    const deckY = o.deck ?? depth * 0.55;
    const sheer = o.sheer ?? 0.15;
    const outline = (scale: number, y: number, lift: number): THREE.Vector3[] => {
      const hl = (len / 2) * scale,
        hw = (width / 2) * scale;
      return [
        new THREE.Vector3(hl, y + lift, 0),
        new THREE.Vector3(hl * 0.55, y + lift * 0.35, hw * 0.92),
        new THREE.Vector3(0, y, hw),
        new THREE.Vector3(-hl * 0.7, y + lift * 0.4, hw * 0.92),
        new THREE.Vector3(-hl, y + lift * 0.8, hw * 0.7),
        new THREE.Vector3(-hl, y + lift * 0.8, -hw * 0.7),
        new THREE.Vector3(-hl * 0.7, y + lift * 0.4, -hw * 0.92),
        new THREE.Vector3(0, y, -hw),
        new THREE.Vector3(hl * 0.55, y + lift * 0.35, -hw * 0.92),
      ];
    };
    const top = outline(1, deckY, sheer * len * 0.25);
    const bot = outline(0.82, deckY - depth, 0);
    bot.forEach((v) => (v.z *= 0.45));
    const verts: number[] = [];
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
      verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const n = top.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(top[i], bot[i], top[j]);
      tri(top[j], bot[i], bot[j]);
    }
    const ct = new THREE.Vector3(0, deckY + 0.01, 0);
    const cb = new THREE.Vector3(0, deckY - depth, 0);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(ct, top[i], top[j]);
      tri(cb, bot[j], bot[i]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    return this.add(g, color, o);
  }

  geometries() {
    const solid = this.solid.length ? mergeGeometries(this.solid, false) : null;
    const glow = this.glow.length ? mergeGeometries(this.glow, false) : null;
    solid?.computeVertexNormals();
    this.solid.forEach((g) => g.dispose());
    this.glow.forEach((g) => g.dispose());
    this.solid = [];
    this.glow = [];
    return { solid, glow };
  }

  /** Builds a Group with up to two meshes using the shared materials. */
  build(mats: Materials, shadows = true): THREE.Group {
    const { solid, glow } = this.geometries();
    const g = new THREE.Group();
    if (solid) {
      const m = new THREE.Mesh(solid, mats.solid);
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      g.add(m);
    }
    if (glow) g.add(new THREE.Mesh(glow, mats.glow));
    return g;
  }
}

export function disposeObject(obj: THREE.Object3D, keep: Set<THREE.Material> = new Set()) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => !keep.has(m) && m.dispose());
    else if (mat && !keep.has(mat)) mat.dispose();
  });
}

export function shade(hex: THREE.ColorRepresentation, k: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, clamp(hsl.l * k, 0, 1));
  return "#" + c.getHexString();
}
