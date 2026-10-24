/**
 * PolyEngine — deterministic renderer for a VideoScript.
 *
 * renderAt(t) is a pure function of (script, t): scenes are built lazily from
 * the script's ModelDefinitions (via the generic compiler) and procedural
 * environments, then composited with the 2D overlay. The same engine drives
 * the live player and the offscreen GIF exporter.
 */
import * as THREE from "three";
import type { Formation, Position, Scene, SceneElement, VideoScript } from "@/lib/schema/video";
import type { Placement } from "@/lib/schema/model";
import { ModelLibrary, type ModelInstance } from "@/lib/lowpoly/compiler";
import { clamp, easeInOut, lerp, makeRng, range, type Rng } from "@/lib/lowpoly/core";
import { type Effect, makeExplosion, makeFire, makeSmoke } from "@/lib/lowpoly/effects";
import { buildEnvironment, type Environment } from "@/lib/lowpoly/environment";
import { buildGlobe, latLonToVec3 } from "@/lib/lowpoly/globe";
import { drawOverlay, loadFonts, type OverlayLabel } from "@/lib/lowpoly/overlay";

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
  extras: Effect[];
}

export class PolyEngine {
  readonly script: VideoScript;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: THREE.WebGLRenderer;
  private library: ModelLibrary;
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
    for (const b of this.built.values()) {
      b.camera.aspect = width / height;
      b.camera.fov = this.script.presentation === "immersive" ? (height > width ? 64 : 56) : height > width ? 58 : 42;
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
    const immersive = this.script.presentation === "immersive";
    const seed = (this.script.seed + (immersive ? 0 : index * 7919)) >>> 0;
    const rng = makeRng(seed);
    const lib = this.library;
    const needsWater = sc.elements.some((e) => lib.definition(e.model)?.placement === "water");
    const env: Environment = buildEnvironment(sc, seed, { forceWater: needsWater });
    const scene = new THREE.Scene();
    scene.add(env.group);
    scene.fog = env.fog;
    scene.background = env.background;
    const portrait = this.height > this.width;
    const camera = new THREE.PerspectiveCamera(
      immersive ? (portrait ? 64 : 56) : portrait ? 58 : 42,
      this.width / this.height,
      0.3,
      1400,
    );
    const night = env.night;
    // A soft camera fill keeps the educational subject legible even at night.
    const fill = new THREE.DirectionalLight("#fff4df", night ? 0.85 : 1.1);
    scene.add(fill, fill.target);
    const orbit = sc.setting === "orbit";

    const findWater = (x: number, z: number) => {
      if (env.isWater(x, z)) return [x, z];
      for (let k = 1; k < 40; k++)
        for (const dz of [-k * 1.5, k * 1.5])
          if (env.isWater(x, z + dz) && env.isWater(x, z + dz - Math.sign(dz) * 2)) return [x, z + dz];
      return [x, z];
    };
    const findLand = (x: number, z: number) => {
      if (!env.isWater(x, z)) return [x, z];
      for (let k = 1; k < 40; k++)
        for (const dz of [k * 1.5, -k * 1.5]) if (!env.isWater(x, z + dz)) return [x, z + dz + Math.sign(dz) * 1.5];
      return [x, z];
    };

    // Layout uses the generated subjects' dimensions, so tools and small
    // inventions are not spaced like armies or buildings.
    const layoutRadius = Math.max(
      0.15,
      ...sc.elements
        .filter((e) => !e.role || e.role === "subject")
        .map((e) => (lib.has(e.model) ? lib.bounds(e.model).radius * (e.scale ?? 1) : 0)),
    );
    const units: Unit[] = [];
    let fires = 0,
      blasts = 0,
      plumes = 0;
    sc.elements.forEach((e, ei) => {
      const def = lib.definition(e.model);
      if (!def) return;
      const b = lib.bounds(e.model);
      const s = e.scale ?? 1;
      const radius = b.radius * s;
      const height = b.height * s;
      const spacing = Math.max(0.05, radius * 2 * 1.1);
      const placement: Placement = orbit ? "air" : def.placement;
      const region = Math.max(0.4, layoutRadius * 2.4);
      const [px, pz] = POS[e.position];
      const layer = e.role === "background" ? 2.5 : 1;
      const cx = e.offset?.x ?? px * region * layer,
        cz = e.offset?.z ?? (e.role === "background" ? -region * 2.2 - radius + pz * region : pz * region);
      const heading = headingFor(e, px, pz);
      const fwd = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
      const lat = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const offs = formationOffsets(e.formation, e.count, spacing, rng);
      const living = def.category === "figure" || def.category === "animal";
      const variants = lib.variantCount(e.model);
      for (let i = 0; i < offs.length; i++) {
        const [f, l] = offs[i];
        const jit = living ? spacing * 0.18 : def.category === "nature" ? spacing * 0.3 : 0;
        let x = cx + fwd.x * f + lat.x * l + range(rng, -jit, jit);
        let z = cz + fwd.z * f + lat.z * l + range(rng, -jit, jit);
        let y = 0;
        if (placement === "water") [x, z] = findWater(x, z);
        else if (placement === "ground" && env.hasWater) [x, z] = findLand(x, z);
        if (placement === "air")
          y = (orbit ? 0 : layoutRadius * 1.2 + height * 0.5) + range(rng, 0, layoutRadius * 0.4);
        const inst = lib.instance(e.model, {
          tint: e.color,
          variant: Math.floor(rng() * variants),
          night,
          seed: seed + ei * 1000 + i,
        });
        if (!inst) continue;
        const group = new THREE.Group();
        group.add(inst.object);
        group.scale.setScalar(s);
        group.rotation.y =
          heading +
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
            Math.min(Math.abs(SPEED[e.motion] ?? 0), Math.max(0.05, layoutRadius * 1.5) / Math.max(1, sc.duration)),
          motion: e.motion,
          placement,
          phase: rng() * 6,
          height,
          radius,
          extras: [],
        };
        if (e.motion === "burn" && fires < 10) {
          const fx = makeFire(
            Math.max(0.04, radius * 0.7) / s,
            Math.max(0.05, Math.min(height, radius * 1.4)) / s,
            rng,
          );
          fx.object.position.set(0, (height * 0.7) / s, 0);
          const sm = makeSmoke(rng, {
            size: Math.max(0.04, radius * 0.5) / s,
            rise: Math.max(0.1, height * 1.5) / s,
            color: "#5d5853",
          });
          sm.object.position.set(0, (height * 0.9) / s, 0);
          group.add(fx.object, sm.object);
          unit.extras.push(fx, sm);
          fires++;
        }
        if (e.motion === "explode" && blasts < 6) {
          const fx = makeExplosion(rng, Math.max(0.1, radius * 2.4) / s, range(rng, 2.2, 3.4), rng() * 3);
          group.add(fx.object);
          unit.extras.push(fx);
          blasts++;
        }
        if (e.motion === "launch" && plumes < 3) {
          const sm = makeSmoke(rng, {
            size: Math.max(0.05, radius) / s,
            rise: Math.max(0.1, height) / s,
            color: "#d9d4cc",
            count: 12,
            life: 2.5,
          });
          scene.add(sm.object);
          sm.object.position.set(x, env.heightAt(x, z), z);
          unit.extras.push(sm);
          plumes++;
        }
        units.push(unit);
      }
    });

