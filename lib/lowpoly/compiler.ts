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
import { channelValue } from "@/lib/lowpoly/motion";
import { trussGeometry } from "@/lib/lowpoly/truss";
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
export interface GroundShading {
  /** World y of the local ground plane; surfaces just above it are darkened. */
  level: { value: number };
  /** Brightness at ground contact (1 = no darkening). */
  floor: { value: number };
  /** Height in metres over which the darkening fades out. */
  range: { value: number };
  /** Amplitude of world-space brightness variation (0 = off). */
  noise: { value: number };
}

export interface FinishMaterials {
  get(finish: Finish): THREE.Material;
  ground: GroundShading;
  dispose(): void;
}

/**
 * Adds two cheap, deterministic shading terms to the lit materials: contact
 * darkening near the ground (reads as ambient occlusion and anchors models)
 * and blocky world-space brightness variation that breaks up large flat faces.
 * Works for regular and instanced meshes.
 */
export function applyGroundShading(material: THREE.MeshStandardMaterial, ground: GroundShading) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPhGround = ground.level;
    shader.uniforms.uPhFloor = ground.floor;
    shader.uniforms.uPhRange = ground.range;
    shader.uniforms.uPhNoise = ground.noise;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPhWorld;\nvarying vec3 vPhLocal;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 phW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          phW = instanceMatrix * phW;
        #endif
        vPhLocal = phW.xyz;
        vPhWorld = (modelMatrix * phW).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vPhWorld;
        varying vec3 vPhLocal;
        uniform float uPhGround;
        uniform float uPhFloor;
        uniform float uPhRange;
        uniform float uPhNoise;
        float phHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float phAO = mix(uPhFloor, 1.0, smoothstep(0.0, uPhRange, vPhWorld.y - uPhGround));
        float phN = phHash(floor(vPhLocal * 1.35) + 0.5);
        diffuseColor.rgb *= phAO * (1.0 + uPhNoise * (phN - 0.5));`,
      );
  };
  material.customProgramCacheKey = () => "ph-ground-v2";
  return material;
}

export function makeFinishMaterials(): FinishMaterials {
  // Neutral by default (decorative R3F scenes); PolyEngine enables it per scene.
  const ground: GroundShading = {
    level: { value: 0 },
    floor: { value: 1 },
    range: { value: 1.4 },
    noise: { value: 0 },
  };
  const std = (o: THREE.MeshStandardMaterialParameters) =>
    applyGroundShading(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, ...o }), ground);
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
    ground,
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
    case "truss":
      g = trussGeometry([sx, sy, sz], seg ?? 8, p.taper ?? 1, p.beamWidth);
      break;
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
  if (p.geometryRotation) flat.applyMatrix4(eulerMatrix(p.geometryRotation));
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
  const partBounds = new Map<ModelPart, THREE.Box3>();
  const boundsOf = (part: ModelPart) => {
    let box = partBounds.get(part);
    if (!box) {
      const geometry = primitiveGeometry(part);
      box = geometry?.boundingBox?.clone() ?? new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
      geometry?.dispose();
      partBounds.set(part, box);
    }
    return box;
  };
  const attach = (part: ModelPart, parent: ModelPart, pos: THREE.Vector3, rot: [number, number, number]) => {
    const face = part.attachTo!;
    const parentBox = boundsOf(parent);
    const point = parentBox.getCenter(new THREE.Vector3());
    if (face === "center") {
      pos.add(point);
      return;
    }
    const axis = face === "top" || face === "bottom" ? "y" : face === "front" || face === "back" ? "x" : "z";
    const positive = face === "top" || face === "front" || face === "right";
    const childBox = boundsOf(part);
    const contact = childBox.getCenter(new THREE.Vector3());
    // Attach mating face centres, not rotated bounding-box extrema. A tilted
    // hat or limb must rotate around its contact, not hover above its parent
    // because an unrelated corner became the minimum point of its AABB.
    point[axis] = positive ? parentBox.max[axis] : parentBox.min[axis];
    // Bounding faces are only exact for boxes. Trace the actual surface at
    // the requested tangential offset so curved/tapered joints do not hover.
    const surface = primitiveGeometry(parent);
    if (surface) {
      const origin = point.clone().add(pos);
      const extent = parentBox.getSize(new THREE.Vector3()).length() + 1;
      origin[axis] = point[axis] + (positive ? extent : -extent);
      const direction = new THREE.Vector3();
      direction[axis] = positive ? -1 : 1;
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(surface, material);
      mesh.updateMatrixWorld(true);
      const hit = new THREE.Raycaster(origin, direction).intersectObject(mesh, false)[0];
      // Out-of-silhouette offsets preserve explicit placement rather than
      // silently relocating a part to an unrelated side of its parent.
      if (hit) point[axis] = hit.point[axis];
      surface.dispose();
      material.dispose();
    }
    contact[axis] = positive ? childBox.min[axis] : childBox.max[axis];
    contact.applyMatrix4(eulerMatrix(rot));
    pos[axis] = 0;
    pos.add(point).sub(contact);
  };

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
        if (part.attachTo && parent) attach(part, parent.part, pos, rot);
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
          // Descendants of a mirrored joint inherit its gait phase too.
          flip: !!part.animation?.some((c) => c.alternate) && (mask.filter(Boolean).length + i) % 2 === 1,
          dynamic: !!part.animation?.length || EFFECT_SHAPES.has(part.shape),
        };
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
  pivot?: [number, number, number];
  flip: boolean;
  meshes: { geometry: THREE.BufferGeometry; finish: Finish }[];
  effects: { part: ModelPart; matrix: THREE.Matrix4; color: string }[];
}

/** Resolve a named hinge from actual oriented, anchored primitive geometry. */
export function resolveAnimationPivot(part: ModelPart): [number, number, number] | undefined {
  if (!part.animationAnchor) return part.animationPivot;
  const geometry = primitiveGeometry(part);
  const bounds = geometry?.boundingBox;
  if (!bounds) {
    geometry?.dispose();
    return [0, 0, 0];
  }
  const point = bounds.getCenter(new THREE.Vector3());
  const face = part.animationAnchor;
  if (face !== "center") {
    const axis = face === "top" || face === "bottom" ? "y" : face === "front" || face === "back" ? "x" : "z";
    point[axis] = face === "top" || face === "front" || face === "right" ? bounds.max[axis] : bounds.min[axis];
  }
  geometry.dispose();
  return point.toArray();
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
  /** Axis-aligned extent at rest (x = depth along the model's front, z = width). */
  size: THREE.Vector3;
}

/** Camera bounds are centred on geometry; collision bounds remain origin-relative. */
export function framingBounds(bounds: ModelBounds, scale: number) {
  return {
    offset: new THREE.Vector3(bounds.center.x * scale, 0, bounds.center.z * scale),
    radius: Math.max(0.15, (Math.hypot(bounds.size.x, bounds.size.z) * scale) / 2),
  };
}

/** Align the lowest authored vertex to the floor, regardless of model origin. */
export function groundPlacement(bounds: ModelBounds, scale: number) {
  const height = Math.max(0.1, bounds.size.y * scale);
  return { height, lift: -bounds.minY * scale - Math.min(0.03, height * 0.012) };
}

/** Usable floor rectangle inside a room shell, in model space (scaled). */
export interface InteriorBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Top of the walls. */
  height: number;
  /** Top of the floor slab (0 when the shell has no floor). */
  floor: number;
  /** Sides with no wall (candidates for the camera's viewing side). */
  open: { minX: boolean; maxX: boolean; minZ: boolean; maxZ: boolean };
}

export interface ModelStructure {
  /** Largest model dimension, metres. */
  size: number;
  /** Groups of solid parts touching neither the main body nor the ground, largest first. */
  detached: { parts: string[]; gap: number; share: number }[];
}

export interface InstancedSet {
  object: THREE.Group;
  count: number;
  dispose(): void;
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

/** Break the supplied structural geometry, never substitute a named ruin model.
 * Work in world-rest coordinates so parent transforms and repeats remain correct.
 */
function ruinGeometry(g: THREE.BufferGeometry, rng: Rng) {
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  if (box.min.y > 1.1) {
    // Detached roof/upper-floor pieces settle onto the ground as tilted debris.
    g.translate(-center.x, -center.y, -center.z);
    g.rotateX((rng() - 0.5) * 1.3);
    g.rotateZ((rng() - 0.5) * 1.1);
    g.scale(0.75, Math.min(1, 0.65 / Math.max(0.1, size.y)), 0.75);
    g.computeBoundingBox();
    g.translate(center.x + (rng() - 0.5) * 1.8, -g.boundingBox!.min.y + rng() * 0.25, center.z + (rng() - 0.5) * 1.8);
  } else {
    // Lower walls remain as uneven stumps instead of intact facades.
    const positions = g.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i);
      const edge = 0.7 + 0.65 * (0.5 + 0.5 * Math.sin(x * 2.1 + z * 1.7));
      positions.setY(i, Math.min(positions.getY(i), edge));
    }
    positions.needsUpdate = true;
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
}

function compileTemplate(
  def: ModelDefinition,
  tint: string | undefined,
  variant: number,
  night: boolean,
  ruined = false,
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
    if (n.dynamic && !ruined) {
      const base = relativeTo(n, frameNode[owner]);
      frames.push({
        parent: owner,
        base,
        channels: n.part.animation ?? [],
        pivot: resolveAnimationPivot(n.part),
        flip: n.flip,
        meshes: [],
        effects: [],
      });
      frameNode.push(n);
      owner = frames.length - 1;
      frameOf.set(n, owner);
    }
    const rel = ruined ? world : n.dynamic ? new THREE.Matrix4() : relativeTo(n, frameNode[owner]);
    const mat = n.part.material ? mats.get(n.part.material) : undefined;
    const color = mat ? resolveColor(mat, tint, variant) : "#9a958e";

    if (EFFECT_SHAPES.has(n.part.shape)) {
      if (ruined) continue;
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
      n.part.beamWidth,
      n.part.detail,
      n.part.profile,
      n.part.anchor,
      n.part.geometryRotation,
    ]);
    if (!geoCache.has(key)) geoCache.set(key, primitiveGeometry(n.part));
    const proto = geoCache.get(key);
    if (!proto) continue;
    const g = proto.clone();
    g.applyMatrix4(rel);
    if (ruined) ruinGeometry(g, rng);

    let finish: Finish = mat.finish;
    let c = new THREE.Color(color);
    if (ruined) {
      c.lerp(new THREE.Color("#49433d"), 0.6);
      finish = "matte";
    }
    if (mat.nightGlow && !ruined) {
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
    if (ruined) {
      g.computeBoundingBox();
      bounds.union(g.boundingBox!);
    } else bounds.union(_box.copy(proto.boundingBox!).applyMatrix4(world));
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

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _pivotBefore = new THREE.Vector3();
const _pivotAfter = new THREE.Vector3();

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
          const v = channelValue(c, s.time + s.phase * 0.1, s.progress, a.f.flip);
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
        if (a.f.pivot) {
          _pivotBefore
            .set(...a.f.pivot)
            .multiply(a.scl)
            .applyQuaternion(a.quat);
          _pivotAfter
            .set(...a.f.pivot)
            .multiply(a.obj.scale)
            .applyQuaternion(a.obj.quaternion);
          a.obj.position.add(_pivotBefore).sub(_pivotAfter);
        }
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
  private interiors = new Map<string, InteriorBounds | null>();
  readonly materials: FinishMaterials;

  constructor(
    models: ModelDefinition[],
    materials?: FinishMaterials,
    private ruinedStructures = false,
  ) {
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
      t = compileTemplate(
        def,
        tint,
        variant,
        night,
        this.ruinedStructures && (def.category === "building" || def.category === "structure"),
      );
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
    return { radius, height: Math.max(0.2, b.max.y), minY: b.min.y, center, size: b.getSize(new THREE.Vector3()) };
  }

  /**
   * Measures a room shell from its actual parts: the largest floor slab,
   * clipped to the inner faces of thin, tall walls standing on it. Null when
   * the model has no recognisable floor or walls.
   */
  interior(id: string): InteriorBounds | null {
    if (this.interiors.has(id)) return this.interiors.get(id)!;
    const def = this.defs.get(id);
    let result: InteriorBounds | null = null;
    if (def) {
      const world = new Map<Node, THREE.Matrix4>();
      const boxes: THREE.Box3[] = [];
      for (const n of expand(def)) {
        const w = n.parent ? world.get(n.parent)!.clone().multiply(n.local) : n.local.clone();
        world.set(n, w);
        if (n.part.shape === "group" || EFFECT_SHAPES.has(n.part.shape)) continue;
        const g = primitiveGeometry(n.part);
        if (!g) continue;
        g.computeBoundingBox();
        boxes.push(g.boundingBox!.clone().applyMatrix4(w));
        g.dispose();
      }
      const s = def.scale ?? 1;
      for (const b of boxes) {
        b.min.multiplyScalar(s);
        b.max.multiplyScalar(s);
      }
      const size = (b: THREE.Box3) => b.getSize(new THREE.Vector3());
      let floor: THREE.Box3 | null = null;
      for (const b of boxes) {
        const z = size(b);
        if (z.y <= 0.5 && b.min.y < 0.6 && z.x * z.z >= 16 && (!floor || z.x * z.z > size(floor).x * size(floor).z))
          floor = b;
      }
      const walls = boxes.filter((b) => {
        const z = size(b);
        return z.y >= 2 && Math.min(z.x, z.z) <= 0.8 && Math.max(z.x, z.z) >= 3;
      });
      if (floor || walls.length >= 2) {
        const base = floor ?? walls.reduce((u, w) => u.union(w), new THREE.Box3());
        const rect = { minX: base.min.x, maxX: base.max.x, minZ: base.min.z, maxZ: base.max.z };
        const midX = (rect.minX + rect.maxX) / 2,
          midZ = (rect.minZ + rect.maxZ) / 2;
        const open = { minX: true, maxX: true, minZ: true, maxZ: true };
        for (const w of walls) {
          const z = size(w);
          if (z.x <= z.z) {
            if ((w.min.x + w.max.x) / 2 < midX) {
              rect.minX = Math.max(rect.minX, w.max.x);
              open.minX = false;
            } else {
              rect.maxX = Math.min(rect.maxX, w.min.x);
              open.maxX = false;
            }
          } else if ((w.min.z + w.max.z) / 2 < midZ) {
            rect.minZ = Math.max(rect.minZ, w.max.z);
            open.minZ = false;
          } else {
            rect.maxZ = Math.min(rect.maxZ, w.min.z);
            open.maxZ = false;
          }
        }
        if (rect.maxX - rect.minX >= 2 && rect.maxZ - rect.minZ >= 2)
          result = {
            ...rect,
            height: walls.length ? Math.max(...walls.map((w) => w.max.y)) : 3.5,
            floor: floor ? Math.max(0, floor.max.y) : 0,
            open,
          };
      }
    }
    this.interiors.set(id, result);
    return result;
  }

  /**
   * Finds parts that float loose from the model: groups of solid parts that
   * touch neither the main body nor the ground at rest. Touching is measured
   * between the parts' actual bounding boxes, including repeats and mirrors.
   */
  structure(id: string): ModelStructure {
    const def = this.defs.get(id);
    if (!def) return { size: 0, detached: [] };
    const world = new Map<Node, THREE.Matrix4>();
    const boxes: { part: string; box: THREE.Box3 }[] = [];
    for (const n of expand(def)) {
      const w = n.parent ? world.get(n.parent)!.clone().multiply(n.local) : n.local.clone();
      world.set(n, w);
      if (n.part.shape === "group" || EFFECT_SHAPES.has(n.part.shape)) continue;
      const g = primitiveGeometry(n.part);
      if (!g) continue;
      g.computeBoundingBox();
      boxes.push({ part: n.part.id, box: g.boundingBox!.clone().applyMatrix4(w) });
      g.dispose();
    }
    const scale = def.scale ?? 1;
    if (!boxes.length) return { size: 0, detached: [] };
    const all = boxes.reduce((u, b) => u.union(b.box), new THREE.Box3());
    const extent = all.getSize(new THREE.Vector3());
    const size = Math.max(extent.x, extent.y, extent.z);
    const tol = Math.max(0.02, size * 0.015);
    const gap = (a: THREE.Box3, b: THREE.Box3) =>
      Math.hypot(
        Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x),
        Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y),
        Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z),
      );
    // Union-find over parts, with one extra node for the ground the model stands on.
    const ground = boxes.length;
    const root = Array.from({ length: boxes.length + 1 }, (_, i) => i);
    const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
    const join = (a: number, b: number) => (root[find(a)] = find(b));
    boxes.forEach((a, i) => {
      if (a.box.min.y <= all.min.y + tol) join(i, ground);
      for (let j = i + 1; j < boxes.length; j++) if (gap(a.box, boxes[j].box) <= tol) join(i, j);
    });
    const volume = (b: THREE.Box3) => {
      const s = b.getSize(new THREE.Vector3());
      return Math.max(s.x * s.y * s.z, 1e-6);
    };
    const groups = new Map<number, number[]>();
    boxes.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
    const weight = (list: number[]) => list.reduce((a, i) => a + volume(boxes[i].box), 0);
    const total = weight(boxes.map((_, i) => i));
    const main = [...groups.entries()].sort(
      (a, b) => Number(b[0] === find(ground)) - Number(a[0] === find(ground)) || weight(b[1]) - weight(a[1]),
    )[0][1];
    const detached = [...groups.values()]
      .filter((list) => list !== main)
      .map((list) => ({
        parts: [...new Set(list.map((i) => boxes[i].part))].slice(0, 8),
        gap: Math.min(...list.flatMap((i) => main.map((j) => gap(boxes[i].box, boxes[j].box)))) * scale,
        share: weight(list) / total,
      }))
      .sort((a, b) => b.share - a.share);
    return { size: size * scale, detached };
  }

  /**
   * Static GPU-instanced copies of a model for set dressing: one draw call per
   * surface finish regardless of count. Animated pivots are frozen at rest and
   * effects are omitted, so use it for scenery, not for acting subjects.
   */
  instancedSet(
    id: string,
    matrices: THREE.Matrix4[],
    o: { tint?: string; variant?: number; night?: boolean; colors?: THREE.Color[]; shadows?: boolean } = {},
  ): InstancedSet | null {
    const def = this.defs.get(id);
    if (!def || !matrices.length) return null;
    const tpl = this.template(id, o.tint, o.variant ?? 0, !!o.night);
    const s = def.scale ?? 1;
    const rootScale = new THREE.Matrix4().makeScale(s, s, s);
    const frameWorld: THREE.Matrix4[] = [];
    tpl.frames.forEach((f, i) => {
      frameWorld[i] = i === 0 ? new THREE.Matrix4() : frameWorld[f.parent].clone().multiply(f.base);
    });
    const group = new THREE.Group();
    const meshes: THREE.InstancedMesh[] = [];
    const m4 = new THREE.Matrix4();
    tpl.frames.forEach((f, i) => {
      for (const m of f.meshes) {
        const im = new THREE.InstancedMesh(m.geometry, this.materials.get(m.finish), matrices.length);
        matrices.forEach((M, k) => {
          im.setMatrixAt(k, m4.copy(M).multiply(rootScale).multiply(frameWorld[i]));
          if (o.colors?.[k]) im.setColorAt(k, o.colors[k]);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        const lit = m.finish !== "emissive";
        im.castShadow = (o.shadows ?? true) && lit && m.finish !== "glass";
        im.receiveShadow = lit;
        group.add(im);
        meshes.push(im);
      }
    });
    return { object: group, count: matrices.length, dispose: () => meshes.forEach((im) => im.dispose()) };
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
