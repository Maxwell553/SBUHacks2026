/**
 * PolyEngine — deterministic renderer for a VideoScript.
 *
 * renderAt(t) is a pure function of (script, t): scenes are built lazily from
 * the script's ModelDefinitions (via the generic compiler) and procedural
 * environments, then composited with the 2D overlay. The same engine drives
 * the live player and the offscreen GIF exporter.
 */
import * as THREE from "three";
import type { Formation, Position, Scene, SceneElement, Settlement, VideoScript } from "@/lib/schema/video";
import type { Placement } from "@/lib/schema/model";
import { attachEnvironmentalFire } from "@/lib/lowpoly/scene-effects";
import { makeShot } from "@/lib/lowpoly/camera";
import { framingBounds, groundPlacement, ModelLibrary, type ModelInstance } from "@/lib/lowpoly/compiler";
import { clamp, easeInOut, lerp, makeRng, range, smooth, type Rng } from "@/lib/lowpoly/core";
import { type Effect, makeExplosion, makeFire, makeSmoke } from "@/lib/lowpoly/effects";
import { buildEnvironment, type Environment } from "@/lib/lowpoly/environment";
import { buildGlobe, latLonToVec3 } from "@/lib/lowpoly/globe";
import { drawOverlay, loadFonts, type OverlayLabel } from "@/lib/lowpoly/overlay";
import { buildScatter } from "@/lib/lowpoly/scatter";
import { contactShadowTexture, glowTexture } from "@/lib/lowpoly/textures";
import { buildDressing, dressingModels, sceneDressingModels, type Circle, type Corridor } from "@/lib/lowpoly/world";

export interface EngineOptions {
  width: number;
  height: number;
  pixelRatio?: number;
  shadows?: boolean;
  canvas?: HTMLCanvasElement;
}

interface BuiltScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  portrait: boolean;
  update(local: number): void;
  labels(): OverlayLabel[];
  pin?(): { x: number; y: number; visible: boolean; label: string };
  flash(local: number): number;
  dispose(): void;
}

const POS: Record<Position, [number, number]> = {
  center: [0, 0],
  left: [-1, 0],
  right: [1, 0],
  front: [0, 0.7],
  back: [0, -0.85],
  front_left: [-0.8, 0.55],
  front_right: [0.8, 0.55],
  back_left: [-0.8, -0.75],
  back_right: [0.8, -0.75],
};
const SPEED: Partial<Record<SceneElement["motion"], number>> = {
  march: 1.2,
  charge: 3.4,
  retreat: -1.6,
  sail: 1.3,
  fly: 8,
};
const MOVING = new Set(["march", "charge", "retreat", "sail", "fly", "launch"]);

