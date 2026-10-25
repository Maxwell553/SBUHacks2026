/**
 * Polyhistor ModelDefinition — a bounded, declarative description of a
 * low-poly 3D model (primitives + materials + transforms + parent/child rig
 * + simple animation channels). Gemini authors these per request; the
 * browser compiles them with lib/lowpoly/compiler.ts. Nothing here is code:
 * no expressions, no scripts, only data validated against hard limits.
 *
 * Conventions: metres, +y up, +x forward (the model's front), +z is the
 * model's right-hand side. The model origin sits on the ground (or the
 * waterline for watercraft) at the centre of its footprint.
 *
 * Isomorphic: zod only.
 */
import { z } from "zod";

export const MODEL_SCHEMA_VERSION = 1 as const;

export const MODEL_LIMITS = {
  maxModelsPerScript: 16,
  maxParts: 48,
  maxMaterials: 10,
  maxExpandedNodes: 240,
  maxCopiesPerPart: 64,
  // Articulated hips, knees, shoulders, elbows and held tools need more than six levels.
  // Expanded node and triangle caps independently bound rendering work.
  maxDepth: 12,
  maxTriangles: 14_000,
  maxChannelsPerPart: 3,
  maxProfilePoints: 24,
  maxVariants: 6,
  minDimension: 0.01,
  maxDimension: 80,
  maxOffset: 80,
  minSegments: 3,
  maxSegments: 24,
  maxRepeat: 32,
  maxFrequencyHz: 6,
  maxSpinDegPerSec: 1440,
  maxRotationAmplitudeDeg: 180,
  maxPositionAmplitude: 5,
  maxScaleAmplitude: 1,
  maxJsonBytes: 24_000,
} as const;

export const SHAPES = [
  "box",
  "wedge",
  "cylinder",
  "cone",
  "sphere",
  "dome",
  "ico",
  "capsule",
  "torus",
  "hull",
  "extrusion",
  "lathe",
  "truss",
  "group",
  // animated effect primitives (rendered procedurally, deterministic)
  "flag",
  "fire",
  "smoke",
  "explosion",
] as const;
export const GEOMETRY_SHAPES = SHAPES.filter((s) => !["group", "flag", "fire", "smoke", "explosion"].includes(s));
export const FINISHES = ["matte", "satin", "metal", "glass", "emissive", "cloth"] as const;
export const MODEL_CATEGORIES = [
  "figure",
  "animal",
  "vehicle",
  "watercraft",
  "aircraft",
  "spacecraft",
  "building",
  "structure",
  "nature",
  "prop",
  "effect",
] as const;
export const PLACEMENTS = ["ground", "water", "air"] as const;
export const ANCHORS = ["center", "bottom", "top", "front", "back", "left", "right"] as const;
export const AXES = ["x", "y", "z"] as const;
export const CHANNEL_PROPERTIES = ["rotation", "position", "scale"] as const;
export const WAVES = ["sine", "spin", "pulse", "bounce"] as const;
export const CHANNEL_WHEN = ["always", "moving", "idle"] as const;
export const REPEAT_MODES = ["linear", "radial"] as const;

export type Shape = (typeof SHAPES)[number];
export type Finish = (typeof FINISHES)[number];
export type ModelCategory = (typeof MODEL_CATEGORIES)[number];
export type Placement = (typeof PLACEMENTS)[number];
export type Anchor = (typeof ANCHORS)[number];
export type Axis = (typeof AXES)[number];

/** Human-readable size semantics per shape (also embedded in prompts). */
export const SHAPE_GUIDE: Record<Shape, string> = {
  truss:
    "Open rectangular lattice frame: size=[base x width,height,base z depth], taper=top/base width ratio (0.05–2), segments=3–8 vertical bays, optional beamWidth in metres. Four corner posts, horizontal rings and X braces; NEVER solid infill. Rotate to form horizontal bridge spans or crane booms.",
  box: "size=[width x, height y, depth z]",
  wedge: "triangular prism (gable roof / ramp); ridge runs along x; size=[length x, height y, base width z]",
  cylinder:
    "size=[diameter x, height y, diameter z]; taper = top/bottom radius ratio (0..2, 1 = straight); segments 3..24",
  cone: "size=[base diameter x, height y, base diameter z]; segments 3..24 (4 = pyramid)",
  sphere: "ellipsoid; size=[dx, dy, dz]; segments 4..16 (low = faceted)",
  dome: "hemisphere sitting on its flat base; size=[dx, height, dz]; segments 4..16",
  ico: "faceted icosahedron blob (heads, rocks, foliage, clouds); size=[dx, dy, dz]; detail 0 or 1",
  capsule: "rounded cylinder along y (limbs, fuselages when rotated); size=[diameter x, total length y, diameter z]",
  torus:
    "ring lying flat in the xz plane (rotate 90° about x for a wheel); size=[outer diameter, tube thickness, outer diameter]",
  hull: "boat hull, bow points +x, deck on top; size=[length x, keel-to-deck depth y, beam z]",
  extrusion:
    "custom 2D silhouette in the xy plane extruded along z; profile points in -1..1 scaled by size[0]/2, size[1]/2; depth = size[2]",
  lathe:
    "profile revolved around y (domes, vases, towers, bells, rocket bodies); profile [r 0..1, y 0..1] scaled by size[0]/2 (radius) and size[1] (height)",
  group: "invisible pivot/joint for rigs; children rotate around its origin",
  flag: "waving cloth; origin = top-left corner at the pole; size=[width, height, -]; colour from material",
  fire: "flickering flames; size=[width, height, -]",
  smoke: "rising smoke column; size=[puff size, rise height, -]; colour from material (grey if none)",
  explosion: "periodic blast with debris; size=[blast diameter, -, -]",
};

