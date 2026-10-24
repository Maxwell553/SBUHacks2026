/**
 * The one procedural compiler: ModelDefinition JSON -> Three.js objects.
 *
 * - Expands mirror / repeat copies through the parent-child rig
 *   (mirrored subtrees are conjugated by the reflection so they stay proper).
 * - Bakes every static subtree into one vertex-coloured, flat-shaded mesh per
 *   surface finish ("frame"); only animated nodes become separate pivots.
 * - Compiled templates are cached per (model, tint, variant, night) and
 *   shared by every instance; instances only allocate pivots + effects.
 * - Animation channels are pure functions of time (deterministic renders).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  MODEL_LIMITS,
  type Finish,
  type ModelChannel,
  type ModelDefinition,
  type ModelMaterial,
  type ModelPart,
} from "@/lib/schema/model";
import { makeRng, type Rng } from "@/lib/lowpoly/core";
import { type AnimState, type Effect, makeExplosion, makeFire, makeFlag, makeSmoke } from "@/lib/lowpoly/effects";

const DEG = Math.PI / 180;
const EFFECT_SHAPES = new Set(["flag", "fire", "smoke", "explosion"]);

// ---------------------------------------------------------------- materials
export interface FinishMaterials {
  get(finish: Finish): THREE.Material;
  dispose(): void;
}

export function makeFinishMaterials(): FinishMaterials {
  const std = (o: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, ...o });
  const table: Record<Finish, THREE.Material> = {
    matte: std({ roughness: 0.9, metalness: 0 }),
    satin: std({ roughness: 0.55, metalness: 0.05 }),
    metal: std({ roughness: 0.38, metalness: 0.45 }),
    cloth: std({ roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    glass: std({ roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.6, depthWrite: false }),
    emissive: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return {
    get: (f) => table[f] ?? table.matte,
    dispose: () => Object.values(table).forEach((m) => m.dispose()),
  };
}

// ---------------------------------------------------------------- primitives
const _box = new THREE.Box3();

function orientedTriangles(verts: THREE.Vector3[], tris: [number, number, number][]): THREE.BufferGeometry {
  const c = verts.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / verts.length);
  const out: number[] = [];
  const ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    nrm = new THREE.Vector3(),
    mid = new THREE.Vector3();
  for (const [a, b, cc] of tris) {
    const A = verts[a],
      B = verts[b],
      C = verts[cc];
    ab.subVectors(B, A);
    ac.subVectors(C, A);
    nrm.crossVectors(ab, ac);
    mid
      .copy(A)
      .add(B)
      .add(C)
      .multiplyScalar(1 / 3)
      .sub(c);
    const [p, q, r] = nrm.dot(mid) < 0 ? [A, C, B] : [A, B, C];
    out.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return g;
}

function wedgeGeometry(sx: number, sy: number, sz: number) {
  const hx = sx / 2,
    hy = sy / 2,
    hz = sz / 2;
  const v = [
    new THREE.Vector3(hx, -hy, -hz),
    new THREE.Vector3(hx, -hy, hz),
    new THREE.Vector3(hx, hy, 0),
    new THREE.Vector3(-hx, -hy, -hz),
    new THREE.Vector3(-hx, -hy, hz),
    new THREE.Vector3(-hx, hy, 0),
  ];
  return orientedTriangles(v, [
    [0, 1, 2],
    [3, 5, 4],
    [0, 3, 4],
    [0, 4, 1],
    [1, 4, 5],
    [1, 5, 2],
    [0, 2, 5],
    [0, 5, 3],
  ]);
}

function hullGeometry(len: number, depth: number, beam: number) {
  const ring = (scale: number, y: number, lift: number, narrow: number) => {
    const hl = (len / 2) * scale,
      hw = (beam / 2) * scale * narrow;
    return [
      [hl, y + lift, 0],
      [hl * 0.55, y + lift * 0.35, hw * 0.92],
      [0, y, hw],
      [-hl * 0.7, y + lift * 0.4, hw * 0.92],
      [-hl, y + lift * 0.8, hw * 0.7],
      [-hl, y + lift * 0.8, -hw * 0.7],
      [-hl * 0.7, y + lift * 0.4, -hw * 0.92],
      [0, y, -hw],
      [hl * 0.55, y + lift * 0.35, -hw * 0.92],
    ].map(([x, yy, z]) => new THREE.Vector3(x, yy, z));
  };
  const top = ring(1, depth / 2, len * 0.04, 1);
  const bot = ring(0.82, -depth / 2, 0, 0.45);
  const verts = [...top, ...bot, new THREE.Vector3(0, depth / 2, 0), new THREE.Vector3(0, -depth / 2, 0)];
  const n = top.length,
    ct = 2 * n,
    cb = 2 * n + 1;
  const tris: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.push([i, n + i, j], [j, n + i, n + j], [ct, i, j], [cb, n + j, n + i]);
  }
  return orientedTriangles(verts, tris);
}

function primitiveGeometry(p: ModelPart): THREE.BufferGeometry | null {
  const min = MODEL_LIMITS.minDimension;
  const [sx, sy, sz] = p.size.map((v) => Math.max(min, v)) as [number, number, number];
  const seg = p.segments;
  let g: THREE.BufferGeometry;
  switch (p.shape) {
    case "box":
      g = new THREE.BoxGeometry(sx, sy, sz);
      break;
    case "wedge":
      g = wedgeGeometry(sx, sy, sz);
      break;
    case "cylinder": {
      const s = seg ?? 8;
      g = new THREE.CylinderGeometry(0.5 * (p.taper ?? 1), 0.5, 1, s, 1);
      if (s === 4) g.rotateY(Math.PI / 4);
      g.scale(sx, sy, sz);
      break;
    }
    case "cone": {
      const s = seg ?? 8;
      g = new THREE.ConeGeometry(0.5, 1, s, 1);
      if (s === 4) g.rotateY(Math.PI / 4);
      g.scale(sx, sy, sz);
      break;
    }
    case "sphere": {
      const s = Math.max(4, seg ?? 8);
      g = new THREE.SphereGeometry(0.5, s, Math.max(3, Math.round(s / 2)));
      g.scale(sx, sy, sz);
      break;
    }
    case "dome": {
      const s = Math.max(4, seg ?? 8);
      g = new THREE.SphereGeometry(0.5, s, Math.max(2, Math.round(s / 4)), 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(sx, sy * 2, sz);
      break;
    }
    case "ico":
      g = new THREE.IcosahedronGeometry(0.5, p.detail ?? 0);
      g.scale(sx, sy, sz);
      break;
    case "capsule": {
      const r = Math.min(sx, sz) / 2;
      g = new THREE.CapsuleGeometry(r, Math.max(0.001, sy - 2 * r), 2, seg ?? 6);
      g.scale(sx / (2 * r), 1, sz / (2 * r));
      break;
    }
    case "torus": {
      const tube = Math.min(sy, sx * 0.45) / 2;
      const R = Math.max(tube * 1.05, sx / 2 - tube);
      g = new THREE.TorusGeometry(R, tube, 5, seg ?? 12);
      g.rotateX(Math.PI / 2);
      g.scale(1, 1, sz / sx);
      break;
    }
    case "hull":
      g = hullGeometry(sx, sy, sz);
      break;
    case "extrusion": {
      const pts = (p.profile ?? []).map(([x, y]) => new THREE.Vector2((x * sx) / 2, (y * sy) / 2));
      const clean = pts.filter((v, i) => i === 0 || v.distanceToSquared(pts[i - 1]) > 1e-8);
      if (clean.length < 3) return null;
      g = new THREE.ExtrudeGeometry(new THREE.Shape(clean), { depth: sz, bevelEnabled: false });
      g.translate(0, 0, -sz / 2);
      break;
    }
    case "lathe": {
      const pts = (p.profile ?? []).map(([r, y]) => new THREE.Vector2((Math.max(0, r) * sx) / 2, Math.max(0, y) * sy));
      if (pts.length < 2) return null;
      g = new THREE.LatheGeometry(pts, seg ?? 10);
      g.scale(1, 1, sz / sx);
      break;
    }
    default:
      return null;
  }
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  for (const name of Object.keys(flat.attributes)) if (name !== "position") flat.deleteAttribute(name);
  flat.computeBoundingBox();
  const bb = flat.boundingBox!;
  const center = bb.getCenter(new THREE.Vector3());
  const ext = bb.getSize(new THREE.Vector3());
  flat.translate(-center.x, -center.y, -center.z);
  switch (p.anchor) {
    case "bottom":
      flat.translate(0, ext.y / 2, 0);
      break;
    case "top":
      flat.translate(0, -ext.y / 2, 0);
      break;
    case "front":
      flat.translate(-ext.x / 2, 0, 0);
      break;
    case "back":
      flat.translate(ext.x / 2, 0, 0);
      break;
    case "left":
      flat.translate(0, 0, ext.z / 2);
      break;
    case "right":
      flat.translate(0, 0, -ext.z / 2);
      break;
    default:
      break;
  }
  flat.computeBoundingBox();
  return flat;
}

// ---------------------------------------------------------------- rig expansion
interface Node {
  part: ModelPart;
  local: THREE.Matrix4;
  parent: Node | null;
  children: Node[];
  flip: boolean;
  dynamic: boolean;
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

function reflection(mask: [boolean, boolean, boolean]) {
  return new THREE.Matrix4().makeScale(mask[0] ? -1 : 1, mask[1] ? -1 : 1, mask[2] ? -1 : 1);
}

function eulerMatrix(r?: [number, number, number]) {
  return new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler((r?.[0] ?? 0) * DEG, (r?.[1] ?? 0) * DEG, (r?.[2] ?? 0) * DEG),
  );
}

function expand(def: ModelDefinition): Node[] {
  const kids = new Map<string | undefined, ModelPart[]>();
  for (const p of def.parts) {
    const key = p.parent;
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key)!.push(p);
  }
  let budget = MODEL_LIMITS.maxExpandedNodes;
  const all: Node[] = [];

  const visit = (part: ModelPart, parent: Node | null, mirrorMask: [boolean, boolean, boolean], depth: number) => {
    if (depth > MODEL_LIMITS.maxDepth) return;
    const mirrors: ([boolean, boolean, boolean] | null)[] = [null];
    if (part.mirror) {
      const m: [boolean, boolean, boolean] = [false, false, false];
      m[AXIS_INDEX[part.mirror]] = true;
      mirrors.push(m);
    }
    const rep = part.repeat;
    const count = rep ? rep.count : 1;
    let copyIndex = 0;
    for (const extraMirror of mirrors) {
      const mask: [boolean, boolean, boolean] = extraMirror
        ? [mirrorMask[0] !== extraMirror[0], mirrorMask[1] !== extraMirror[1], mirrorMask[2] !== extraMirror[2]]
        : mirrorMask;
      for (let i = 0; i < count; i++) {
        if (budget-- <= 0) return;
        const pos = new THREE.Vector3(...(part.position ?? [0, 0, 0]));
        const rot: [number, number, number] = [...(part.rotation ?? [0, 0, 0])] as [number, number, number];
        let pre = new THREE.Matrix4();
        if (rep?.mode === "linear") {
          const st = rep.step ?? [0, 0, 0];
          pos.add(new THREE.Vector3(st[0] * i, st[1] * i, st[2] * i));
          const rs = rep.rotateStep ?? [0, 0, 0];
          rot[0] += rs[0] * i;
          rot[1] += rs[1] * i;
          rot[2] += rs[2] * i;
        } else if (rep?.mode === "radial") {
          const axis = rep.axis ?? "y";
          const a = ((rep.startAngle ?? 0) + (360 * i) / count) * DEG;
          const off =
            axis === "y" ? new THREE.Vector3(rep.radius ?? 1, 0, 0) : new THREE.Vector3(0, rep.radius ?? 1, 0);
          const R =
            axis === "x"
              ? new THREE.Matrix4().makeRotationX(a)
              : axis === "y"
                ? new THREE.Matrix4().makeRotationY(a)
                : new THREE.Matrix4().makeRotationZ(a);
          pre = R.multiply(new THREE.Matrix4().makeTranslation(off.x, off.y, off.z));
        }
        let local = pre.multiply(new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z)).multiply(eulerMatrix(rot));
        if (mask[0] || mask[1] || mask[2]) {
          const F = reflection(mask);
          local = F.clone().multiply(local).multiply(F);
        }
        const node: Node = {
          part,
          local,
          parent,
          children: [],
          flip: !!part.animation?.some((c) => c.alternate) && copyIndex % 2 === 1,
          dynamic: !!part.animation?.length || EFFECT_SHAPES.has(part.shape),
        };
        copyIndex++;
        parent?.children.push(node);
        all.push(node);
        for (const child of kids.get(part.id) ?? []) visit(child, node, mask, depth + 1);
      }
    }
  };
  for (const root of kids.get(undefined) ?? []) visit(root, null, [false, false, false], 1);
  return all;
}

// ---------------------------------------------------------------- templates
interface FrameTemplate {
  parent: number;
  base: THREE.Matrix4;
  channels: ModelChannel[];
  flip: boolean;
  meshes: { geometry: THREE.BufferGeometry; finish: Finish }[];
  effects: { part: ModelPart; matrix: THREE.Matrix4; color: string }[];
}

export interface CompiledTemplate {
  frames: FrameTemplate[];
  bounds: THREE.Box3;
  dispose(): void;
}

export interface ModelBounds {
  radius: number;
  height: number;
  minY: number;
  center: THREE.Vector3;
}

export interface ModelInstance {
  object: THREE.Group;
  update(s: AnimState): void;
  dispose(): void;
}

function resolveColor(mat: ModelMaterial, tint: string | undefined, variant: number) {
  if (mat.tint && tint) return tint;
  const palette = [mat.color, ...(mat.variants ?? [])];
  return palette[variant % palette.length];
}

function compileTemplate(
  def: ModelDefinition,
  tint: string | undefined,
  variant: number,
  night: boolean,
): CompiledTemplate {
  const nodes = expand(def);
  const mats = new Map(def.materials.map((m) => [m.id, m]));
  const geoCache = new Map<string, THREE.BufferGeometry | null>();
  const rng: Rng = makeRng(variant * 7919 + def.id.length * 131 + 17);

  const frameOf = new Map<Node, number>();
  const frames: FrameTemplate[] = [
    { parent: -1, base: new THREE.Matrix4(), channels: [], flip: false, meshes: [], effects: [] },
  ];
  const pieces = new Map<string, THREE.BufferGeometry[]>();
  const bounds = new THREE.Box3();
  const worldRest = new Map<Node, THREE.Matrix4>();

  const ownerFrame = (n: Node | null): number => {
    while (n) {
      if (frameOf.has(n)) return frameOf.get(n)!;
      n = n.parent;
    }
    return 0;
  };
  // Matrix of node relative to the frame that owns it (exclusive of frame pivot).
  const relativeTo = (n: Node, stopAt: Node | null): THREE.Matrix4 => {
    const chain: Node[] = [];
    let cur: Node | null = n;
    while (cur && cur !== stopAt) {
      chain.push(cur);
      cur = cur.parent;
    }
    const m = new THREE.Matrix4();
    for (let i = chain.length - 1; i >= 0; i--) m.multiply(chain[i].local);
    return m;
  };
  const frameNode: (Node | null)[] = [null];

  for (const n of nodes) {
    const world = n.parent ? worldRest.get(n.parent)!.clone().multiply(n.local) : n.local.clone();
    worldRest.set(n, world);
    let owner = ownerFrame(n.parent);
    if (n.dynamic) {
      const base = relativeTo(n, frameNode[owner]);
      frames.push({ parent: owner, base, channels: n.part.animation ?? [], flip: n.flip, meshes: [], effects: [] });
      frameNode.push(n);
      owner = frames.length - 1;
      frameOf.set(n, owner);
    }
    const rel = n.dynamic ? new THREE.Matrix4() : relativeTo(n, frameNode[owner]);
    const mat = n.part.material ? mats.get(n.part.material) : undefined;
    const color = mat ? resolveColor(mat, tint, variant) : "#9a958e";

    if (EFFECT_SHAPES.has(n.part.shape)) {
      frames[owner].effects.push({ part: n.part, matrix: rel, color });
      const s = n.part.size;
      const pt = new THREE.Vector3().setFromMatrixPosition(world);
      bounds
        .expandByPoint(pt)
        .expandByPoint(pt.clone().add(new THREE.Vector3(s[0], n.part.shape === "smoke" ? s[1] : s[1] || s[0], 0)));
      continue;
    }
    if (n.part.shape === "group" || !mat) continue;

    const key = JSON.stringify([
      n.part.shape,
      n.part.size,
      n.part.segments,
      n.part.taper,
      n.part.detail,
      n.part.profile,
      n.part.anchor,
    ]);
    if (!geoCache.has(key)) geoCache.set(key, primitiveGeometry(n.part));
    const proto = geoCache.get(key);
    if (!proto) continue;
    const g = proto.clone();
    g.applyMatrix4(rel);

    let finish: Finish = mat.finish;
    let c = new THREE.Color(color);
    if (mat.nightGlow) {
      if (night) finish = "emissive";
      else {
        finish = "satin";
        c = c.multiplyScalar(0.3);
      }
    }
    const count = g.getAttribute("position").count;
    const cols = new Float32Array(count * 3);
    const jitter = finish === "emissive" || finish === "glass" ? 0 : 0.07;
    for (let i = 0; i < count; i += 3) {
      const j = 1 + (rng() - 0.5) * jitter * 2;
      for (let k = 0; k < 3 && i + k < count; k++) {
        cols[(i + k) * 3] = Math.min(1, c.r * j);
        cols[(i + k) * 3 + 1] = Math.min(1, c.g * j);
        cols[(i + k) * 3 + 2] = Math.min(1, c.b * j);
      }
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const pkey = `${owner}|${finish}`;
    if (!pieces.has(pkey)) pieces.set(pkey, []);
    pieces.get(pkey)!.push(g);

    if (!proto.boundingBox) proto.computeBoundingBox();
    bounds.union(_box.copy(proto.boundingBox!).applyMatrix4(world));
  }

  for (const [key, list] of pieces) {
    const [owner, finish] = key.split("|");
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    frames[Number(owner)].meshes.push({ geometry: merged, finish: finish as Finish });
  }
  for (const g of geoCache.values()) g?.dispose();

  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  const scale = def.scale ?? 1;
  bounds.min.multiplyScalar(scale);
  bounds.max.multiplyScalar(scale);
  return {
    frames,
    bounds,
    dispose() {
      frames.forEach((f) => f.meshes.forEach((m) => m.geometry.dispose()));
    },
  };
}

function waveValue(c: ModelChannel, t: number, flip: boolean) {
  const ph = ((c.phase ?? 0) + (flip ? 180 : 0)) * DEG;
  const w = 2 * Math.PI * c.frequency;
  switch (c.wave) {
    case "spin":
      return c.property === "rotation" ? c.amplitude * t : c.amplitude * Math.sin(w * t + ph);
    case "pulse": {
      const s = 0.5 + 0.5 * Math.sin(w * t + ph);
      return c.amplitude * s * s;
    }
    case "bounce":
      return c.amplitude * Math.abs(Math.sin((w / 2) * t + ph));
    default:
      return c.amplitude * Math.sin(w * t + ph);
  }
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function instantiate(def: ModelDefinition, tpl: CompiledTemplate, fm: FinishMaterials, seed: number): ModelInstance {
  const rng = makeRng(seed);
  const root = new THREE.Group();
  const scale = def.scale ?? 1;
  root.scale.setScalar(scale);
  const objs: THREE.Object3D[] = [];
  const animated: {
    obj: THREE.Object3D;
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    scl: THREE.Vector3;
    f: FrameTemplate;
  }[] = [];
  const effects: Effect[] = [];

  tpl.frames.forEach((f, i) => {
    const obj = i === 0 ? new THREE.Group() : new THREE.Group();
    if (i > 0) {
      f.base.decompose(obj.position, obj.quaternion, obj.scale);
      if (f.channels.length)
        animated.push({ obj, pos: obj.position.clone(), quat: obj.quaternion.clone(), scl: obj.scale.clone(), f });
    }
    for (const m of f.meshes) {
      const mesh = new THREE.Mesh(m.geometry, fm.get(m.finish));
      mesh.castShadow = m.finish !== "glass" && m.finish !== "emissive";
      mesh.receiveShadow = m.finish !== "emissive";
      obj.add(mesh);
    }
    for (const e of f.effects) {
      const [w, h] = e.part.size;
      let fx: Effect;
      switch (e.part.shape) {
        case "flag":
          fx = makeFlag(e.color, Math.max(0.1, w), Math.max(0.1, h));
          break;
        case "fire":
          fx = makeFire(Math.max(0.1, w), Math.max(0.1, h || w), rng);
          break;
        case "smoke":
          fx = makeSmoke(rng, {
            size: Math.max(0.1, w),
            rise: Math.max(0.5, h || w * 5),
            color: e.part.material ? e.color : "#8f8a83",
          });
          break;
        default:
          fx = makeExplosion(rng, Math.max(0.3, w), 2.2 + rng() * 1.2, rng() * 3);
      }
      e.matrix.decompose(fx.object.position, fx.object.quaternion, fx.object.scale);
      obj.add(fx.object);
      effects.push(fx);
    }
    objs.push(obj);
    if (i === 0) root.add(obj);
    else objs[f.parent].add(obj);
  });

  return {
    object: root,
    update(s) {
      for (const a of animated) {
        let rx = 0,
          ry = 0,
          rz = 0,
          px = 0,
          py = 0,
          pz = 0,
          sx = 0,
          sy = 0,
          sz = 0;
        for (const c of a.f.channels) {
          const when = c.when ?? "always";
          if ((when === "moving" && !s.moving) || (when === "idle" && s.moving)) continue;
          const v = waveValue(c, s.time + s.phase * 0.1, a.f.flip);
          if (c.property === "rotation") {
            if (c.axis === "x") rx += v * DEG;
            else if (c.axis === "y") ry += v * DEG;
            else rz += v * DEG;
          } else if (c.property === "position") {
            if (c.axis === "x") px += v;
            else if (c.axis === "y") py += v;
            else pz += v;
          } else {
            if (c.axis === "x") sx += v;
            else if (c.axis === "y") sy += v;
            else sz += v;
          }
        }
        a.obj.quaternion.copy(a.quat).multiply(_q.setFromEuler(_e.set(rx, ry, rz)));
        a.obj.position.copy(a.pos).add(_v.set(px, py, pz).applyQuaternion(a.quat));
        a.obj.scale.set(a.scl.x * (1 + sx), a.scl.y * (1 + sy), a.scl.z * (1 + sz));
      }
      for (const fx of effects) fx.update(s);
    },
    dispose() {
      effects.forEach((e) => e.dispose());
    },
  };
}

// ---------------------------------------------------------------- library
/**
 * Compiles and caches the models of one script. Shared by every scene of an
 * engine; dispose() frees all buffers.
 */