    // Subject framing (rest positions at mid-scene).
    const subjects = units.filter((u) => !sc.elements[u.element].role || sc.elements[u.element].role === "subject");
    const framed = subjects.length ? subjects : units;
    const center = new THREE.Vector3();
    let radius = 1,
      maxH = 0.1;
    if (framed.length) {
      const box = new THREE.Box3();
      for (const u of framed) {
        const bottom =
          u.placement === "air" ? u.base.y : u.placement === "water" ? 0 : env.heightAt(u.base.x, u.base.z);
        box.expandByPoint(new THREE.Vector3(u.base.x - u.radius, bottom, u.base.z - u.radius));
        box.expandByPoint(new THREE.Vector3(u.base.x + u.radius, bottom + u.height, u.base.z + u.radius));
      }
      box.getCenter(center);
      const extent = box.getSize(new THREE.Vector3());
      radius = Math.max(0.15, Math.hypot(extent.x, extent.z) / 2);
      maxH = Math.max(0.1, extent.y);
    }
    const fitHeight = (maxH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.55;
    const dist =
      Math.max(fitHeight, clamp(radius * (immersive ? 1.75 : 2.2) + maxH * 0.65, 0.8, 100)) * (portrait ? 1.45 : 1);
    if (immersive && scene.fog) {
      const fog = scene.fog as THREE.Fog;
      fog.near = Math.max(dist * 1.5, 20);
      fog.far = Math.max(dist * 4, 100);
    }
    const targetY = center.y;
    camera.near = Math.max(0.01, Math.min(0.3, dist * 0.02));
    camera.updateProjectionMatrix();
    const theta0 = range(rng, -0.35, 0.35);

    env.sun.target.position.copy(center);
    env.sun.position.copy(center).add(env.sun.position.clone().normalize().multiplyScalar(90));
    const shadowCam = env.sun.shadow.camera as THREE.OrthographicCamera;
    const ext = Math.max(2, radius * 1.6);
    shadowCam.left = -ext;
    shadowCam.right = ext;
    shadowCam.top = ext;
    shadowCam.bottom = -ext;
    shadowCam.updateProjectionMatrix();

    const target = new THREE.Vector3();
    const placeCamera = (p: number) => {
      const e = easeInOut(p);
      let th = theta0,
        ph = immersive ? 10 : 24,
        d = dist;
      target.set(center.x, targetY, center.z);
      switch (sc.camera) {
        case "eye_level":
          ph = 0;
          d = dist * (1.02 - 0.18 * e);
          th = theta0 * 0.3;
          target.y = center.y - maxH * 0.12;
          break;
        case "tracking":
          ph = 3;
          d = dist * 0.95;
          th = -0.25 + 0.5 * e;
          target.y = center.y - maxH * 0.1;
          break;
        case "orbit":
          th = theta0 - 0.4 + 0.8 * e;
          break;
        case "push_in":
          th = theta0 + 0.12 * e;
          ph = 27 - 5 * e;
          d = dist * (1.3 - 0.42 * e);
          break;
        case "pull_out":
          ph = 18 + 10 * e;
          d = dist * (0.82 + 0.45 * e);
          break;
        case "pan_left":
          target.x += radius * (0.55 - 1.1 * e);
          ph = 20;
          d = dist * 0.92;
          break;
        case "pan_right":
          target.x += radius * (-0.55 + 1.1 * e);
          ph = 20;
          d = dist * 0.92;
          break;
        case "flyover":
          ph = 32 + 30 * e;
          d = dist * (1.12 - 0.22 * e);
          target.z += radius * (0.4 - 0.8 * e);
          break;
        case "crane_up":
          ph = 7 + 40 * e;
          th = theta0 + 0.1 * e;
          break;
        case "crane_down":
          ph = 47 - 40 * e;
          th = theta0 - 0.1 * e;
          break;
        case "low_angle":
          ph = 5;
          th = theta0 - 0.18 + 0.36 * e;
          d = dist * 0.8;
          target.y += maxH * 0.25;
          break;
        case "top_down":
          ph = 68 + 12 * e;
          th = theta0 + 0.4 * e;
          break;
        default:
          th = theta0 + 0.04 * Math.sin(p * Math.PI);
          break;
      }
      const phr = THREE.MathUtils.degToRad(ph);
      camera.position.set(
        target.x + Math.sin(th) * Math.cos(phr) * d,
        target.y + Math.sin(phr) * d,
        target.z + Math.cos(th) * Math.cos(phr) * d,
      );
      if (!orbit)
        camera.position.y = Math.max(
          camera.position.y,
          env.heightAt(camera.position.x, camera.position.z) + Math.max(0.12, Math.min(1.6, maxH * 0.3)),
        );
      camera.lookAt(target);
      fill.position.copy(camera.position);
      fill.target.position.copy(target);
    };

    const labelEls = sc.elements.map((e, i) => ({ i, text: e.label })).filter((l) => !!l.text) as {
      i: number;
      text: string;
    }[];
    const tmp = new THREE.Vector3();

    return {
      scene,
      camera,
      update: (local) => {
        const p = clamp(local / sc.duration, 0, 1);
        env.update(local);
        for (const u of units) {
          const d = u.speed ? u.speed * (local - sc.duration * 0.5) : 0;
          const x = u.base.x + u.fwd.x * d,
            z = u.base.z + u.fwd.z * d;
          let y: number;
          if (u.placement === "ground") y = orbit ? u.base.y : env.heightAt(x, z);
          else if (u.placement === "water") {
            y = Math.sin(local * 1.1 + u.phase) * 0.14 - 0.05;
            u.group.rotation.x = Math.sin(local * 0.8 + u.phase) * 0.045;
          } else y = u.base.y + Math.sin(local * 0.9 + u.phase) * 0.35;
          if (u.motion === "launch") y += Math.pow(Math.max(0, local - 0.6), 2) * 1.8;
          if (u.motion === "collapse") {
            const k = Math.pow(clamp((p - 0.3) / 0.7, 0, 1), 2);
            u.group.rotation.z = k * 0.9 * (u.phase > 3 ? 1 : -1);
            y -= k * u.height * 0.35;
          }
          u.group.position.set(x, y, z);
          const st = {
            time: local,
            progress: p,
            moving: MOVING.has(u.motion) && (u.motion !== "launch" || local > 0.6),
            night,
            phase: u.phase,
          };
          u.inst.update(st);
          for (const fx of u.extras) fx.update(st);
        }
        placeCamera(p);
        camera.updateMatrixWorld();
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
        env.dispose();
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