// ---------------------------------------------------------------- schema
const slug = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "lowercase slug: a-z, 0-9, _ (max 40)");
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb");
const dim = z.number().min(0).max(MODEL_LIMITS.maxDimension);
const off = z.number().min(-MODEL_LIMITS.maxOffset).max(MODEL_LIMITS.maxOffset);
const deg = z.number().min(-720).max(720);
const vec3 = z.tuple([off, off, off]);
const size3 = z.tuple([dim, dim, dim]);
const rot3 = z.tuple([deg, deg, deg]);

export const materialSchema = z.object({
  id: slug,
  color: hex,
  finish: z.enum(FINISHES),
  /** Replaced by the scene element's colour (uniforms, sails, banners...). */
  tint: z.boolean().optional(),
  /** Alternative colours; each instance picks one (crowds, foliage). */
  variants: z.array(hex).max(MODEL_LIMITS.maxVariants).optional(),
  /** Emissive only at night (windows, lanterns); rendered dark by day. */
  nightGlow: z.boolean().optional(),
});

export const channelSchema = z.object({
  property: z.enum(CHANNEL_PROPERTIES),
  axis: z.enum(AXES),
  wave: z.enum(WAVES),
  /** degrees (rotation; deg/sec for spin), metres (position) or ratio (scale) */
  amplitude: z.number().min(-MODEL_LIMITS.maxSpinDegPerSec).max(MODEL_LIMITS.maxSpinDegPerSec),
  frequency: z.number().min(0).max(MODEL_LIMITS.maxFrequencyHz),
  phase: z.number().min(-360).max(360).optional(),
  /** One-shot motion in normalized scene time, overriding the periodic wave. */
  keyframes: z
    .array(z.object({ at: z.number().min(0).max(1), value: z.number().min(-1).max(1) }))
    .min(2)
    .max(8)
    .optional(),
  interpolation: z.enum(["linear", "smooth", "hold"]).optional(),
  /** Mirrored / repeated copies alternate phase by 180° (walk cycles, oars). */
  alternate: z.boolean().optional(),
  when: z.enum(CHANNEL_WHEN).optional(),
});

export const repeatSchema = z.object({
  mode: z.enum(REPEAT_MODES),
  count: z.number().int().min(2).max(MODEL_LIMITS.maxRepeat),
  /** linear: offset between copies */
  step: vec3.optional(),
  /** linear: extra rotation per copy (degrees) */
  rotateStep: rot3.optional(),
  /** radial: distance from the parent origin */
  radius: dim.optional(),
  /** radial: axis copies are arranged around */
  axis: z.enum(AXES).optional(),
  startAngle: deg.optional(),
});

export const partSchema = z.object({
  id: slug,
  parent: slug.optional(),
  shape: z.enum(SHAPES),
  material: slug.optional(),
  size: size3,
  position: vec3.optional(),
  rotation: rot3.optional(),
  geometryRotation: rot3.optional(),
  anchor: z.enum(ANCHORS).optional(),
  attachTo: z.enum(ANCHORS).optional(),
  segments: z.number().int().min(MODEL_LIMITS.minSegments).max(MODEL_LIMITS.maxSegments).optional(),
  taper: z.number().min(0).max(2).optional(),
  beamWidth: dim.optional(),
  detail: z.number().int().min(0).max(1).optional(),
  profile: z
    .array(z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)]))
    .min(3)
    .max(MODEL_LIMITS.maxProfilePoints)
    .optional(),
  mirror: z.enum(AXES).optional(),
  repeat: repeatSchema.optional(),
  animation: z.array(channelSchema).max(MODEL_LIMITS.maxChannelsPerPart).optional(),
  animationPivot: vec3.optional(),
  animationAnchor: z.enum(ANCHORS).optional(),
});

export const modelDefinitionSchema = z
  .object({
    id: slug,
    name: z.string().min(1).max(48),
    category: z.enum(MODEL_CATEGORIES),
    instancePolicy: z.enum(["unique", "repeatable"]).optional(),
    placement: z.enum(PLACEMENTS),
    scale: z.number().min(0.1).max(10).optional(),
    materials: z.array(materialSchema).min(1).max(MODEL_LIMITS.maxMaterials),
    parts: z.array(partSchema).min(1).max(MODEL_LIMITS.maxParts),
    notes: z.string().max(240).optional(),
  })
  .superRefine((m, ctx) => {
    const mats = new Set(m.materials.map((x) => x.id));
    const ids = new Set<string>();
    m.parts.forEach((p, i) => {
      if (ids.has(p.id))
        ctx.addIssue({ code: "custom", path: ["parts", i, "id"], message: `duplicate part id ${p.id}` });
      ids.add(p.id);
      if (p.material && !mats.has(p.material))
        ctx.addIssue({ code: "custom", path: ["parts", i, "material"], message: `unknown material ${p.material}` });
      if ((p.shape === "extrusion" || p.shape === "lathe") && !p.profile)
        ctx.addIssue({ code: "custom", path: ["parts", i, "profile"], message: `${p.shape} requires profile` });
    });
    m.parts.forEach((p, i) => {
      if (p.parent && !ids.has(p.parent))
        ctx.addIssue({ code: "custom", path: ["parts", i, "parent"], message: `unknown parent ${p.parent}` });
    });
    const c = analyzeModel(m as ModelDefinition);
    if (c.cycle) ctx.addIssue({ code: "custom", path: ["parts"], message: "parent cycle" });
    if (c.depth > MODEL_LIMITS.maxDepth)
      ctx.addIssue({ code: "custom", path: ["parts"], message: `rig depth ${c.depth} > ${MODEL_LIMITS.maxDepth}` });
    if (c.nodes > MODEL_LIMITS.maxExpandedNodes)
      ctx.addIssue({
        code: "custom",
        path: ["parts"],
        message: `${c.nodes} expanded parts > ${MODEL_LIMITS.maxExpandedNodes}`,
      });
    if (c.triangles > MODEL_LIMITS.maxTriangles)
      ctx.addIssue({
        code: "custom",
        path: ["parts"],
        message: `~${c.triangles} triangles > ${MODEL_LIMITS.maxTriangles}`,
      });
  });