function formationOffsets(f: Formation, n: number, sp: number, rng: Rng): [number, number][] {
  const out: [number, number][] = [];
  switch (f) {
    case "single":
      for (let i = 0; i < n; i++) out.push([0, (i - (n - 1) / 2) * sp]);
      break;
    case "line": {
      const per = Math.min(n, 16);
      for (let i = 0; i < n; i++)
        out.push([
          -Math.floor(i / per) * sp,
          ((i % per) - (Math.min(per, n - Math.floor(i / per) * per) - 1) / 2) * sp,
        ]);
      break;
    }
    case "column": {
      const w = n > 10 ? 2 : 1;
      for (let i = 0; i < n; i++)
        out.push([-Math.floor(i / w) * sp + (n / w) * sp * 0.5, ((i % w) - (w - 1) / 2) * sp]);
      break;
    }
    case "block": {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
      const rows = Math.ceil(n / cols);
      for (let i = 0; i < n; i++)
        out.push([((rows - 1) / 2 - Math.floor(i / cols)) * sp, ((i % cols) - (cols - 1) / 2) * sp]);
      break;
    }
    case "wedge": {
      let i = 0;
      for (let row = 0; i < n; row++)
        for (let k = 0; k <= row && i < n; k++, i++) out.push([-row * sp * 0.9, (k - row / 2) * sp]);
      break;
    }
    case "ring": {
      const r = Math.max(sp, (sp * n) / (Math.PI * 2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      break;
    }
    default: {
      const r = Math.sqrt(n) * sp * 0.85 + sp * 0.5;
      for (let i = 0; i < n; i++) {
        let best: [number, number] = [0, 0];
        let bestD = -1;
        for (let k = 0; k < 8; k++) {
          const a = rng() * Math.PI * 2,
            d = Math.sqrt(rng()) * r;
          const c: [number, number] = [Math.cos(a) * d, Math.sin(a) * d];
          const nearest = out.reduce((m, p) => Math.min(m, Math.hypot(p[0] - c[0], p[1] - c[1])), Infinity);
          if (nearest > bestD) {
            bestD = nearest;
            best = c;
          }
        }
        out.push(best);
      }
    }
  }
  return out;
}

function headingFor(e: SceneElement, px: number, pz: number): number {
  const toward = (dx: number, dz: number) => Math.atan2(-dz, dx);
  switch (e.facing) {
    case "left":
      return Math.PI;
    case "right":
      return 0;
    case "camera":
      return toward(0, 1);
    case "away":
      return toward(0, -1);
    default:
      if (Math.abs(px) < 0.05 && Math.abs(pz) < 0.05)
        return e.motion === "sail" || e.motion === "fly" ? 0 : toward(0.3, 1);
      return toward(-px, -pz);
  }
}

interface Unit {
  group: THREE.Group;
  inst: ModelInstance;
  element: number;
  base: THREE.Vector3;
  fwd: THREE.Vector3;
  speed: number;
  motion: SceneElement["motion"];
  placement: Placement;
  phase: number;
  height: number;
  radius: number;
  framing: { offset: THREE.Vector3; radius: number };
  /** Vertical correction so the model's lowest point meets the ground. */
  lift: number;
  /** Ground roll then climb-out for aircraft with a launch motion. */
  takeoff: { travel: number; climb: number } | null;
  /** World-axis footprint extents at the unit's heading. */
  span: { x: number; z: number };
  /** The room shell of an interior shot (the set, not an actor). */
  shell: boolean;
  /** Stands in the water (a span or pier) instead of floating on it. */
  fixed: boolean;
  extras: Effect[];
}

/** Figures outside this height range (m) are treated as mis-scaled. */
const FIGURE_HEIGHT: [number, number] = [1.0, 2.4];
const FIGURE_NORMAL = 1.72;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

interface FilmWaterway {
  /** Longest water-placed span (bridge, weir, lock), m. */
  span: number;
  /** Longest watercraft, m. */
  craft: number;
}

/**
 * One channel for the whole film, sized from its own water-placed models so
 * consecutive shots of the same waterfront match: spans rest on the banks,
 * vessels have room to sail.
 */
function filmWaterway(script: VideoScript, lib: ModelLibrary): FilmWaterway {
  let span = 0,
    craft = 0;
  for (const s of script.scenes)
    for (const e of s.elements) {
      const def = lib.definition(e.model);
      if (def?.placement !== "water") continue;
      const b = lib.bounds(e.model);
      const long = Math.max(b.size.x, b.size.z) * (e.scale ?? 1);
      if (def.category === "building" || def.category === "structure") span = Math.max(span, long);
      else craft = Math.max(craft, long);
    }
  return { span, craft };
}

export class PolyEngine {
  readonly script: VideoScript;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: THREE.WebGLRenderer;
  private library: ModelLibrary;
  private sceneryIds: string[] | null = null;
  private waterway: FilmWaterway | null = null;
  private built = new Map<number, BuiltScene>();
  private starts: number[] = [];
  private width: number;
  private height: number;
  private pixelRatio: number;

  static loadFonts = loadFonts;

  constructor(script: VideoScript, opts: EngineOptions) {
    this.script = script;
    this.width = opts.width;
    this.height = opts.height;
    this.pixelRatio = opts.pixelRatio ?? 1;
    let acc = 0;
    for (const s of script.scenes) {
      this.starts.push(acc);
      acc += s.duration;
    }
    const glCanvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas: glCanvas,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = opts.shadows !== false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = opts.canvas ?? document.createElement("canvas");
    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: !opts.canvas })!;
    this.library = new ModelLibrary(script.models);
  }

  get duration() {
    return this.script.totalDuration;
  }

  get boundaries() {
    return this.starts.slice(1);
  }

  sceneAt(t: number) {
    const tt = clamp(t, 0, this.duration - 1e-4);
    let i = this.starts.length - 1;
    while (i > 0 && this.starts[i] > tt) i--;
    return { index: i, local: tt - this.starts[i], time: tt };
  }

  setSize(width: number, height: number, pixelRatio = this.pixelRatio) {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    for (const [k, b] of this.built) {
      // Shots are composed per orientation; rebuild when it flips.
      if (b.portrait !== height > width) {
        b.dispose();
        this.built.delete(k);
        continue;
      }
      b.camera.aspect = width / height;
      b.camera.updateProjectionMatrix();
    }
  }

  /** Pre-builds a scene (e.g. while the previous one is playing). */
  prepare(index: number) {
    if (index >= 0 && index < this.script.scenes.length) this.get(index);
  }

  renderAt(t: number) {
    const { index, local, time } = this.sceneAt(t);
    const b = this.get(index);
    for (const [k, v] of this.built) {
      if (k !== index && k !== index + 1) {
        v.dispose();
        this.built.delete(k);
      }
    }
    b.update(local);
    this.renderer.render(b.scene, b.camera);
    const cw = this.canvas.width,
      ch = this.canvas.height;
    this.ctx.drawImage(this.renderer.domElement, 0, 0, cw, ch);
    drawOverlay(this.ctx, {
      script: this.script,
      scene: this.script.scenes[index],
      index,
      local,
      time,
      width: cw,
      height: ch,
      labels: b.labels(),
      pin: b.pin?.(),
      flash: b.flash(local),
      boundaries: this.boundaries,
    });
  }

  dispose() {
    for (const b of this.built.values()) b.dispose();
    this.built.clear();
    this.library.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // -------------------------------------------------------------- scenes
  private get(index: number): BuiltScene {
    let b = this.built.get(index);
    if (!b) {
      const sc = this.script.scenes[index];
      b = sc.kind === "map" && sc.map ? this.buildMap(sc, index) : this.buildDiorama(sc, index);
      this.built.set(index, b);
    }
    return b;
  }

  private project(v: THREE.Vector3, camera: THREE.Camera) {
    const p = v.clone().project(camera);
    return {
      x: ((p.x + 1) / 2) * this.canvas.width,
      y: ((1 - p.y) / 2) * this.canvas.height,
      visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1,
    };
  }

  private buildDiorama(sc: Scene, index: number): BuiltScene {
    sc = attachEnvironmentalFire(sc, this.script.models);
    const immersive = this.script.presentation === "immersive";
    const seed = (this.script.seed + (immersive ? 0 : index * 7919)) >>> 0;
    const rng = makeRng(seed);
    const ownsLibrary = sc.structureState === "ruined";
    const lib = ownsLibrary ? new ModelLibrary(this.script.models, undefined, true) : this.library;
    const portrait = this.height > this.width;
    const orbit = sc.setting === "orbit";
    const needsWater = sc.elements.some((e) => lib.definition(e.model)?.placement === "water");
    const isSubject = (e: SceneElement) => !e.role || e.role === "subject";
    const scaleOf = (e: SceneElement) => {
      const def = lib.definition(e.model);
      let k = 1;
      if (def?.category === "figure") {
        const h = lib.bounds(e.model).height;
        if (h < FIGURE_HEIGHT[0] || h > FIGURE_HEIGHT[1]) k = FIGURE_NORMAL / h;
      }
      return k * (e.scale ?? 1);
    };

    // Layout uses the generated subjects' dimensions, so tools and small
    // inventions are not spaced like armies or buildings.
    const layoutRadius = Math.max(
      0.15,
      ...sc.elements.filter(isSubject).map((e) => (lib.has(e.model) ? lib.bounds(e.model).radius * scaleOf(e) : 0)),
    );
    const region = Math.max(0.4, layoutRadius * 2.4);

    // Interior layout: the largest generated room shell (floor plus walls on
    // at least two sides) is the set. It stands at its offset (or the origin)
    // turned so an open side faces the camera, and everything else is kept
    // inside its measured walls.
    const layout = sc.layout;
    let room: {
      e: SceneElement;
      x: number;
      z: number;
      heading: number;
      s: number;
      rect: { minX: number; maxX: number; minZ: number; maxZ: number };
      top: number;
      floor: number;
    } | null = null;
    if (layout === "interior" && !orbit) {
      let best = 0;
      for (const e of sc.elements) {
        const c = lib.definition(e.model)?.category;
        if (c !== "building" && c !== "structure") continue;
        const b = lib.interior(e.model);
        if (!b || Object.values(b.open).filter((o) => !o).length < 2) continue;
        const s = e.scale ?? 1;
        const area = (b.maxX - b.minX) * (b.maxZ - b.minZ) * s * s;
        if (area <= best) continue;
        best = area;
        const heading = e.facing
          ? headingFor(e, 0, 0)
          : b.open.maxX
            ? -Math.PI / 2
            : b.open.maxZ
              ? 0
              : b.open.minX
                ? Math.PI / 2
                : Math.PI;
        const x = e.offset?.x ?? 0,
          z = e.offset?.z ?? 0;
        const cos = Math.cos(heading),
          sin = Math.sin(heading);
        const xs: number[] = [],
          zs: number[] = [];
        for (const [lx, lz] of [
          [b.minX, b.minZ],
          [b.maxX, b.minZ],
          [b.minX, b.maxZ],
          [b.maxX, b.maxZ],
        ]) {
          xs.push(x + (lx * cos + lz * sin) * s);
          zs.push(z + (-lx * sin + lz * cos) * s);
        }
        room = {
          e,
          x,
          z,
          heading,
          s,
          rect: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
          top: b.height * s,
          floor: b.floor * s,
        };
      }
    }
    const insideRoom = (x: number, z: number, r: number): [number, number] => {
      if (!room) return [x, z];
      const R = room.rect;
      const fit = (v: number, lo: number, hi: number) =>
        hi - lo < 2 * r + 0.6 ? (lo + hi) / 2 : clamp(v, lo + r + 0.3, hi - r - 0.3);
      return [fit(x, R.minX, R.maxX), fit(z, R.minZ, R.maxZ)];
    };
    const anchorOf = (e: SceneElement): [number, number] => {
      if (room && e === room.e) return [room.x, room.z];
      const [px, pz] = POS[e.position];
      const radius = lib.has(e.model) ? lib.bounds(e.model).radius * scaleOf(e) : 0;
      const layer = e.role === "background" ? 2.5 : 1;
      const at: [number, number] = [
        e.offset?.x ?? px * region * layer,
        e.offset?.z ?? (e.role === "background" ? -region * 2.2 - radius + pz * region : pz * region),
      ];
      return room ? insideRoom(at[0], at[1], radius) : at;
    };

    // Immersive films are one connected place: background architecture the
    // director repeats becomes street frontage instead of loose props. An
    // explicit open layout keeps authored buildings where they were placed.
    this.sceneryIds ??= dressingModels(this.script, lib);
    const scenery = sceneDressingModels(this.script.scenes, index, this.sceneryIds);
    const dressable = immersive && !orbit && sc.setting !== "ocean" && layout !== "interior";

    // How built-up the place is: authored, or inferred from how many real
    // buildings (footprint >= 2 m) of the repeatable scenery this shot uses.
    let buildingCount = 0,
      buildingHeight = 0;
    for (const e of sc.elements) {
      if (!scenery.includes(e.model) || lib.definition(e.model)?.category !== "building") continue;
      const b = lib.bounds(e.model);
      if (Math.max(b.size.x, b.size.z) * scaleOf(e) < 2) continue;
      buildingCount += e.count;
      buildingHeight = Math.max(buildingHeight, b.height * scaleOf(e));
    }
    const settlement: Settlement =
      sc.settlement ??
      (sc.setting === "city" || (buildingCount >= 6 && buildingHeight >= 7)
        ? "city"
        : buildingCount >= 2
          ? "town"
          : buildingCount >= 1
            ? "village"
            : "wild");
    const built = settlement === "town" || settlement === "city";
    // A river or canal runs along the view axis when something spans it or a
    // town lines it; otherwise the legacy natural river crosses the view.
    this.waterway ??= filmWaterway(this.script, lib);
    const waterScene =
      dressable && (sc.setting === "river" || (needsWater && sc.setting !== "coast" && sc.setting !== "ocean"));
    const channel =
      waterScene && (this.waterway.span > 0 || built || sc.waterWidth != null || sc.banks != null)
        ? {
            width: sc.waterWidth ?? clamp(Math.max(12, this.waterway.span * 0.62, this.waterway.craft * 1.6), 4, 300),
            banks: sc.banks ?? (settlement === "city" ? "embankment" : "natural"),
          }
        : null;
    const isFrontage = (e: SceneElement) =>
      dressable &&
      e.role === "background" &&
      e.count >= 2 &&
      scenery.includes(e.model) &&
      // Open land absorbs buildings (not structures or props) into a loose
      // settlement, or any architecture into a waterfront, unless the
      // director called the place wild.
      (layout !== "open" ||
        lib.definition(e.model)?.category === "nature" ||
        (settlement !== "wild" && (!!channel || lib.definition(e.model)?.category === "building")));
    const frontage = sc.elements.filter(isFrontage);
    const anchored = sc.elements.filter((e) => lib.has(e.model) && !isFrontage(e));
    const subjectEls = anchored.filter(isSubject);
    const core = subjectEls.length ? subjectEls : anchored;
    const focus0 = { x: 0, z: 0 };
    if (core.length) {
      for (const e of core) {
        const [x, z] = anchorOf(e);
        focus0.x += x / core.length;
        focus0.z += z / core.length;
      }
    }
    // Street width must clear the people, vehicles and props that act in it;
    // architecture subjects become part of the frontage instead.
    const archModel = (id: string) => {
      const c = lib.definition(id)?.category;
      return c === "building" || c === "structure";
    };
    const architectural = (e: SceneElement) => archModel(e.model);
    const actors = core.filter((e) => !architectural(e));
    // The street runs through the actors; with none, between architecture the
    // director placed on opposite sides (offsets are not size-aware).
    let streetX = layout === "street" && !actors.length ? 0 : focus0.x;
    if (actors.length) streetX = actors.reduce((a, e) => a + anchorOf(e)[0], 0) / actors.length;
    else {
      const xs = sc.elements
        .filter((e) => e.offset && lib.has(e.model) && architectural(e) && (isFrontage(e) || isSubject(e)))
        .map((e) => e.offset!.x);
      const left = xs.filter((x) => x < -1),
        right = xs.filter((x) => x > 1);
      if (left.length && right.length) streetX = (Math.max(...left) + Math.min(...right)) / 2;
    }
    const reach = Math.max(
      0.3,
      ...actors.map((e) => {
        const [x, z] = anchorOf(e);
        const r = lib.bounds(e.model).radius * scaleOf(e);
        return Math.hypot(x - streetX, z - focus0.z) + r * Math.max(1, Math.sqrt(e.count) * 1.1);
      }),
    );
    let corridor: Corridor | null = null;
    let terminus: number | null = null;
    if (dressable) {
      const sides: number[] = [];
      for (const e of frontage) {
        if (!e.offset) continue;
        const dx = Math.abs(e.offset.x - streetX);
        const depth = lib.bounds(e.model).size.x * scaleOf(e);
        if (dx >= 2.5) sides.push(dx - depth / 2);
        else if (e.offset.z < focus0.z - reach - 1) {
          const front = e.offset.z + (lib.bounds(e.model).size.x * scaleOf(e)) / 2;
          terminus = Math.max(terminus ?? -Infinity, Math.min(front, focus0.z - reach - 1));
        }
      }
      const minW = reach + 0.6;
      corridor = {
        cx: streetX,
        cz: focus0.z,
        halfWidth: clamp(sides.length ? Math.max(median(sides), minW) : Math.max(minW + 1, 3), 2.6, 28),
        front: clamp(layoutRadius * 10 + 30, 30, 110),
        back: 150,
        // Only a place with buildings gets a road; open land stays natural.
        paved: layout === "street" || (layout !== "open" && (sc.setting === "city" || scenery.some(archModel))),
      };
      if (channel) {
        // The corridor is the channel itself, centred on whatever floats or
        // spans it; quays (or banks) separate the water from the frontage.
        const afloat = sc.elements.filter((e) => lib.definition(e.model)?.placement === "water");
        const waterX = afloat.length ? anchorOf(afloat[0])[0] : focus0.x;
        corridor = {
          cx: waterX,
          cz: focus0.z,
          halfWidth: channel.width / 2,
          front: clamp(layoutRadius * 10 + 30, 30, 110),
          back: 150,
          paved: built,
          water: true,
          quay: channel.banks === "embankment" ? 6 : 2.5,
        };
        terminus = null;
      }
    }

    const roomSpan = room ? Math.hypot(room.rect.maxX - room.rect.minX, room.rect.maxZ - room.rect.minZ) / 2 : 0;
    // A vessel's coast shot looks out to sea, with the shoreline behind it.
    // Seen across the land, any hull reads as beached.
    const lead = sc.elements.find((e) => e.role === "subject") ?? sc.elements[0];
    const leadDef = lead ? lib.definition(lead.model) : undefined;
    const offshore =
      lead && leadDef?.placement === "water" && !architectural(lead) && !channel && !room
        ? Math.max(10, (Math.max(lib.bounds(lead.model).size.x, lib.bounds(lead.model).size.z) * scaleOf(lead)) / 2 + 6)
        : null;
    const env: Environment = buildEnvironment(sc, seed, {
      offshore,
      forceWater: needsWater,
      focus: room ? { x: room.x, z: room.z } : focus0,
      // A room levels the ground under it but gets no road.
      corridor: room ? { cx: room.x, cz: room.z, halfWidth: roomSpan, front: 0, back: 0, paved: false } : corridor,
      interior: !!room,
      settlement: room ? undefined : settlement,
      waterway:
        channel && corridor
          ? {
              cx: corridor.cx,
              halfWidth: corridor.halfWidth,
              banks: channel.banks,
              quay: corridor.quay ?? 0,
              bankHeight: channel.banks === "embankment" ? 1.6 : 0.7,
            }
          : null,
    });
    const scene = new THREE.Scene();
    scene.add(env.group);
    scene.fog = env.fog;
    scene.background = env.background;
    const camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.3, 1400);
    const night = env.night;
    // A soft camera fill keeps the educational subject legible even at night.
    const fill = new THREE.DirectionalLight(
      "#fff4df",
      room ? 0.75 : immersive ? (night ? 0.7 : 0.5) : night ? 0.85 : 1.1,
    );
    scene.add(fill, fill.target);
    // Inside a room, actors stand on its floor slab rather than the terrain.
    const floorAt = (x: number, z: number) => {
      const h = env.heightAt(x, z);
      if (!room) return h;
      const R = room.rect;
      return x > R.minX && x < R.maxX && z > R.minZ && z < R.maxZ ? h + room.floor : h;
    };
    const groundY = (x: number, z: number, r: number) => {
      const h = floorAt(x, z);
      if (r < 0.5) return h;
      const k = r * 0.6;
      // Clear the terrain beneath broad objects, including footprints that
      // cross a shoreline. The lowest sample would bury them in nearby land.
      return Math.max(h, floorAt(x + k, z), floorAt(x - k, z), floorAt(x, z + k), floorAt(x, z - k));
    };

    // Search across the water: along x for a channel down the view axis,
    // along z for the legacy shore and river bands.
    const across = channel ? ([1, 0] as const) : ([0, 1] as const);
    // Float the whole hull (half its extent across the water), not just its
    // centre; a hull on the shoreline reads as beached. Water too narrow for
    // that falls back to the nearest open water.
    const findWater = (x: number, z: number, half = 2) => {
      const afloat = (px: number, pz: number, k: number) =>
        env.isWater(px, pz) &&
        env.isWater(px + across[0] * k, pz + across[1] * k) &&
        env.isWater(px - across[0] * k, pz - across[1] * k);
      for (const k of half > 2 ? [half, 2] : [2]) {
        if (afloat(x, z, k)) return [x, z];
        for (let i = 1; i < 60; i++)
          for (const d of [-i * 1.5, i * 1.5]) {
            const px = x + across[0] * d,
              pz = z + across[1] * d;
            if (afloat(px, pz, k)) return [px, pz];
          }
      }
      return [x, z];
    };
    const findLand = (x: number, z: number, r = 0) => {
      if (!env.isWater(x, z)) return [x, z];
      for (let k = 1; k < 60; k++)
        for (const d of [k * 1.5, -k * 1.5]) {
          const px = x + across[0] * d,
            pz = z + across[1] * d;
          // Step clear of the bank edge by the object's own size.
          const step = Math.sign(d) * (1.5 + (channel ? r : 0));
          if (!env.isWater(px, pz)) return [px + across[0] * step, pz + across[1] * step];
        }
      return [x, z];
    };

    const units: Unit[] = [];
    let fires = 0,
      blasts = 0,
      plumes = 0;
    sc.elements.forEach((e, ei) => {
      const def = lib.definition(e.model);
      if (!def || isFrontage(e)) return;
      const b = lib.bounds(e.model);
      const s = scaleOf(e);
      const radius = b.radius * s;
      const grounded = groundPlacement(b, s);
      const height = def.placement === "ground" ? grounded.height : b.height * s;
      const footprint = Math.max(b.size.x, b.size.z) * s;
      const spacing = Math.max(0.05, architectural(e) ? footprint * 1.06 : radius * 2 * 1.1);
      // Aircraft that are not flying rest on the ground; a launch is a
      // take-off roll and climb-out rather than a vertical rise.
      const takeoff = !orbit && def.placement === "air" && e.motion === "launch";
      let placement: Placement = orbit ? "air" : def.placement;
      if (placement === "air" && !orbit && (takeoff || (e.motion !== "fly" && def.category !== "animal")))
        placement = "ground";
      const airMover = placement === "air" || takeoff;
      const [px, pz] = POS[e.position];
      const anchor = anchorOf(e);
      const cz = anchor[1];
      let cx = anchor[0];
      // Foreground dressing should frame the action, not cover it. Position
      // labels alone ignore a prop's real footprint (e.g. a long cart).
      // Explicit authored offsets and interior layouts remain authoritative.
      if (immersive && !room && e.role === "foreground" && !e.offset) {
        const side = Math.sign(cx - focus0.x) || Math.sign(px) || 1;
        cx = focus0.x + side * Math.max(Math.abs(cx - focus0.x), reach + radius + 0.6);
      }
      const spans = def.placement === "water" && architectural(e);
      if (corridor && architectural(e) && !spans && Math.abs(cx - corridor.cx) >= 2.5) {
        // Keep the director's side of the street (or bank), but clear the
        // roadway or channel and its quay.
        const side = Math.sign(cx - corridor.cx);
        const clear = corridor.halfWidth + (corridor.quay ?? 0) + footprint / 2 + 0.3;
        cx = corridor.cx + side * Math.max(Math.abs(cx - corridor.cx), clear);
      }
      const shell = !!room && e === room.e;
      // In a channel, spanning structures lie across the flow and vessels
      // follow it, unless the director chose a facing.
      const longX = b.size.x >= b.size.z;
      const heading = shell
        ? room!.heading
        : channel && def.placement === "water" && !e.facing
          ? spans
            ? longX
              ? 0
              : Math.PI / 2
            : longX
              ? (this.script.seed + index) % 2
                ? -Math.PI / 2
                : Math.PI / 2
              : 0
          : headingFor(e, px, pz);
      const fwd = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
      const lat = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const offs = shell ? [[0, 0] as [number, number]] : formationOffsets(e.formation, e.count, spacing, rng);
      const living = def.category === "figure" || def.category === "animal";
      const variants = lib.variantCount(e.model);
      for (let i = 0; i < offs.length; i++) {
        const [f, l] = offs[i];
        const jit = living ? spacing * 0.18 : def.category === "nature" ? spacing * 0.3 : 0;
        let x = cx + fwd.x * f + lat.x * l + range(rng, -jit, jit);
        let z = cz + fwd.z * f + lat.z * l + range(rng, -jit, jit);
        let unitHeading = heading;
        if (immersive && corridor && layout === "street" && architectural(e) && e.count > 1 && !e.offset) {
          // Repeated street architecture forms frontage, even when it is the
          // subject. Crowd formations put houses in the road and expose gables.
          const split = Math.abs(px) < 0.05;
          const side = split ? (i % 2 ? 1 : -1) : Math.sign(px);
          const row = split ? Math.floor(i / 2) : i;
          x = corridor.cx + side * (corridor.halfWidth + (corridor.quay ?? 0) + footprint / 2 + 0.3);
          z = cz - row * spacing;
          unitHeading = side < 0 ? 0 : Math.PI;
        }
        if (room && !shell) [x, z] = insideRoom(x, z, radius);
        let y = 0;
        if (placement === "water" && !spans) {
          const cosH = Math.abs(Math.cos(unitHeading)),
            sinH = Math.abs(Math.sin(unitHeading));
          const extent = (across[0] ? cosH * b.size.x + sinH * b.size.z : sinH * b.size.x + cosH * b.size.z) * s;
          [x, z] = findWater(x, z, extent / 2 + 1);
        } else if (placement === "ground" && env.hasWater) [x, z] = findLand(x, z, radius);
        if (placement === "air")
          y = orbit
            ? range(rng, 0, layoutRadius * 0.4)
            : immersive
              ? Math.max(3, height * 2 + radius * 0.5) + range(rng, 0, radius * 0.25)
              : layoutRadius * 1.2 + height * 0.5 + range(rng, 0, layoutRadius * 0.4);
        const inst = lib.instance(e.model, {
          tint: e.color,
          variant: Math.floor(rng() * variants),
          night,
          seed: seed + ei * 1000 + i,
        });
        if (!inst) continue;
        const group = new THREE.Group();
        // Legacy effect definitions can contain static flame/smoke sculptures.
        // The burn animation supplies their visible geometry once, at ground level.
        const effectOnly = def.category === "effect" && e.motion === "burn";
        inst.object.visible = !effectOnly;
        group.add(inst.object);
        group.scale.setScalar(s);
        group.rotation.y =
          unitHeading +
          (living || def.category === "nature" ? range(rng, -0.12, 0.12) : 0) +
          (def.category === "nature" ? rng() * Math.PI * 2 : 0);
        scene.add(group);
        const unit: Unit = {
          group,
          inst,
          element: ei,
          base: new THREE.Vector3(x, y, z),
          fwd,
          speed:
            Math.sign(SPEED[e.motion] ?? 0) *
            Math.min(
              Math.abs(SPEED[e.motion] ?? 0),
              (airMover ? Math.max(layoutRadius * 4, 8) : Math.max(0.05, layoutRadius * 1.5)) /
                Math.max(1, sc.duration),
            ),
          motion: e.motion,
          placement,
          phase: rng() * 6,
          height,
          radius,
          framing: framingBounds(b, s),
          lift: effectOnly ? 0 : grounded.lift,
          takeoff: takeoff
            ? { travel: Math.max(layoutRadius * 4, 10), climb: Math.max(height * 2, radius * 0.8, 3) }
            : null,
          span: {
            x: Math.abs(Math.cos(heading)) * b.size.x * s + Math.abs(Math.sin(heading)) * b.size.z * s,
            z: Math.abs(Math.sin(heading)) * b.size.x * s + Math.abs(Math.cos(heading)) * b.size.z * s,
          },
          shell,
          fixed: spans,
          extras: [],
        };
        if (e.motion === "burn" && fires < 10) {
          const fireWidth = Math.max(0.04, Math.min(effectOnly ? 3.2 : Infinity, radius * 1.05));
          const fireHeight = Math.max(0.05, Math.min(effectOnly ? 2.5 : Infinity, height * 0.55, radius * 0.9));
          const fx = makeFire(fireWidth / s, fireHeight / s, rng);
          fx.object.position.set(0, effectOnly ? 0 : (height * 0.7) / s, 0);
          const sm = makeSmoke(rng, {
            size: Math.max(0.04, Math.min(effectOnly ? 1.3 : Infinity, radius * 0.5)) / s,
            rise: Math.max(0.1, Math.min(effectOnly ? 7 : Infinity, height * 1.5)) / s,
            color: "#5d5853",
          });
          sm.object.position.set(0, (effectOnly ? fireHeight * 0.6 : height * 0.9) / s, 0);
          group.add(fx.object, sm.object);
          unit.extras.push(fx, sm);
          fires++;
        }
        if (e.motion === "explode" && blasts < 6) {
          // Eye-level shots sit close to the action; keep blasts building-sized.
          const blast = immersive ? Math.min(radius * 2.4, 1.2 + height * 0.45) : radius * 2.4;
          const fx = makeExplosion(rng, Math.max(0.1, blast) / s, range(rng, 2.2, 3.4), rng() * 3);
          group.add(fx.object);
          unit.extras.push(fx);
          blasts++;
        }
        if (e.motion === "launch" && !takeoff && plumes < 3) {
          const sm = makeSmoke(rng, {
            size: Math.max(0.05, radius) / s,
            rise: Math.max(0.1, height) / s,
            color: "#d9d4cc",
            count: 12,
            life: 2.5,
          });
          scene.add(sm.object);
          sm.object.position.set(x, groundY(x, z, radius), z);
          unit.extras.push(sm);
          plumes++;
        }
        units.push(unit);
      }
    });

    // Subject framing (rest positions at mid-scene).
    const subjects = units.filter(
      (u) => !u.shell && (!sc.elements[u.element].role || sc.elements[u.element].role === "subject"),
    );
    let framed = subjects.length ? subjects : units.filter((u) => !u.shell);
    // A street of subject buildings is framed on its camera-nearest row and
    // allowed to recede, instead of being shrunk to fit the whole formation.
    if (immersive && framed.length >= 3 && framed.every((u) => architectural(sc.elements[u.element]))) {
      const frontZ = Math.max(...framed.map((u) => u.base.z));
      const depth = Math.max(...framed.map((u) => u.radius)) * 1.2;
      const row = framed.filter((u) => u.base.z > frontZ - depth);
      const nearX = row.reduce((a, u) => a + u.base.x, 0) / row.length;
      framed = row.sort((a, b) => Math.abs(a.base.x - nearX) - Math.abs(b.base.x - nearX)).slice(0, 3);
    }
    // Medium/detail coverage follows one member of a repeated moving group.
    // Fitting the whole crowd makes each person too small to read on a phone.
    if (
      immersive &&
      sc.shotSize !== "wide" &&
      framed.length >= (sc.shotSize === "close" ? 2 : 3) &&
      framed.every((u) => !architectural(sc.elements[u.element])) &&
      new Set(framed.map((u) => sc.elements[u.element].model)).size === 1
    ) {
      const middleX = framed.reduce((sum, u) => sum + u.base.x, 0) / framed.length;
      framed = [...framed]
        .sort((a, b) => b.base.z - Math.abs(b.base.x - middleX) * 0.5 - (a.base.z - Math.abs(a.base.x - middleX) * 0.5))
        .slice(0, 1);
    }
    // Framing is measured above the ground under the subjects; airborne
    // subjects keep a ground reference plus a (size-weighted) altitude.
    const surfaceAt = (u: Unit, x: number, z: number) =>
      orbit || u.placement === "water" ? 0 : u.placement === "air" ? env.heightAt(x, z) : groundY(x, z, u.radius);
    const center = new THREE.Vector3();
    let radius = 1,
      maxH = 0.1,
      ground0 = 0,
      lift0 = 0;
    if (framed.length) {
      let wsum = 0;
      for (const u of framed) {
        const w = Math.max(0.1, u.radius);
        wsum += w;
        ground0 += surfaceAt(u, u.base.x, u.base.z) * w;
        lift0 += (u.placement === "air" ? u.base.y : 0) * w;
      }
      ground0 /= wsum;
      lift0 /= wsum;
      const box = new THREE.Box3();
      for (const u of framed) {
        const alt = (u.placement === "air" ? u.base.y : 0) - lift0;
        const offset = u.framing.offset.clone().applyQuaternion(u.group.quaternion);
        const x = u.base.x + offset.x,
          z = u.base.z + offset.z,
          r = u.framing.radius;
        box.expandByPoint(new THREE.Vector3(x - r, alt, z - r));
        box.expandByPoint(new THREE.Vector3(x + r, alt + u.height, z + r));
      }
      box.getCenter(center);
      const extent = box.getSize(new THREE.Vector3());
      // A lone or clearly dominant subject is framed on its own radius, not
      // the box diagonal of everything around it.
      const largest = Math.max(...framed.map((u) => u.framing.radius));
      const spread = Math.hypot(extent.x, extent.z) / 2;
      radius = Math.max(
        0.15,
        framed.length === 1 || largest > spread * 0.6
          ? Math.min(spread, largest * (framed.length === 1 ? 1.2 : 1.25))
          : spread,
      );
      maxH = Math.max(0.1, extent.y);
    }
    // A subject much deeper along the view axis than it is wide (a side-on
    // wingspan, a boat seen bow-first) is shot from a three-quarter angle.
    const main = framed.reduce<Unit | null>((m, u) => (!m || u.radius > m.radius ? u : m), null);
    const facadeView =
      immersive &&
      main &&
      framed.every(
        (u) => architectural(sc.elements[u.element]) && Math.abs(u.group.rotation.y - main.group.rotation.y) < 0.05,
      );
    const viewAzimuth = facadeView
      ? Math.atan2(Math.cos(main.group.rotation.y), -Math.sin(main.group.rotation.y)) +
        (lib.bounds(sc.elements[main.element].model).size.x > lib.bounds(sc.elements[main.element].model).size.z * 1.4
          ? Math.PI / 2
          : 0)
      : undefined;
    const viewYaw = !facadeView && immersive && main && main.span.z > main.span.x * 1.4 ? 0.85 : 0;
    // Aim at the actual facade; camera collision keeps the lens in the street.
    const groundAt = new THREE.Vector3(center.x, ground0, center.z);

    // ------------------------------------------------------------ the place
    const disposables: { dispose(): void }[] = [];
    // Long, thin units (bridges, walls, long sheds) keep out a chain of
    // circles along their length, not one circle the size of their length.
    const keepOut: Circle[] = units.flatMap((u) => {
      const long = Math.max(u.span.x, u.span.z),
        short = Math.max(0.5, Math.min(u.span.x, u.span.z));
      if (long < short * 2.2) return [{ x: u.base.x, z: u.base.z, r: u.radius * 1.05 + 0.3, h: u.height }];
      const n = Math.ceil(long / short),
        alongX = u.span.x >= u.span.z;
      return Array.from({ length: n }, (_, i) => {
        const t = ((i + 0.5) / n - 0.5) * long;
        return { x: u.base.x + (alongX ? t : 0), z: u.base.z + (alongX ? 0 : t), r: short * 0.6 + 0.3, h: u.height };
      });
    });
    const sceneModels = new Set(
      sc.elements.filter((e) => !isFrontage(e) && e.role !== "background").map((e) => e.model),
    );
    const dressing =
      corridor && scenery.length
        ? buildDressing({
            lib,
            modelIds: scenery,
            subjectIds: sceneModels,
            preferredIds: frontage.map((e) => e.model),
            setting: sc.setting,
            settlement,
            seed,
            night,
            corridor,
            terminus,
            keepOut,
            heightAt: env.heightAt,
            isWater: env.isWater,
          })
        : null;
    if (dressing) {
      scene.add(dressing.group);
      disposables.push(dressing);
    }
    const footprints = dressing?.footprints ?? [];

    // Frontage the director set alight (or blew up) keeps its consequence.
    const sceneryFx: Effect[] = [];
    for (const e of frontage) {
      if (e.motion !== "burn" && e.motion !== "explode") continue;
      const side = e.offset ? Math.sign(e.offset.x - (corridor?.cx ?? 0)) : 0;
      const lots = footprints
        .filter((f) => !side || Math.sign(f.x - (corridor?.cx ?? 0)) === side)
        .sort((a, b) => Math.hypot(a.x - groundAt.x, a.z - groundAt.z) - Math.hypot(b.x - groundAt.x, b.z - groundAt.z))
        .slice(0, Math.min(e.count, e.motion === "burn" ? 5 : 2));
      for (const f of lots) {
        const y = env.heightAt(f.x, f.z);
        if (e.motion === "burn") {
          const fire = makeFire(Math.min(3.2, f.r * 0.7), Math.min(4.5, f.h * 0.55), rng);
          fire.object.position.set(f.x, y + f.h * 0.72, f.z);
          const smoke = makeSmoke(rng, { size: Math.min(2.6, f.r * 0.5), rise: f.h * 2.2, color: "#4f4a46" });
          smoke.object.position.set(f.x, y + f.h * 0.9, f.z);
          scene.add(fire.object, smoke.object);
          sceneryFx.push(fire, smoke);
        } else {
          const fx = makeExplosion(rng, Math.min(8, f.r * 1.6), range(rng, 2.4, 3.4), rng() * 3);
          fx.object.position.set(f.x, y + f.h * 0.5, f.z);
          scene.add(fx.object);
          sceneryFx.push(fx);
        }
      }
    }

    // Ground detail: tufts, stones, shrubs and (when the script brings no
    // vegetation of its own) generic trees, kept off the street and sets.
    const pathHalf = corridor?.water
      ? corridor.halfWidth + (corridor.paved ? (corridor.quay ?? 0) : 0)
      : corridor?.paved
        ? corridor.halfWidth * (sc.setting === "city" ? 1 : 0.45)
        : 0;
    const scatter =
      orbit || room
        ? null
        : buildScatter({
            setting: sc.setting,
            weather: sc.weather,
            night,
            seed,
            center: { x: groundAt.x, z: groundAt.z },
            heightAt: env.heightAt,
            isWater: env.isWater,
            trees: !this.script.models.some((m) => m.category === "nature"),
            settlement,
            blocked: (x, z, r) =>
              (!!corridor &&
                Math.abs(x - corridor.cx) < pathHalf + r &&
                z < corridor.cz + corridor.front &&
                z > corridor.cz - corridor.back - 30) ||
              keepOut.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r) ||
              footprints.some((c) => Math.hypot(c.x - x, c.z - z) < c.r * 0.95 + r),
          });
    if (scatter) {
      scene.add(scatter.group);
      disposables.push(scatter);
    }

    // Soft contact shadows anchor every grounded unit and set piece.
    const shadowTex = contactShadowTexture();
    const blobGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    disposables.push(blobGeo);
    const blobMaterial = (opacity: number) => {
      const m = new THREE.MeshBasicMaterial({
        map: shadowTex,
        color: "#000000",
        transparent: true,
        opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        toneMapped: false,
      });
      disposables.push(m);
      return m;
    };
    const m4 = new THREE.Matrix4();
    const grounded = units.filter((u) => u.placement === "ground" && !orbit && !u.shell);
    const unitBlobs =
      shadowTex && grounded.length
        ? new THREE.InstancedMesh(blobGeo, blobMaterial(night ? 0.42 : 0.55), grounded.length)
        : null;
    if (unitBlobs) {
      unitBlobs.frustumCulled = false;
      unitBlobs.renderOrder = 1;
      scene.add(unitBlobs);
      disposables.push(unitBlobs);
    }
    const near = footprints.filter((f) => Math.hypot(f.x - groundAt.x, f.z - groundAt.z) < 140);
    if (shadowTex && near.length) {
      const blobs = new THREE.InstancedMesh(blobGeo, blobMaterial(night ? 0.3 : 0.38), near.length);
      near.forEach((f, i) => {
        const s = f.r * 1.08;
        blobs.setMatrixAt(i, m4.makeScale(s, 1, s).setPosition(f.x, env.heightAt(f.x, f.z) + 0.03, f.z));
      });
      blobs.instanceMatrix.needsUpdate = true;
      blobs.computeBoundingSphere();
      blobs.renderOrder = 1;
      scene.add(blobs);
      disposables.push(blobs);
    }

    // ------------------------------------------------------------ camera
    const liveCentre = new THREE.Vector3();
    const actorCircles: Circle[] = units.map((u) => ({ x: u.base.x, z: u.base.z, r: u.radius, h: u.height }));
    const actorLive = actorCircles.filter((_, i) => units[i].placement !== "air" && !units[i].shell);
    // A whole-building definition has no authored detail target. Cropping its
    // ground-level centre produces a blank wall; keep its silhouette readable.
    const structuralWhole = framed.length > 0 && framed.every((u) => architectural(sc.elements[u.element]));
    const shot = makeShot({
      shotSize: structuralWhole ? "wide" : sc.shotSize,
      move: sc.camera,
      immersive,
      portrait,
      index,
      seed: this.script.seed,
      focus: groundAt,
      radius,
      height: maxH,
      restLift: lift0,
      yaw: viewYaw,
      viewAzimuth,
      follow: () => liveCentre,
      aerial: orbit,
      corridor,
      obstacles: footprints,
      subjects: () => actorLive,
      room: room
        ? {
            minX: room.rect.minX,
            maxX: room.rect.maxX,
            minZ: room.rect.minZ,
            maxZ: room.rect.maxZ,
            maxY: env.heightAt(room.x, room.z) + room.top - 0.35,
          }
        : null,
      heightAt: floorAt,
    });
    camera.fov = shot.fov;
    camera.near = shot.near;
    camera.updateProjectionMatrix();
    // Haze adds depth but must never bury the subject: cap the density so
    // at most ~30% (true fog ~55%) fogging reaches the subject distance.
    if (env.fog instanceof THREE.FogExp2)
      env.fog.density = Math.min(
        env.fog.density,
        room ? 0.004 : (sc.weather === "fog" ? 0.9 : 0.6) / Math.max(1, shot.distance),
      );

    // ------------------------------------------------------------ light
    // Key (sun) shadows fitted to what the shot can see; a cool or warm rim
    // from behind separates subjects from the set.
    const ext = clamp(Math.max(radius * 1.8, shot.distance * 1.6, corridor ? 26 : 9, roomSpan * 1.6), 5, 70);
    const shadowRes = ext > 40 ? 4096 : 2048;
    env.sun.shadow.mapSize.set(shadowRes, shadowRes);
    const shadowCam = env.sun.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -ext;
    shadowCam.right = ext;
    shadowCam.top = ext;
    shadowCam.bottom = -ext;
    shadowCam.near = 1;
    shadowCam.far = ext * 4 + 160;
    shadowCam.updateProjectionMatrix();
    env.sun.shadow.normalBias = 0.015 + ext * 0.0006;
    // The shadow box rides ahead of the camera (covering what it sees) and
    // snaps to whole shadow texels in light space so edges never shimmer.
    const lightX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), env.sunDir).normalize();
    const lightY = new THREE.Vector3().crossVectors(env.sunDir, lightX);
    const texel = (2 * ext) / shadowRes;
    const ahead = new THREE.Vector3();
    const look = new THREE.Vector3();
    const fitShadows = () => {
      camera.getWorldDirection(look);
      look.y = 0;
      if (look.lengthSq() < 1e-6) look.set(0, 0, -1);
      look.normalize();
      ahead.copy(camera.position).addScaledVector(look, ext * 0.72);
      ahead.y = groundAt.y;
      // Keep the subject (or the whole room and its ceiling) inside the box.
      if (room) ahead.set(room.x, groundAt.y, room.z);
      else if (ahead.distanceTo(groundAt) > ext * 0.7) ahead.lerp(groundAt, 0.5);
      const u = Math.round(ahead.dot(lightX) / texel) * texel;
      const v = Math.round(ahead.dot(lightY) / texel) * texel;
      const w = ahead.dot(env.sunDir);
      env.sun.target.position.copy(lightX).multiplyScalar(u).addScaledVector(lightY, v).addScaledVector(env.sunDir, w);
      env.sun.position.copy(env.sun.target.position).addScaledVector(env.sunDir, ext * 2 + 60);
    };
    if (immersive && !orbit) {
      const tod = sc.timeOfDay;
      const rim = new THREE.DirectionalLight(
        tod === "night" ? "#9db4ff" : tod === "day" ? "#fff0dc" : "#ffb27a",
        tod === "night" ? 0.6 : tod === "day" ? 0.7 : 1.15,
      );
      rim.position.set(groundAt.x - env.sunDir.x * 10, groundAt.y + 24, groundAt.z - 30);
      rim.target.position.copy(groundAt);
      scene.add(rim, rim.target);
      if (night && corridor && footprints.length) {
        // Lamp and window light pooling along the street.
        const glow = glowTexture();
        for (let i = 0; i < 4; i++) {
          const side = i % 2 ? 1 : -1;
          const x = corridor.cx + side * Math.max(0.6, corridor.halfWidth - 0.5);
          const z = corridor.cz + 6 - i * 11;
          const y = env.heightAt(x, z) + 2.6;
          const lamp = new THREE.PointLight("#ffad5c", 9, 16, 2);
          lamp.position.set(x, y, z);
          scene.add(lamp);
          if (glow) {
            const gm = new THREE.SpriteMaterial({
              map: glow,
              color: "#ffb46a",
              transparent: true,
              opacity: 0.75,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              toneMapped: false,
            });
            const sprite = new THREE.Sprite(gm);
            sprite.scale.setScalar(1.6);
            sprite.position.copy(lamp.position);
            scene.add(sprite);
            disposables.push(gm);
          }
        }
      }
    }
    if (room) {
      // Interior: a ceiling at wall height (visible from below only, so
      // overhead shots still see in) shades the room; sunlight enters only
      // through the open side and windows, and a warm bounce light fills it.
      const R = room.rect;
      const base = env.heightAt(room.x, room.z);
      const def = lib.definition(room.e.model)!;
      const lum = (c: string) => new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).l;
      const darkest = def.materials.map((m) => m.color).sort((a, b) => lum(a) - lum(b))[0] ?? "#4a3b2e";
      const cg = new THREE.PlaneGeometry(R.maxX - R.minX + 0.8, R.maxZ - R.minZ + 0.8).rotateX(Math.PI / 2);
      const cm = new THREE.MeshStandardMaterial({ color: darkest, roughness: 1, metalness: 0 });
      const ceiling = new THREE.Mesh(cg, cm);
      ceiling.position.set((R.minX + R.maxX) / 2, base + room.top - 0.02, (R.minZ + R.maxZ) / 2);
      ceiling.castShadow = true;
      ceiling.receiveShadow = true;
      scene.add(ceiling);
      disposables.push(cg, cm);
      const area = (R.maxX - R.minX) * (R.maxZ - R.minZ);
      const bounce = new THREE.PointLight(night ? "#ffb066" : "#ffd9b0", clamp(area * 0.16, 8, 40), roomSpan * 2.4, 2);
      bounce.position.set((R.minX + R.maxX) / 2, base + room.top * 0.78, R.minZ + (R.maxZ - R.minZ) * 0.6);
      scene.add(bounce);
      // A broad lateral key gives hands, tools and faces a readable light/shadow
      // gradient. The camera fill remains soft so turning shots keep their depth.
      const key = new THREE.SpotLight(
        night ? "#ffc58c" : "#fff2d8",
        clamp(area * 2.8, 80, 420),
        roomSpan * 3,
        Math.PI / 3,
        0.65,
        2,
      );
      key.position.set(R.minX + (R.maxX - R.minX) * 0.12, base + room.top * 0.88, R.maxZ - 0.3);
      key.target.position.set(groundAt.x, base + Math.min(maxH * 0.5, room.top * 0.45), groundAt.z);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.00015;
      key.shadow.normalBias = 0.015;
      key.shadow.camera.near = 0.1;
      key.shadow.camera.far = roomSpan * 3;
      scene.add(key, key.target);
      disposables.push({ dispose: () => key.dispose() });
    }
    const shading = lib.materials.ground;
    const shadingRange = clamp(maxH * 0.3, 0.18, 1.3);

    const labelEls = sc.elements.map((e, i) => ({ i, text: e.label })).filter((l) => !!l.text) as {
      i: number;
      text: string;
    }[];
    const tmp = new THREE.Vector3();

    return {
      scene,
      camera,
      portrait,
      update: (local) => {
        const p = clamp(local / sc.duration, 0, 1);
        env.update(local);
        scatter?.update(local);
        // The finish materials are shared across scenes; set this scene's
        // contact darkening and surface variation before every frame.
        shading.level.value = groundAt.y;
        shading.floor.value = immersive ? 0.6 : 0.74;
        shading.range.value = shadingRange;
        shading.noise.value = immersive ? 0.12 : 0.06;
        const fxState = { time: local, progress: p, moving: false, night, phase: 0 };
        for (const fx of sceneryFx) fx.update(fxState);
        let blob = 0;
        liveCentre.set(0, 0, 0);
        let live = 0,
          liftSum = 0,
          liftW = 0;
        units.forEach((u, ui) => {
          const k = local / sc.duration;
          // Take-off: rest position at mid-scene, accelerating roll from behind it.
          const d = u.takeoff ? u.takeoff.travel * (k * k - 0.25) : u.speed ? u.speed * (local - sc.duration * 0.5) : 0;
          const x = u.base.x + u.fwd.x * d,
            z = u.base.z + u.fwd.z * d;
          let y: number;
          let ground = 0;
          if (u.placement === "ground") {
            // The room shell stands on the terrain; everything else on its floor.
            const g = orbit ? u.base.y : u.shell ? env.heightAt(x, z) : groundY(x, z, u.radius);
            ground = g;
            y = g + u.lift;
            let climb = 0;
            if (u.takeoff) {
              const c = smooth(clamp((k - 0.35) / 0.65, 0, 1));
              climb = u.takeoff.climb * Math.pow(c, 1.3);
              y += climb;
              u.group.rotation.z = 0.16 * clamp((k - 0.32) / 0.12, 0, 1) * (1 - 0.6 * c);
              actorCircles[ui].r = climb > 0.8 ? 0 : u.radius;
            }
            if (unitBlobs && !u.shell) {
              const s = Math.max(0.12, u.radius * 1.2) / (1 + climb * 0.25);
              unitBlobs.setMatrixAt(blob++, m4.makeScale(s, 1, s).setPosition(x, g + 0.02, z));
            }
          } else if (u.placement === "water" && u.fixed) {
            y = 0;
          } else if (u.placement === "water") {
            y = Math.sin(local * 1.1 + u.phase) * 0.14 - 0.05;
            u.group.rotation.x = Math.sin(local * 0.8 + u.phase) * 0.045;
          } else {
            // Altitude is above the terrain below (orbit scenes have none).
            ground = orbit ? 0 : env.heightAt(x, z);
            y = ground + u.base.y + Math.sin(local * 0.9 + u.phase) * 0.35;
          }
          if (u.motion === "launch" && !u.takeoff) y += Math.pow(Math.max(0, local - 0.6), 2) * 1.8;
          if (u.motion === "collapse") {
            const k = Math.pow(clamp((p - 0.3) / 0.7, 0, 1), 2);
            u.group.rotation.z = k * 0.9 * (u.phase > 3 ? 1 : -1);
            y -= k * u.height * 0.35;
          }
          u.group.position.set(x, y, z);
          const circle = actorCircles[ui];
          circle.x = x;
          circle.z = z;
          if (framed.includes(u)) {
            tmp.copy(u.framing.offset).applyQuaternion(u.group.quaternion);
            liveCentre.x += x + tmp.x;
            liveCentre.z += z + tmp.z;
            live++;
            const w = Math.max(0.1, u.radius);
            liftSum += Math.max(0, y - ground) * w;
            liftW += w;
          }
          const st = {
            time: local,
            progress: p,
            moving: MOVING.has(u.motion) && (u.motion !== "launch" || local > 0.6),
            night,
            phase: u.phase,
          };
          u.inst.update(st);
          for (const fx of u.extras) fx.update(st);
        });
        if (unitBlobs) unitBlobs.instanceMatrix.needsUpdate = true;
        if (live) liveCentre.multiplyScalar(1 / live);
        else liveCentre.copy(groundAt);
        // Moving subjects are followed, but framing stays on the rest layout;
        // y carries the live altitude above ground for airborne subjects.
        liveCentre.lerp(groundAt, 0.35);
        liveCentre.y = liftW ? liftSum / liftW : lift0;
        shot.place(camera, local, sc.duration);
        camera.updateMatrixWorld();
        fitShadows();
        fill.position.copy(camera.position);
        fill.target.position.copy(groundAt);
      },
      labels: () =>
        labelEls.map(({ i, text }) => {
          const us = units.filter((u) => u.element === i);
          if (!us.length) return { x: 0, y: 0, text, visible: false };
          tmp.set(0, 0, 0);
          let h = 0;
          for (const u of us) {
            tmp.add(u.group.position);
            h = Math.max(h, u.height);
          }
          tmp.multiplyScalar(1 / us.length);
          tmp.y += h * 1.05;
          const pr = this.project(tmp, camera);
          return { ...pr, text };
        }),
      flash: (local) => env.flash(local),
      dispose: () => {
        units.forEach((u) => {
          u.inst.dispose();
          u.extras.forEach((e) => e.dispose());
        });
        sceneryFx.forEach((e) => e.dispose());
        disposables.forEach((d) => d.dispose());
        env.dispose();
        if (ownsLibrary) lib.dispose();
      },
    };
  }

  private buildMap(sc: Scene, index: number): BuiltScene {
    const map = sc.map!;
    const immersive = this.script.presentation === "immersive";
    const seed = (this.script.seed + (immersive ? 0 : index * 7919)) >>> 0;
    const rng = makeRng(seed);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#06070d");
    const portrait = this.height > this.width;
    const camera = new THREE.PerspectiveCamera(portrait ? 52 : 36, this.width / this.height, 0.1, 2000);
    const disposables: { dispose(): void }[] = [];
    const accent = sc.palette?.accent ?? this.script.palette.accent;

    // Stars.
    const n = 700;
    const sgeo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng() * Math.PI * 2,
        v = Math.acos(range(rng, -1, 1));
      arr.set([Math.sin(v) * Math.cos(u) * 600, Math.cos(v) * 600, Math.sin(v) * Math.sin(u) * 600], i * 3);
    }
    sgeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const smat = new THREE.PointsMaterial({ color: "#dfe6ff", size: 1.6, sizeAttenuation: false });
    scene.add(new THREE.Points(sgeo, smat));
    disposables.push(sgeo, smat);

    const sun = new THREE.DirectionalLight("#fff4e6", 3.1);
    sun.position.set(-30, 26, 42);
    scene.add(sun, new THREE.HemisphereLight("#9fb8ff", "#101018", 0.55), new THREE.AmbientLight("#ffffff", 0.25));

    const R = 10;
    const globe = buildGlobe(R, 24, seed);
    disposables.push(globe);
    const pivot = new THREE.Group();
    pivot.add(globe.group);
    scene.add(pivot);

    // Pin.
    const pinMat = new THREE.MeshStandardMaterial({
      color: this.script.palette.primary,
      flatShading: true,
      roughness: 0.6,
    });
    const pinGeo = new THREE.ConeGeometry(0.22, 0.9, 5);
    pinGeo.rotateX(Math.PI);
    pinGeo.translate(0, 0.45, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.28, 0);
    const pin = new THREE.Group();
    const cone = new THREE.Mesh(pinGeo, pinMat);
    const head = new THREE.Mesh(headGeo, pinMat);
    head.position.y = 0.95;
    const ringGeo = new THREE.TorusGeometry(0.5, 0.05, 4, 16);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, toneMapped: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    pin.add(cone, head, ring);
    const pinPos = latLonToVec3(map.lat, map.lon, R * 1.02);
    pin.position.copy(pinPos);
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pinPos.clone().normalize());
    globe.group.add(pin);
    disposables.push(pinMat, pinGeo, headGeo, ringGeo, ringMat);

    // Route (great-circle arcs drawn progressively).
    let route: { mesh: THREE.Mesh; count: number; curve: THREE.CatmullRomCurve3; marker: THREE.Mesh } | null = null;
    if (map.route && map.route.length >= 2) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < map.route.length - 1; i++) {
        const a = latLonToVec3(map.route[i].lat, map.route[i].lon, 1);
        const b = latLonToVec3(map.route[i + 1].lat, map.route[i + 1].lon, 1);
        const ang = a.angleTo(b);
        const steps = Math.max(4, Math.ceil(ang / 0.02));
        for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
          const t = k / steps;
          const v = new THREE.Vector3().copy(a).lerp(b, t).normalize();
          const lift = 1.018 + Math.sin(t * Math.PI) * Math.min(0.08, ang * 0.25);
          pts.push(v.multiplyScalar(R * lift));
        }
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tgeo = new THREE.TubeGeometry(curve, Math.min(400, pts.length * 3), R * 0.009, 5, false);
      const tmat = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
      const mesh = new THREE.Mesh(tgeo, tmat);
      globe.group.add(mesh);
      const mgeo = new THREE.IcosahedronGeometry(R * 0.022, 0);
      const marker = new THREE.Mesh(mgeo, new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
      globe.group.add(marker);
      disposables.push(tgeo, tmat, mgeo, marker.material as THREE.Material);
      route = { mesh, count: tgeo.index ? tgeo.index.count : tgeo.getAttribute("position").count, curve, marker };
    }

    const zoom = map.zoom === "world" ? [34, 27] : map.zoom === "local" ? [36, 14.5] : [36, 18.5];
    const startLat = clamp(map.lat * 0.5 + 12, -60, 60);
    const startLon = map.lon - 65;
    const pinWorld = new THREE.Vector3();

    return {
      scene,
      camera,
      portrait,
      update: (local) => {
        const p = clamp(local / (sc.duration * 0.8), 0, 1);
        const e = easeInOut(p);
        const la = lerp(startLat, map.lat, e);
        const lo = lerp(startLon, map.lon, e);
        pivot.rotation.x = THREE.MathUtils.degToRad(la);
        globe.group.rotation.y = THREE.MathUtils.degToRad(-90 - lo);
        const d = lerp(zoom[0], zoom[1], e) * (portrait ? 1.5 : 1);
        camera.position.set(0, d * 0.1, d);
        camera.lookAt(0, -d * 0.02, 0);
        const pulse = (local * 1.2) % 1;
        ring.scale.setScalar(1 + pulse * 2.2);
        ringMat.opacity = 0.9 * (1 - pulse);
        pin.scale.setScalar(easeInOut(clamp((local - 0.3) / 0.6, 0, 1)) || 0.001);
        if (route) {
          const rp = clamp((local - 0.4) / (sc.duration * 0.75), 0, 1);
          const count = Math.floor((route.count * rp) / 3) * 3;
          route.mesh.geometry.setDrawRange(0, count);
          route.marker.visible = rp > 0 && rp < 1;
          route.marker.position.copy(route.curve.getPointAt(Math.min(0.999, rp)));
        }
        camera.updateMatrixWorld();
      },
      labels: () => [],
      pin: () => {
        head.getWorldPosition(pinWorld);
        const pr = this.project(pinWorld, camera);
        return { ...pr, label: map.label };
      },
      flash: () => 0,
      dispose: () => disposables.forEach((d) => d.dispose()),
    };
  }
}
