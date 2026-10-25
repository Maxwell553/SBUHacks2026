/**
 * Set dressing: turns the script's own generated architecture and vegetation
 * into a coherent place around the action — a street or corridor lined on
 * both sides, a second row for depth, an optional facade closing the view
 * and a hazy skyline band — using GPU instancing. No named presets: only
 * models the event's script defines.
 */
import * as THREE from "three";
import type { Setting, Settlement, VideoScript } from "@/lib/schema/video";
import type { ModelLibrary } from "@/lib/lowpoly/compiler";
import { makeNoise2, makeRng, range, type Rng } from "@/lib/lowpoly/core";

export interface Circle {
  x: number;
  z: number;
  /** Packing radius (rows may touch). */
  r: number;
  h: number;
  /** Circumscribed radius reaching the footprint's corners (camera clearance). */
  rc?: number;
}

export interface Corridor {
  /** Street axis runs along z through x = cx. Camera side is +z. */
  cx: number;
  cz: number;
  halfWidth: number;
  front: number;
  back: number;
  /** A built street (paved ribbon, lined frontage). False for open land. */
  paved?: boolean;
  /** The corridor is a river/canal channel rather than a street. */
  water?: boolean;
  /** Quay or pavement width between the corridor edge and the frontage. */
  quay?: number;
}

export interface DressingSpec {
  lib: ModelLibrary;
  /** Models eligible as repeated scenery (see dressingModels). */
  modelIds: string[];
  /** Models acting as subjects in this shot (used sparingly as scenery). */
  subjectIds: Set<string>;
  /** Background models this shot asked for explicitly (preferred). */
  preferredIds: string[];
  setting: Setting;
  /** Density of the frontage: village is sparse, city is tall and continuous. */
  settlement?: Settlement;
  seed: number;
  night: boolean;
  corridor: Corridor;
  /** World z of a facade row that closes the street (camera-facing). */
  terminus?: number | null;
  keepOut: Circle[];
  heightAt(x: number, z: number): number;
  isWater(x: number, z: number): boolean;
}

export interface Dressing {
  group: THREE.Group;
  /** Footprints for camera collision, scatter avoidance and contact shadows. */
  footprints: Circle[];
  dispose(): void;
}

interface Candidate {
  id: string;
  depth: number;
  width: number;
  height: number;
  /** Footprint centre relative to the model origin (unscaled placement). */
  cx: number;
  cz: number;
  weight: number;
  variants: number;
}

const ARCHITECTURE = new Set(["building", "structure"]);
const NO_DRESSING = new Set<Setting>(["ocean", "orbit"]);
/** Largest footprint (m) that can be repeated as frontage (warehouses, mills). */
export const MAX_FRONTAGE_SIZE = 40;
/** Largest height (m) that can be repeated as frontage. */
export const MAX_FRONTAGE_HEIGHT = 45;

/**
 * Script models that may be repeated as scenery: architecture or vegetation
 * the director used as a multi-instance background, or buildings used in
 * multiples. One-off landmarks (a single fountain, a temple) and props such
 * as rubble are never cloned; when a script has no repeatable architecture,
 * modest buildings are the fallback.
 */
export function dressingModels(script: VideoScript, lib: ModelLibrary): string[] {
  const kind = (id: string) => lib.definition(id)?.category ?? "";
  const repeated = new Set<string>();
  for (const s of script.scenes)
    for (const e of s.elements)
      if (e.count >= 2 && (e.role === "background" || kind(e.model) === "building")) repeated.add(e.model);
  const fits = (id: string, limit: number) => {
    const b = lib.bounds(id);
    return Math.max(b.size.x, b.size.z) <= limit && b.height <= limit * (MAX_FRONTAGE_HEIGHT / MAX_FRONTAGE_SIZE);
  };
  const ids = script.models
    .filter((m) => m.instancePolicy !== "unique")
    .map((m) => m.id)
    .filter((id) => lib.has(id));
  const eligible = ids.filter(
    (id) => (ARCHITECTURE.has(kind(id)) || kind(id) === "nature") && repeated.has(id) && fits(id, MAX_FRONTAGE_SIZE),
  );
  if (eligible.some((id) => ARCHITECTURE.has(kind(id)))) return eligible;
  return [...eligible, ...ids.filter((id) => kind(id) === "building" && fits(id, 18) && !eligible.includes(id))];
}