export type ModelMaterial = z.infer<typeof materialSchema>;
export type ModelChannel = z.infer<typeof channelSchema>;
export type ModelRepeat = z.infer<typeof repeatSchema>;
export type ModelPart = z.infer<typeof partSchema>;
export type ModelDefinition = z.infer<typeof modelDefinitionSchema>;

// ---------------------------------------------------------------- complexity
export function copiesOf(p: Pick<ModelPart, "mirror" | "repeat">): number {
  return (p.mirror ? 2 : 1) * (p.repeat ? p.repeat.count : 1);
}

export function trianglesOf(p: ModelPart): number {
  const seg = p.segments ?? 8;
  switch (p.shape) {
    case "truss":
      return 12 * (8 + 12 * Math.max(3, Math.min(8, Math.round(seg))));
    case "box":
      return 12;
    case "wedge":
      return 8;
    case "cylinder":
      return seg * 4;
    case "cone":
      return seg * 2;
    case "sphere":
      return seg * Math.max(3, Math.round(seg / 2)) * 2;
    case "dome":
      return seg * Math.max(2, Math.round(seg / 4)) * 2 + seg;
    case "ico":
      return p.detail ? 80 : 20;
    case "capsule":
      return seg * 12;
    case "torus":
      return seg * 12;
    case "hull":
      return 36;
    case "extrusion":
      return (p.profile?.length ?? 4) * 4;
    case "lathe":
      return (p.profile?.length ?? 4) * seg * 2;
    case "flag":
      return 42;
    case "fire":
      return 20;
    case "smoke":
      return 180;
    case "explosion":
      return 220;
    default:
      return 0;
  }
}

/** Expanded node count, triangle estimate, rig depth and cycle detection. */
export function analyzeModel(m: Pick<ModelDefinition, "parts">) {
  const byId = new Map(m.parts.map((p) => [p.id, p]));
  const multiplier = new Map<string, number>();
  const depthOf = new Map<string, number>();
  let cycle = false;
  const resolve = (id: string, seen: Set<string>): [number, number] => {
    if (multiplier.has(id)) return [multiplier.get(id)!, depthOf.get(id)!];
    const p = byId.get(id);
    if (!p) return [1, 0];
    if (seen.has(id)) {
      cycle = true;
      return [1, 0];
    }
    seen.add(id);
    const [pm, pd] = p.parent && byId.has(p.parent) ? resolve(p.parent, seen) : [1, 0];
    const mult = pm * copiesOf(p);
    multiplier.set(id, mult);
    depthOf.set(id, pd + 1);
    return [mult, pd + 1];
  };
  let nodes = 0,
    triangles = 0,
    depth = 0;
  for (const p of m.parts) {
    const [mult, d] = resolve(p.id, new Set());
    nodes += mult;
    triangles += mult * trianglesOf(p);
    depth = Math.max(depth, d);
  }
  return { nodes, triangles, depth, cycle };
}

// ---------------------------------------------------------------- normalise
const toSlug = (v: unknown, fallback: string) => {
  const s = String(v ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40);
  return s || fallback;
};
export { toSlug as slugify };

const n = (v: unknown, lo: number, hi: number, d: number) => {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
};
const arr3 = (v: unknown, lo: number, hi: number, d: [number, number, number]): [number, number, number] => {
  const a = Array.isArray(v)
    ? v
    : v && typeof v === "object"
      ? [(v as Record<string, unknown>).x, (v as Record<string, unknown>).y, (v as Record<string, unknown>).z]
      : [];
  return [n(a[0], lo, hi, d[0]), n(a[1], lo, hi, d[1]), n(a[2], lo, hi, d[2])];
};
const pickEnum = <T extends readonly string[]>(list: T, v: unknown, d: T[number]): T[number] => {
  const s = typeof v === "string" ? v.toLowerCase().trim() : "";
  return (list as readonly string[]).includes(s) ? (s as T[number]) : d;
};
const hexOr = (v: unknown, d: string) =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : d;
const o = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const SHAPE_ALIASES: Record<string, Shape> = {
  cube: "box",
  cuboid: "box",
  prism: "wedge",
  roof: "wedge",
  tube: "cylinder",
  pyramid: "cone",
  ellipsoid: "sphere",
  hemisphere: "dome",
  icosahedron: "ico",
  blob: "ico",
  rock: "ico",
  pill: "capsule",
  ring: "torus",
  wheel: "torus",
  boat: "hull",
  silhouette: "extrusion",
  extrude: "extrusion",
  revolve: "lathe",
  pivot: "group",
  joint: "group",
  empty: "group",
  banner: "flag",
  flame: "fire",
};