export class ModelLibrary {
  private defs = new Map<string, ModelDefinition>();
  private templates = new Map<string, CompiledTemplate>();
  readonly materials: FinishMaterials;

  constructor(models: ModelDefinition[], materials?: FinishMaterials) {
    models.forEach((m) => this.defs.set(m.id, m));
    this.materials = materials ?? makeFinishMaterials();
  }

  has(id: string) {
    return this.defs.has(id);
  }

  definition(id: string) {
    return this.defs.get(id);
  }

  variantCount(id: string) {
    const d = this.defs.get(id);
    if (!d) return 1;
    return Math.max(1, ...d.materials.map((m) => 1 + (m.variants?.length ?? 0)));
  }

  private template(id: string, tint: string | undefined, variant: number, night: boolean) {
    const def = this.defs.get(id)!;
    const key = `${id}|${tint ?? ""}|${variant}|${night ? 1 : 0}`;
    let t = this.templates.get(key);
    if (!t) {
      t = compileTemplate(def, tint, variant, night);
      this.templates.set(key, t);
    }
    return t;
  }

  bounds(id: string): ModelBounds {
    const t = this.template(id, undefined, 0, false);
    const b = t.bounds;
    const center = b.getCenter(new THREE.Vector3());
    const radius = Math.max(
      0.3,
      Math.hypot(Math.max(Math.abs(b.min.x), Math.abs(b.max.x)), Math.max(Math.abs(b.min.z), Math.abs(b.max.z))),
    );
    return { radius, height: Math.max(0.2, b.max.y), minY: b.min.y, center };
  }

  instance(
    id: string,
    o: { tint?: string; variant?: number; night?: boolean; seed?: number } = {},
  ): ModelInstance | null {
    const def = this.defs.get(id);
    if (!def) return null;
    const variant = o.variant ?? 0;
    const tpl = this.template(id, o.tint, variant, !!o.night);
    return instantiate(def, tpl, this.materials, o.seed ?? 1);
  }

  dispose() {
    for (const t of this.templates.values()) t.dispose();
    this.templates.clear();
    this.materials.dispose();
  }
}