/** Keep set dressing in the current historical phase instead of mixing every era. */
export function sceneDressingModels(
  scenes: readonly { elements: readonly { model: string }[] }[],
  index: number,
  eligible: readonly string[],
): string[] {
  const inScene = (i: number) => eligible.filter((id) => scenes[i]?.elements.some((e) => e.model === id));
  for (let i = index; i >= 0; i--) {
    const chosen = inScene(i);
    if (chosen.length) return chosen;
  }
  // An opening detail may precede the first authored establishing scene.
  for (let i = index + 1; i < scenes.length; i++) {
    const chosen = inScene(i);
    if (chosen.length) return chosen;
  }
  return [...eligible];
}

export function buildDressing(spec: DressingSpec): Dressing {
  const group = new THREE.Group();
  const footprints: Circle[] = [];
  const sets: { dispose(): void }[] = [];
  if (NO_DRESSING.has(spec.setting)) return { group, footprints, dispose() {} };
  const rng = makeRng(spec.seed * 7 + 101);
  const { lib, corridor: C } = spec;

  const toCandidate = (id: string): Candidate | null => {
    const def = lib.definition(id);
    if (!def) return null;
    const b = lib.bounds(id);
    const depth = Math.max(0.4, b.size.x),
      width = Math.max(0.4, b.size.z);
    if (Math.max(depth, width) < 1.2) return null;
    const preferred = spec.preferredIds.includes(id);
    const weight =
      (def.category === "building" ? 3 : 1.4) *
      (preferred ? 2 : spec.subjectIds.has(id) ? 0.5 : 1) *
      (b.height > 2.5 ? 1.4 : 0.6);
    return {
      id,
      depth,
      width,
      height: b.height,
      cx: b.center.x,
      cz: b.center.z,
      weight,
      variants: lib.variantCount(id),
    };
  };
  const scenery = spec.modelIds;
  const architecture = scenery
    .filter((id) => ARCHITECTURE.has(lib.definition(id)?.category ?? ""))
    .map(toCandidate)
    .filter((c): c is Candidate => !!c);
  const vegetation = scenery
    .filter((id) => lib.definition(id)?.category === "nature")
    .map(toCandidate)
    .filter((c): c is Candidate => !!c);

  const placements = new Map<string, { matrices: THREE.Matrix4[]; colors: THREE.Color[]; shadows: boolean }>();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const blocked = (x: number, z: number, r: number) =>
    spec.keepOut.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r) ||
    footprints.some((c) => Math.hypot(c.x - x, c.z - z) < (c.r + r) * 0.82);

  const groundMin = (x: number, z: number, hx: number, hz: number) =>
    Math.min(
      spec.heightAt(x, z),
      spec.heightAt(x - hx, z - hz),
      spec.heightAt(x + hx, z - hz),
      spec.heightAt(x - hx, z + hz),
      spec.heightAt(x + hx, z + hz),
    );

  const put = (
    c: Candidate,
    x: number,
    z: number,
    heading: number,
    s: number,
    shadows: boolean,
    record = true,
    sy = 1,
  ) => {
    const cos = Math.cos(heading),
      sin = Math.sin(heading);
    const across = Math.abs(sin) > 0.7;
    const hx = ((across ? c.width : c.depth) * s) / 2,
      hz = ((across ? c.depth : c.width) * s) / 2;
    const r = Math.hypot(hx, hz) * 0.8;
    if (spec.isWater(x, z) || spec.isWater(x - hx, z) || spec.isWater(x + hx, z) || blocked(x, z, r)) return false;
    const y = groundMin(x, z, hx, hz) - 0.04 * c.height * s;
    const variant = Math.floor(rng() * c.variants);
    const key = `${c.id}|${variant}|${shadows ? 1 : 0}`;
    let p = placements.get(key);
    if (!p) placements.set(key, (p = { matrices: [], colors: [], shadows }));
    // Place the footprint centre, not the model origin, at (x, z).
    const ox = (c.cx * cos + c.cz * sin) * s,
      oz = (-c.cx * sin + c.cz * cos) * s;
    m4.compose(new THREE.Vector3(x - ox, y, z - oz), q.setFromAxisAngle(up, heading), new THREE.Vector3(s, s * sy, s));
    p.matrices.push(m4.clone());
    p.colors.push(new THREE.Color(1, 1, 1).multiplyScalar(range(rng, 0.86, 1.08)));
    if (record) footprints.push({ x, z, r, h: c.height * s * sy, rc: Math.hypot(hx, hz) });
    return true;
  };

  const pick = (list: Candidate[], r: Rng) => {
    const total = list.reduce((a, c) => a + c.weight, 0);
    let k = r() * total;
    for (const c of list) if ((k -= c.weight) <= 0) return c;
    return list[list.length - 1];
  };

  const streetEnd = spec.terminus != null ? Math.max(C.cz - C.back, spec.terminus) : C.cz - C.back;

  /** Lines one side of the corridor from front (camera side) to back. */
  const lineSide = (list: Candidate[], side: -1 | 1, offset: number, density: number, sLo: number, sHi: number) => {
    let z = C.cz + C.front;
    let guard = 0;
    while (z > streetEnd && guard++ < 400) {
      const c = pick(list, rng);
      const s = range(rng, sLo, sHi);
      const width = c.width * s;
      const cz = z - width / 2;
      if (rng() < density) {
        const setback = range(rng, 0.15, 1.1);
        const x = C.cx + side * (C.halfWidth + (C.quay ?? 0) + offset + (c.depth * s) / 2 + setback);
        // Fronts (+x) face the street: left side looks +x, right side looks -x.
        // A little height variation breaks up the roofline.
        put(c, x, cz, side < 0 ? 0 : Math.PI, s, true, true, range(rng, 0.92, 1.2));
      }
      z -= width + (rng() < 0.12 ? range(rng, 3, 7) : range(rng, 0.2, 1.6));
    }
  };

  /** A camera-facing facade row across the street at world z. */
  const closeStreet = (list: Candidate[], zAt: number) => {
    const reach = C.halfWidth * 2 + 30;
    let x = C.cx - reach;
    let guard = 0;
    while (x < C.cx + reach && guard++ < 200) {
      const c = pick(list, rng);
      const s = range(rng, 0.95, 1.15);
      const w = c.width * s;
      // Heading -90° turns the model's front (+x) toward the camera (+z).
      put(c, x + w / 2, zAt - (c.depth * s) / 2, -Math.PI / 2, s, true);
      x += w + range(rng, 0.2, 1.2);
    }
  };

  if (architecture.length && C.paved === false && !C.water) {
    // Open land: no road to line, so the buildings form loose clusters.
    const houses = architecture.filter((c) => lib.definition(c.id)?.category === "building");
    if (houses.length) organicSettlement(houses);
    if (vegetation.length) naturalLayout(vegetation);
  } else if (architecture.length) {
    const deepest = Math.max(...architecture.map((c) => c.depth));
    const level = spec.settlement ?? "town";
    // Village: one sparse, gappy row. Town: two rows. City: a taller second row.
    const front = level === "village" ? 0.55 : 0.94;
    lineSide(architecture, -1, 0, front, 0.92, 1.12);
    lineSide(architecture, 1, 0, front, 0.92, 1.12);
    if (level !== "village") {
      const [lo, hi] = level === "city" ? [1.1, 1.55] : [1.0, 1.35];
      lineSide(architecture, -1, deepest * 1.15 + 3, level === "city" ? 0.85 : 0.72, lo, hi);
      lineSide(architecture, 1, deepest * 1.15 + 3, level === "city" ? 0.85 : 0.72, lo, hi);
    }
    if (spec.terminus != null) closeStreet(architecture, spec.terminus);
    // Hazy skyline band beyond the end of the street.
    const skyline = level === "village" ? 0 : level === "city" ? 48 : 34;
    for (let i = 0; i < skyline; i++) {
      const c = pick(architecture, rng);
      const x = C.cx + range(rng, -1, 1) * Math.max(120, C.back * 1.4);
      const z = C.cz - C.back - range(rng, 15, 160);
      put(c, x, z, rng() * Math.PI * 2, range(rng, 1.2, 2.3), false, false);
    }
    if (vegetation.length) {
      // Occasional greenery tucked against the frontage.
      for (let i = 0; i < 10; i++) {
        const c = pick(vegetation, rng);
        const side = rng() < 0.5 ? -1 : 1;
        put(
          c,
          C.cx + side * (C.halfWidth + (C.quay ?? 0) - 0.4),
          C.cz + range(rng, -C.back * 0.7, C.front * 0.6),
          rng() * 6,
          range(rng, 0.8, 1.1),
          true,
        );
      }
    }
  } else if (vegetation.length) {
    naturalLayout(vegetation);
  }

  /**
   * A settlement on open land: buildings gather in a few loose clusters
   * around the action, fronts turned roughly toward it, spaced by their real
   * footprints and thinning with distance. The view to the subject stays open.
   */
  function organicSettlement(list: Candidate[]) {
    const level = spec.settlement ?? "village";
    const total = level === "city" ? 40 : level === "town" ? 24 : level === "village" ? 11 : 0;
    if (!total) return;
    const largest = Math.max(...list.map((c) => Math.max(c.depth, c.width)));
    const inView = (x: number, z: number, r: number) =>
      Math.abs(x - C.cx) < C.halfWidth + r + 2 && z > C.cz - 10 - r && z < C.cz + C.front;
    // Cluster centres on a ring beyond the action, behind and to the sides.
    const clusters = Array.from({ length: level === "village" ? 3 : 5 }, () => {
      const a = range(rng, Math.PI * 0.95, Math.PI * 2.05);
      const r = range(rng, C.halfWidth + largest * 1.2, C.halfWidth + largest * 4 + 30);
      return { x: C.cx + Math.cos(a) * r, z: C.cz + Math.sin(a) * r };
    });
    for (let i = 0, tries = 0; i < total && tries < total * 16; tries++) {
      const k = clusters[Math.floor(rng() * clusters.length)];
      const spread = largest * (level === "village" ? 1.6 : 2.4);
      const x = k.x + range(rng, -spread, spread),
        z = k.z + range(rng, -spread, spread);
      const c = pick(list, rng);
      const s = range(rng, 0.9, level === "city" ? 1.3 : 1.12);
      const r = (Math.max(c.depth, c.width) * s) / 2;
      // Never on the camera's side of the action.
      if (z + r > C.cz + C.halfWidth || inView(x, z, r)) continue;
      // Front (+x) toward the action, with a little irregularity.
      const heading = Math.atan2(-(C.cz - z), C.cx - x) + range(rng, -0.45, 0.45);
      if (put(c, x, z, heading, s, true, true, range(rng, 0.92, 1.15))) i++;
    }
  }

  /**
   * Natural scenery is never lined up: irregular clusters with random yaw,
   * upright growth (trees, rocks) nearer and low, wide landforms pushed far
   * out and scaled up with distance, keeping the view to the subject open.
   */
  function naturalLayout(list: Candidate[]) {
    const dense = spec.setting === "forest" || spec.setting === "jungle";
    const noise = makeNoise2(spec.seed + 17);
    const upright = list.filter((c) => c.height >= 0.6 * Math.max(c.depth, c.width));
    const landforms = list.filter((c) => !upright.includes(c));
    const inView = (x: number, z: number, r: number) =>
      Math.abs(x - C.cx) < C.halfWidth + r + 1.5 && z > C.cz - 8 - r && z < C.cz + C.front;
    const place = (set: Candidate[], n: number, rMin: number, rMax: number, sLo: number, sHi: number, grow: number) => {
      for (let i = 0, tries = 0; i < n && tries < n * 14; tries++) {
        const a = rng() * Math.PI * 2;
        const r = rMin + (rMax - rMin) * Math.pow(rng(), 0.8);
        const x = C.cx + Math.cos(a) * r,
          z = C.cz + Math.sin(a) * r;
        // Thin out between clusters.
        if (noise(x * 0.025, z * 0.025, 2) < -0.1 && rng() > 0.2) continue;
        const c = pick(set, rng);
        const s = range(rng, sLo, sHi) * (1 + (grow * (r - rMin)) / (rMax - rMin));
        if (inView(x, z, (Math.max(c.depth, c.width) * s) / 2)) continue;
        if (put(c, x, z, rng() * Math.PI * 2, s, r < 90, true, range(rng, 0.85, 1.15))) i++;
      }
    };
    if (upright.length) place(upright, dense ? 90 : 24, C.halfWidth + 2, dense ? 110 : 150, 0.8, 1.2, 0.3);
    if (landforms.length) place(landforms, dense ? 16 : 10, Math.max(22, C.halfWidth * 3), 210, 1.0, 1.3, 1.3);
  }

  for (const [key, p] of placements) {
    const [id, variant] = key.split("|");
    if (!p.matrices.length) continue;
    const set = lib.instancedSet(id, p.matrices, {
      variant: Number(variant),
      night: spec.night,
      colors: p.colors,
      shadows: p.shadows,
    });
    if (!set) continue;
    group.add(set.object);
    sets.push(set);
  }

  return {
    group,
    footprints,
    dispose() {
      sets.forEach((s) => s.dispose());
    },
  };
}