function normalizePart(raw: unknown, i: number, matIds: Set<string>, defaultMat: string): ModelPart | null {
  const p = o(raw);
  const shapeRaw = typeof p.shape === "string" ? p.shape.toLowerCase().trim() : "";
  const shape = (SHAPES as readonly string[]).includes(shapeRaw) ? (shapeRaw as Shape) : SHAPE_ALIASES[shapeRaw];
  if (!shape) return null;
  const part: ModelPart = {
    id: toSlug(p.id, `part_${i}`),
    shape,
    size: arr3(p.size, MODEL_LIMITS.minDimension, MODEL_LIMITS.maxDimension, [1, 1, 1]),
  };
  if (p.parent) part.parent = toSlug(p.parent, "");
  const mat = typeof p.material === "string" ? toSlug(p.material, "") : "";
  if (shape !== "group") part.material = matIds.has(mat) ? mat : defaultMat;
  if (p.position !== undefined)
    part.position = arr3(p.position, -MODEL_LIMITS.maxOffset, MODEL_LIMITS.maxOffset, [0, 0, 0]);
  if (p.animationAnchor !== undefined) part.animationAnchor = pickEnum(ANCHORS, p.animationAnchor, "center");
  if (p.animationPivot !== undefined)
    part.animationPivot = arr3(p.animationPivot, -MODEL_LIMITS.maxOffset, MODEL_LIMITS.maxOffset, [0, 0, 0]);
  if (p.rotation !== undefined) part.rotation = arr3(p.rotation, -720, 720, [0, 0, 0]);
  if (p.geometryRotation !== undefined) part.geometryRotation = arr3(p.geometryRotation, -720, 720, [0, 0, 0]);
  if (p.anchor !== undefined) part.anchor = pickEnum(ANCHORS, p.anchor, "center");
  if (p.attachTo !== undefined && p.attachTo !== "none") part.attachTo = pickEnum(ANCHORS, p.attachTo, "center");
  if (p.segments !== undefined)
    part.segments = Math.round(n(p.segments, MODEL_LIMITS.minSegments, MODEL_LIMITS.maxSegments, 8));
  if (p.taper !== undefined) part.taper = n(p.taper, 0, 2, 1);
  if (p.beamWidth !== undefined)
    part.beamWidth = n(p.beamWidth, MODEL_LIMITS.minDimension, MODEL_LIMITS.maxDimension, 0.05);
  if (p.detail !== undefined) part.detail = n(p.detail, 0, 1, 0) >= 0.5 ? 1 : 0;
  if (Array.isArray(p.profile)) {
    const prof = p.profile
      .map((pt) => (Array.isArray(pt) ? pt : [o(pt).x ?? o(pt).r, o(pt).y]))
      .map((pt) => [n(pt[0], -1, 1, NaN), n(pt[1], -1, 1, NaN)] as [number, number])
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
      .slice(0, MODEL_LIMITS.maxProfilePoints);
    if (prof.length >= 3) part.profile = prof;
  }
  if ((shape === "extrusion" || shape === "lathe") && !part.profile) {
    part.shape = shape === "lathe" ? "cylinder" : "box";
  }
  if (p.mirror !== undefined && p.mirror !== null && p.mirror !== false) part.mirror = pickEnum(AXES, p.mirror, "z");
  const rep = o(p.repeat);
  if (Object.keys(rep).length) {
    const count = Math.round(n(rep.count, 2, MODEL_LIMITS.maxRepeat, 0));
    if (count >= 2) {
      const mode = pickEnum(REPEAT_MODES, rep.mode, rep.radius !== undefined ? "radial" : "linear");
      part.repeat = { mode, count };
      if (mode === "linear") {
        part.repeat.step = arr3(rep.step, -MODEL_LIMITS.maxOffset, MODEL_LIMITS.maxOffset, [1, 0, 0]);
        if (rep.rotateStep !== undefined) part.repeat.rotateStep = arr3(rep.rotateStep, -720, 720, [0, 0, 0]);
      } else {
        part.repeat.radius = n(rep.radius, 0, MODEL_LIMITS.maxDimension, 1);
        part.repeat.axis = pickEnum(AXES, rep.axis, "y");
        if (rep.startAngle !== undefined) part.repeat.startAngle = n(rep.startAngle, -720, 720, 0);
      }
    }
  }
  if (Array.isArray(p.animation)) {
    const ch = p.animation
      .map((c) => o(c))
      .map((c) => {
        const property = pickEnum(CHANNEL_PROPERTIES, c.property, "rotation");
        const wave = pickEnum(WAVES, c.wave, "sine");
        const cap =
          property === "rotation"
            ? wave === "spin"
              ? MODEL_LIMITS.maxSpinDegPerSec
              : MODEL_LIMITS.maxRotationAmplitudeDeg
            : property === "position"
              ? MODEL_LIMITS.maxPositionAmplitude
              : MODEL_LIMITS.maxScaleAmplitude;
        const out: ModelChannel = {
          property,
          axis: pickEnum(AXES, c.axis, "y"),
          wave,
          amplitude: n(c.amplitude, -cap, cap, 0),
          frequency: n(c.frequency, 0, MODEL_LIMITS.maxFrequencyHz, 1),
        };
        if (Array.isArray(c.keyframes)) {
          const keys = new Map<number, number>();
          for (const raw of c.keyframes.slice(0, 8)) {
            const k = o(raw);
            if (!Number.isFinite(Number(k.at)) || !Number.isFinite(Number(k.value))) continue;
            keys.set(n(k.at, 0, 1, 0), n(k.value, -1, 1, 0));
          }
          if (keys.size >= 2) {
            out.keyframes = [...keys].sort((a, b) => a[0] - b[0]).map(([at, value]) => ({ at, value }));
            out.interpolation = pickEnum(["linear", "smooth", "hold"] as const, c.interpolation, "smooth");
          }
        }
        if (c.phase !== undefined) out.phase = n(c.phase, -360, 360, 0);
        if (c.alternate !== undefined) out.alternate = !!c.alternate;
        if (c.when !== undefined) out.when = pickEnum(CHANNEL_WHEN, c.when, "always");
        return out;
      })
      .filter((c) => c.amplitude !== 0)
      .slice(0, MODEL_LIMITS.maxChannelsPerPart);
    if (ch.length) part.animation = ch;
  }
  return part;
}

/**
 * Repairs near-miss model JSON (aliases, clamping, slugging, dangling refs)
 * and trims trailing parts until complexity limits hold. Throws if nothing
 * renderable remains.
 */
export function normalizeModelDefinition(
  raw: unknown,
  fallbackId = "model",
  options: { requireComplete?: boolean } = {},
): ModelDefinition {
  const r = o(raw);
  const materials: ModelMaterial[] = [];
  const seenMat = new Set<string>();
  for (const [i, mr] of (Array.isArray(r.materials) ? r.materials : []).entries()) {
    const m = o(mr);
    const id = toSlug(m.id, `mat_${i}`);
    if (seenMat.has(id) || materials.length >= MODEL_LIMITS.maxMaterials) continue;
    seenMat.add(id);
    const mat: ModelMaterial = { id, color: hexOr(m.color, "#b8b0a0"), finish: pickEnum(FINISHES, m.finish, "matte") };
    if (m.tint) mat.tint = true;
    if (m.nightGlow) mat.nightGlow = true;
    if (Array.isArray(m.variants)) {
      const v = m.variants
        .map((c) => hexOr(c, ""))
        .filter(Boolean)
        .slice(0, MODEL_LIMITS.maxVariants);
      if (v.length) mat.variants = v;
    }
    materials.push(mat);
  }
  if (!materials.length) materials.push({ id: "base", color: "#b8b0a0", finish: "matte" });
  const matIds = new Set(materials.map((m) => m.id));

  const parts: ModelPart[] = [];
  const seenPart = new Set<string>();
  for (const [i, pr] of (Array.isArray(r.parts) ? r.parts : []).entries()) {
    if (parts.length >= MODEL_LIMITS.maxParts) break;
    const p = normalizePart(pr, i, matIds, materials[0].id);
    if (!p) continue;
    let id = p.id;
    for (let k = 2; seenPart.has(id); k++) id = `${p.id.slice(0, 36)}_${k}`;
    p.id = id;
    seenPart.add(id);
    parts.push(p);
  }
  for (const p of parts) if (p.parent && (!seenPart.has(p.parent) || p.parent === p.id)) delete p.parent;

  // Break cycles by detaching the offending part.
  const byId = new Map(parts.map((p) => [p.id, p]));
  for (const p of parts) {
    const seen = new Set<string>([p.id]);
    let cur = p.parent;
    while (cur) {
      if (seen.has(cur)) {
        delete p.parent;
        break;
      }
      seen.add(cur);
      cur = byId.get(cur)?.parent;
    }
  }

  // Remove only over-deep branches. Trimming the tail for a depth violation
  // could discard every later sibling (e.g. legs after a deeply nested hat).
  // Keep surviving transforms intact rather than reparenting visible geometry.
  let trimmed = parts.filter((p) => {
    let depth = 1;
    let parent = p.parent;
    while (parent) {
      depth++;
      parent = byId.get(parent)?.parent;
    }
    return depth <= MODEL_LIMITS.maxDepth;
  });
  // Lower tessellation before removing structural parts. Repeated trusses can
  // consume the triangle budget even with very few declarative parts.
  while (analyzeModel({ parts: trimmed }).triangles > MODEL_LIMITS.maxTriangles) {
    let changed = false;
    for (const part of trimmed) {
      const segments = part.segments ?? 8;
      if (segments <= MODEL_LIMITS.minSegments) continue;
      const reduced = { ...part, segments: segments - 1 };
      if (trianglesOf(reduced) >= trianglesOf(part)) continue;
      part.segments = reduced.segments;
      changed = true;
    }
    if (!changed) break;
  }
  // Trim from the end (children first) for aggregate complexity limits.
  for (let guard = 0; guard < MODEL_LIMITS.maxParts; guard++) {
    const a = analyzeModel({ parts: trimmed });
    if (
      a.nodes <= MODEL_LIMITS.maxExpandedNodes &&
      a.triangles <= MODEL_LIMITS.maxTriangles &&
      a.depth <= MODEL_LIMITS.maxDepth
    )
      break;
    const drop = trimmed[trimmed.length - 1];
    const dropIds = new Set([drop.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of trimmed)
        if (p.parent && dropIds.has(p.parent) && !dropIds.has(p.id)) {
          dropIds.add(p.id);
          grew = true;
        }
    }
    trimmed = trimmed.filter((p) => !dropIds.has(p.id));
    if (!trimmed.length) break;
  }
  if (options.requireComplete && trimmed.length !== (Array.isArray(r.parts) ? r.parts.length : 0))
    throw new Error(
      `Geometry budget would remove structural parts (${parts.length} requested, ${trimmed.length} retained; ` +
        `${analyzeModel({ parts }).triangles} triangles, ${analyzeModel({ parts }).nodes} expanded nodes, depth ${analyzeModel({ parts }).depth}). ` +
        `Limits: ${MODEL_LIMITS.maxTriangles} triangles, ${MODEL_LIMITS.maxExpandedNodes} nodes, depth ${MODEL_LIMITS.maxDepth}. ` +
        "Rebuild the complete silhouette with shallow independent roots and fewer repeats. Children inherit ALL parent copies; never repeat a child again to match repeated parents.",
    );
  if (!trimmed.some((p) => p.shape !== "group"))
    throw new Error(`model ${String(r.id ?? fallbackId)} has no renderable parts`);

  const def: ModelDefinition = {
    id: toSlug(r.id, fallbackId),
    name:
      String(r.name ?? r.id ?? fallbackId)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 48) || fallbackId,
    category: pickEnum(MODEL_CATEGORIES, r.category, "prop"),
    placement: pickEnum(PLACEMENTS, r.placement, "ground"),
    materials,
    parts: trimmed,
  };
  if (r.instancePolicy === "unique" || r.instancePolicy === "repeatable") def.instancePolicy = r.instancePolicy;
  if (r.scale !== undefined) def.scale = n(r.scale, 0.1, 10, 1);
  if (typeof r.notes === "string" && r.notes.trim()) def.notes = r.notes.trim().slice(0, 240);
  return modelDefinitionSchema.parse(def);
}

export function validateModelDefinition(raw: unknown) {
  return modelDefinitionSchema.safeParse(raw);
}

/** Text fields for moderation. */
export function modelText(m: ModelDefinition): string {
  return [m.name, m.notes, m.id].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------- Gemini
/** Gemini responseJsonSchema for ONE ModelDefinition (flat parts list). */
export function geminiModelDefinitionJsonSchema() {
  const num = (min: number, max: number, description?: string) => ({
    type: "number",
    minimum: min,
    maximum: max,
    ...(description ? { description } : {}),
  });
  const v3 = (min: number, max: number, description: string) => ({
    type: "array",
    items: { type: "number", minimum: min, maximum: max },
    minItems: 3,
    maxItems: 3,
    description,
  });
  const en = (values: readonly string[], description: string) => ({ type: "string", enum: [...values], description });
  const slugS = (description: string) => ({ type: "string", pattern: "^[a-z][a-z0-9_]{0,39}$", description });
  return {
    type: "object",
    properties: {
      id: slugS("Unique model id referenced by scene elements, e.g. 'norman_knight'"),
      name: { type: "string", maxLength: 48 },
      category: en(MODEL_CATEGORIES, "Archetype"),
      placement: en(PLACEMENTS, "ground = stands on terrain, water = floats at waterline, air = flies"),
      scale: num(0.1, 10, "Overall multiplier, usually 1"),
      notes: { type: "string", maxLength: 240, description: "Short design rationale (era cues, silhouette)" },
      materials: {
        type: "array",
        minItems: 1,
        maxItems: MODEL_LIMITS.maxMaterials,
        items: {
          type: "object",
          properties: {
            id: slugS("Material id"),
            color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
            finish: en(FINISHES, "Surface"),
            tint: { type: "boolean", description: "Element colour overrides this (uniforms, sails, banners)" },
            variants: {
              type: "array",
              maxItems: MODEL_LIMITS.maxVariants,
              items: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
            },
            nightGlow: { type: "boolean", description: "Glows only at night (windows, lanterns)" },
          },
          required: ["id", "color", "finish"],
        },
      },
      parts: {
        type: "array",
        minItems: 1,
        maxItems: MODEL_LIMITS.maxParts,
        items: {
          type: "object",
          properties: {
            id: slugS("Part id"),
            parent: {
              type: "string",
              description:
                "Parent part id, or empty string for a root. Child positions are LOCAL to this parent; root positions are absolute model coordinates.",
            },
            shape: en(SHAPES, "Primitive"),
            material: slugS("Material id"),
            size: v3(0, MODEL_LIMITS.maxDimension, "Metres; meaning depends on shape"),
            position: v3(-MODEL_LIMITS.maxOffset, MODEL_LIMITS.maxOffset, "Offset from parent origin (metres)"),
            rotation: v3(
              -720,
              720,
              "Rig rotation in Euler degrees XYZ; also rotates ALL children. Use geometryRotation to orient only the primitive.",
            ),
            geometryRotation: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: { type: "string", enum: ["-180", "-90", "0", "90", "180"] },
              description:
                "Only reorient a primitive's manufacturing axis, e.g. [0,0,90] makes a vertical capsule horizontal WITHOUT rotating children. Use [0,0,0] normally. Use rotation, NOT this field, for bent limbs, head poses and angled joints. Animation axes remain in the unrotated rig frame.",
            },
            animationAnchor: en(
              ANCHORS,
              "Preferred hinge: rotate about THIS primitive's named face center. Computed after geometryRotation and anchor, so top always means the actual top contact. Overrides numeric animationPivot. Use top for hanging limbs, center for wheels; omit for non-animated parts.",
            ),
            animationPivot: v3(
              -MODEL_LIMITS.maxOffset,
              MODEL_LIMITS.maxOffset,
              "Local joint point for rotation/scale animation, relative to this part origin. Does not move rest geometry. For a centered vertical limb, its top joint is [0, size.y/2, 0].",
            ),
            anchor: en(
              ANCHORS,
              "Which face of THIS part sits at its origin. Default center, including lathe. Top hangs down; bottom extends up.",
            ),
            attachTo: en(
              ["none", ...ANCHORS],
              "Connect THIS geometry to a face of the parent primitive. Position slides along that face; its normal-axis component is ignored to guarantee contact. Example: neck parent=torso, attachTo=top, anchor=bottom, position=[0,0,0]. Use none for roots, group parents, or deliberately separated parts. Use an actual face for physically connected anatomy; never bury a neck inside a torso.",
            ),
            beamWidth: {
              type: "number",
              description: "Truss beam thickness in metres; optional, defaults to 3.5% of base width.",
            },
            segments: { type: "integer", minimum: MODEL_LIMITS.minSegments, maximum: MODEL_LIMITS.maxSegments },
            // Some Gemini structured decoders loop on an unconstrained tiny
            // exponent here. Decimal strings bound that choice; normalization
            // converts them to the canonical numeric taper used by the compiler.
            taper: {
              type: "string",
              enum: ["0", "0.25", "0.5", "0.75", "1", "1.25", "1.5", "2"],
              description: "Cylinder top/bottom radius ratio: 1 = straight walls, 0 = cone. Parsed as a number.",
            },
            detail: { type: "integer", minimum: 0, maximum: 1 },
            profile: {
              type: "array",
              minItems: 3,
              maxItems: MODEL_LIMITS.maxProfilePoints,
              items: { type: "array", items: { type: "number", minimum: -1, maximum: 1 }, minItems: 2, maxItems: 2 },
              description: "extrusion: [x,y] in -1..1; lathe: [radius 0..1, height 0..1]",
            },
            mirror: en(AXES, "Also place a copy mirrored across this axis (z = left/right pair)"),
            repeat: {
              type: "object",
              properties: {
                mode: en(REPEAT_MODES, "linear row or radial ring"),
                count: { type: "integer", minimum: 2, maximum: MODEL_LIMITS.maxRepeat },
                step: v3(-MODEL_LIMITS.maxOffset, MODEL_LIMITS.maxOffset, "linear offset per copy"),
                rotateStep: v3(-720, 720, "linear rotation per copy"),
                radius: num(0, MODEL_LIMITS.maxDimension, "radial distance"),
                axis: en(AXES, "radial axis"),
                startAngle: num(-720, 720),
              },
              required: ["mode", "count"],
            },
            animation: {
              type: "array",
              maxItems: MODEL_LIMITS.maxChannelsPerPart,
              items: {
                type: "object",
                properties: {
                  property: en(CHANNEL_PROPERTIES, "What to animate"),
                  axis: en(AXES, "Local axis"),
                  wave: en(WAVES, "sine swing, spin (amplitude = deg/sec), pulse flicker, bounce hop"),
                  amplitude: num(-MODEL_LIMITS.maxSpinDegPerSec, MODEL_LIMITS.maxSpinDegPerSec, "deg | m | ratio"),
                  frequency: num(0, MODEL_LIMITS.maxFrequencyHz, "Hz"),
                  phase: num(-360, 360),
                  keyframes: {
                    type: "array",
                    minItems: 2,
                    maxItems: 8,
                    description:
                      "Optional one-shot motion across scene progress 0–1. Values -1–1 multiply amplitude; keys override wave/frequency/phase and hold their endpoints. Use for purposeful changes instead of repeated oscillation.",
                    items: {
                      type: "object",
                      properties: { at: num(0, 1), value: num(-1, 1) },
                      required: ["at", "value"],
                    },
                  },
                  interpolation: en(["linear", "smooth", "hold"], "Interpolation between keyframes; smooth by default"),
                  alternate: { type: "boolean", description: "mirrored/repeated copies offset by 180°" },
                  when: en(CHANNEL_WHEN, "moving = only while the element marches/sails/flies"),
                },
                required: ["property", "axis", "wave", "amplitude", "frequency"],
              },
            },
          },
          required: ["id", "parent", "shape", "size", "material", "position", "anchor", "attachTo"],
        },
      },
    },
    required: ["id", "name", "category", "placement", "materials", "parts"],
  };
}

/** Gemini responseJsonSchema for a set of models: { models: ModelDefinition[] }. */
export function geminiModelSetJsonSchema(maxModels: number = MODEL_LIMITS.maxModelsPerScript) {
  return {
    type: "object",
    properties: {
      models: {
        type: "array",
        minItems: 1,
        maxItems: Math.min(maxModels, MODEL_LIMITS.maxModelsPerScript),
        items: geminiModelDefinitionJsonSchema(),
      },
    },
    required: ["models"],
  };
}

// ---------------------------------------------------------------- skills
/**
 * Reusable modelling skills for the Gemini model-builder prompt. These teach
 * construction strategies, not specific objects; the model must invent each
 * definition from research about the actual event.
 */
export const MODELING_SKILLS = {
  core: `
You build low-poly 3D models as JSON for a deterministic Three.js compiler. Flat shading, chunky readable silhouettes,
5-30 parts, 2-8 materials. Units are metres. +y up, +x is the model's FRONT, +z its right side. Origin = ground
(or waterline) at the centre of the footprint, so most root parts use anchor "bottom" at y=0.
Shapes and size semantics:
${Object.entries(SHAPE_GUIDE)
  .map(([k, v]) => `  - ${k}: ${v}`)
  .join("\n")}
Rules:
  - Silhouette first: block the biggest masses, then 2-4 identifying details (era cues). Skip tiny details < 5 cm.
  - Distinguish geometryRotation (only orients this primitive) from rotation (rotates this part AND every child). Orient a horizontal cylinder/capsule torso with geometryRotation, keeping its frame upright for neck and legs. Use rotation for intentional rig poses.
  - Use parent/child parts for anything that moves together; children inherit parent transforms. Explicitly set parent on EVERY part: empty string means world-space root. A head positioned near [0, 0.3, 0] must name its torso as parent; without that parent it sits at ground level. Never mix local coordinates with an empty parent. Emit parents before children.
  - Every primitive, including lathe, is CENTERED unless anchor is explicit. Profile heights do not change this. For connected body parts use explicit attachTo: neck attaches to torso top with anchor bottom; head attaches to neck top with anchor bottom; a hanging limb attaches at its parent's bottom with anchor top. position then slides along that face; its perpendicular component is ignored so the surfaces meet. Do not add the full parent height. attachTo uses the parent primitive only, never descendants. For group parents use attachTo none and explicit local coordinates instead. Shoulder pivots must be at shoulder height: for a bottom-anchored torso, near size.y, not size.y/2. A top-anchored hanging limb hinges at local y=0; a centered limb hinges at size.y/2.
  - Use mirror:"z" for left/right pairs and repeat (linear/radial) for rows of columns, windows, oars, spokes, crenellations. A mirrored pair must have nonzero position on its mirrored axis, otherwise both copies overlap.
  - A linear repeat starts at position, not at its center. To center N copies around a point, compute the first position as center minus step*(N-1)/2 on each axis, and emit the resulting numeric coordinates. Check BOTH end copies against their supporting surface; never leave struts, windows or wheels floating beyond it.
  - Keep total expanded parts <= ${MODEL_LIMITS.maxExpandedNodes} and triangles <= ${MODEL_LIMITS.maxTriangles}; low segments (5-8) look best.
  - Materials: muted, historically plausible colours; mark faction-coloured materials tint:true so scenes can recolour them.
    finish "emissive" for flames/lamps, nightGlow for windows, "glass" for canopies/windows, "metal" for armour/guns.
  - Animation channels are optional, deterministic motion on a part's LOCAL axis. Use bounded keyframes [{at:0,value:0},{at:1,value:1}] for one-shot changes over normalized scene progress; values multiply amplitude and hold at endpoints. Choose linear, smooth or hold interpolation. Use waves for repeating actions. Keyframes override wave, frequency and phase; alternate reverses their sign in mirrored/repeated copies. Prefer animationAnchor to specify a hinge at a primitive face (top for a hanging limb, center for a wheel), computed after anchoring; this avoids coordinate arithmetic. animationPivot can alternatively specify a numeric local hinge point without moving the rest geometry; for a centered vertical limb use [0,size.y/2,0] to rotate at its top. Articulated movement needs at least two independently rotating limb joints (or a mirrored pair with alternate phase), never only a bobbing torso.
    Supported waves:
    walk cycles (rotation z on hip/shoulder pivots, when:"moving", alternate:true), spinning propellers/wheels
    (wave "spin", amplitude in deg/sec), waving flags (shape "flag"), bobbing (position y sine), flicker (scale pulse).
  - Never depict gore, injuries, weapons in use against people, hate symbols or real-person likeness caricatures.
`.trim(),
  articulatedFigures: `
Articulated figures (people, soldiers, workers): ~1.75 m tall. Build a rig:
  pelvis group at y≈0.95 → torso box/cylinder above it, head ico (d≈0.26) on a neck at y≈1.6, headwear on the head;
  hip pivots (group, mirror:"z", z≈0.1) with legs as boxes/capsules anchor "top" hanging to the ground;
  shoulder pivots (mirror:"z", z≈0.24, y≈1.45) with arms anchor "top". Walk cycle: forward is +x, so limbs swing
  with rotation about z on the hip/shoulder pivots (amplitude 25-35°, 1.6-2 Hz, alternate:true, when:"moving").
  Clothing/armour silhouettes carry the era: helmets, hats, capes (thin box behind torso), robes (tapered cylinder).
  Held items (spear, rifle, banner pole, tool) are children of the arm so they swing with it.
Quadrupeds (horses ~1.6 m at shoulder, oxen, camels, elephants ~3 m): body box/capsule, neck tilted forward, head,
  4 leg pivots (mirror:"z" + repeat linear 2 along x) with legs anchor "top", tail; gallop = leg rotation z, 2-3 Hz.
  Riders: a seated figure as a child of the body.
`.trim(),
  architecture: `
Architecture: massing → roof → openings → ornament. One storey ≈ 3 m, door ≈ 2 m × 1 m, wall thickness 0.3-1 m.
  Roof types: wedge (gable), cone with 4 segments (hip/pyramid), dome / lathe (onion, cupola), flat slab with parapet.
  Repeat windows/columns/crenellations with linear repeat; towers with cylinders (6-10 segments) and radial crenels.
  Materials reflect region and period (mud brick, limestone, marble, timber frame, red brick, concrete, steel+glass).
  Large monuments may be 20-80 m; scale relative to 1.75 m people. Fortifications: curtain walls + corner towers + gate.
`.trim(),
  vehicles: `
Vehicles & machines: chassis box → body/cabin → wheels (torus or cylinder rotated 90° about x, mirror:"z",
  repeat linear along x, rotation z spin when:"moving") → identifying details (funnel, turret, gun barrel, lamps).
  Carts/chariots get draught animals as separate models or child parts. Tanks: hull, track boxes, turret group.
  Trains: locomotive boiler (cylinder rotated 90° about z), cab, chimney (+ smoke part), cars via repeat linear.
Watercraft (placement "water"): hull shape (bow +x), deck structures, masts (thin cylinders), sails as thin boxes
  or extrusions (tint:true for faction sails), oars via repeat, funnels with smoke parts for steamships.
Aircraft (placement "air"): fuselage capsule/cylinder rotated 90° about z (nose +x), wings thin boxes or swept
  extrusions, tail fin + tailplane, propeller group spinning on x (wave "spin", ~1080 deg/s), canopy glass.
Spacecraft: lathe bodies with nose cones, fins via radial repeat, foil = metal gold; exhaust = fire part below.
`.trim(),
  nature: `
Nature & props: trees = trunk cylinder + stacked cones (conifers) or 2-4 ico clusters (broadleaf), palms = leaning
  segmented trunk + radial leaf boxes. Rocks/icebergs = ico with detail 0 scaled unevenly. Use material variants for
  natural colour spread. Effects: fire/smoke/explosion parts attached where they belong (chimney, campfire, crater).
  Flags/banners: pole cylinder + flag part (tint:true material) at the pole top.
`.trim(),
};

export const MODELING_SKILL_GUIDE = Object.values(MODELING_SKILLS).join("\n\n");
