/**
 * Cinematic shot rig. Turns a scene's camera move into a deterministic
 * camera path framed on the real subject bounds: eye-height dollies and
 * tracking inside the street, low angles, reveals and crane moves, with
 * per-shot variation (side, lens, size) and collision against the set.
 */
import * as THREE from "three";
import type { CameraMove } from "@/lib/schema/video";
import { clamp, easeInOut, lerp, makeRng, range } from "@/lib/lowpoly/core";
import type { Circle, Corridor } from "@/lib/lowpoly/world";

export interface ShotSpec {
  move: CameraMove;
  shotSize?: "wide" | "medium" | "close";
  immersive: boolean;
  portrait: boolean;
  index: number;
  seed: number;
  /** Ground point under the subject centre (y = ground height). */
  focus: THREE.Vector3;
  radius: number;
  height: number;
  /** Altitude of the subjects above the ground at rest (airborne subjects). */
  restLift?: number;
  /** Extra camera azimuth (radians, applied toward the shot's side) for a broadside view. */
  yaw?: number;
  /** Absolute azimuth from +z for an authored facade-facing view. */
  viewAzimuth?: number;
  /** Live subject centre for moving subjects; its y is the live altitude above ground. */
  follow?: () => THREE.Vector3;
  /** No ground clamping (orbit/space scenes). */
  aerial: boolean;
  corridor: Corridor | null;
  obstacles: Circle[];
  /** Live footprints of the acting units; the camera never enters them. */
  subjects?: () => Circle[];
  /** Interior shots: the camera stays within these walls and below the ceiling. */
  room?: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number } | null;
  heightAt(x: number, z: number): number;
}

export interface Shot {
  fov: number;
  near: number;
  /** Nominal subject distance, for shadow and fog fitting. */
  distance: number;
  place(camera: THREE.PerspectiveCamera, local: number, duration: number): void;
}

/** Relative shot size per move: <1 tighter, >1 wider. */
const SIZE: Partial<Record<CameraMove, number>> = {
  eye_level: 1,
  tracking: 1.12,
  push_in: 1,
  pull_out: 0.9,
  orbit: 1.05,
  pan_left: 1.25,
  pan_right: 1.25,
  low_angle: 0.82,
  flyover: 1.3,
  crane_up: 1.1,
  crane_down: 1.1,
  top_down: 1.2,
  static: 1,
};

/** Lens offsets in degrees: long lenses for close, intimate shots. */
const LENS: Partial<Record<CameraMove, number>> = {
  low_angle: 4,
  pan_left: 4,
  pan_right: 4,
  flyover: 6,
  push_in: -6,
  eye_level: -2,
  tracking: 0,
  static: -4,
};

export function makeShot(spec: ShotSpec): Shot {
  const rng = makeRng(spec.seed * 31 + spec.index * 977 + 5);
  const { portrait, focus } = spec;
  // Ground-level lenses hide the working surface of small subjects behind
  // their chassis or tabletop. Reserve that angle for tall subjects.
  const move = spec.immersive && spec.move === "low_angle" && spec.height < 2.5 ? "eye_level" : spec.move;
  const r = Math.max(0.15, spec.radius);
  const h = Math.max(0.1, spec.height);

  if (!spec.immersive) return classicShot(spec, rng);

  // Rooms are shot a little wider so the walls read around the subject.
  const baseFov = (portrait ? 62 : 48) + (LENS[move] ?? 0) + [0, -4, 3][spec.index % 3] + (spec.room ? 8 : 0);
  // Fit using the actual lens: applying a long lens after fitting crops twice.
  const fov = spec.shotSize === "close" ? Math.max(32, baseFov * 0.8) : baseFov;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const aspect = portrait ? 9 / 16 : 16 / 9;
  const fitH = (h / (2 * tanHalf)) * 1.3;
  const fitW = (r * 2.1) / (2 * tanHalf * aspect);
  const coverage = spec.shotSize === "close" ? 0.9 : spec.shotSize === "medium" ? 0.72 : 1;
  const d0 = Math.max(0.5, fitH, fitW) * (SIZE[move] ?? 1) * [1, 0.9, 1.12][spec.index % 3] * coverage;
  // Alternate sides between consecutive shots so cuts read as coverage.
  const side = (spec.index % 2 ? -1 : 1) * (spec.seed % 2 ? -1 : 1);
  const th0 = side * range(rng, 0.12, 0.26);
  // Small working objects need coverage from above their working surface;
  // aiming at half-height puts the lens beneath tables and mechanisms.
  const detail = spec.shotSize === "close" && h < 2;
  const overview = spec.shotSize === "wide" && r > h * 1.3;
  // A wide place is filmed from near eye level, the way the reference films
  // hold a street or a waterfront: the distance carries the width, not a
  // raised diorama angle. Crane, flyover and top-down moves bring their own height.
  const eye = overview
    ? clamp(1.55 + Math.min(r, 20) * 0.04, 1.55, 2.7)
    : detail
      ? h + 0.35
      : h < 1.2
        ? clamp(h * 1.6 + 0.2, 0.35, 1.65)
        : clamp(h * 0.8, 0.9, 1.65);
  const wholeTall = spec.shotSize === "wide" || (spec.shotSize !== "close" && h > r * 1.4);
  const lookY = wholeTall ? h * 0.45 : detail ? h * 0.85 : Math.min(h * 0.5, eye * 0.95);
  const C = spec.corridor;
  const hand = move === "eye_level" || move === "tracking" || move === "static" || move === "low_angle";

  const pos = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const centre = new THREE.Vector3();

  const polar = (th: number, elDeg: number, d: number) => {
    const el = THREE.MathUtils.degToRad(elDeg);
    pos.set(tgt.x + Math.sin(th) * Math.cos(el) * d, tgt.y + Math.sin(el) * d, tgt.z + Math.cos(th) * Math.cos(el) * d);
  };
  // Airborne subjects are watched from the ground: aim rises with altitude
  // and the camera backs off enough to keep the look-up angle comfortable.
  let lift = 0;
  const atEye = (th: number, d: number, y: number) => {
    const dd = Math.max(d, lift * 0.9);
    pos.set(tgt.x + Math.sin(th) * dd, centre.y + y, tgt.z + Math.cos(th) * dd);
  };

  const resolve = () => {
    if (spec.aerial) return;
    const ground = () => spec.heightAt(pos.x, pos.z);
    const actors = spec.subjects?.() ?? [];
    // Height the shot intends above the subject's ground (eye, low angle...).
    const eyeOffset = pos.y - focus.y;
    for (let pass = 0; pass < 2; pass++) {
      // Stay inside the street while below the rooflines.
      if (C && C.paved !== false && pos.z < C.cz + C.front && pos.z > C.cz - C.back) {
        const lim = Math.max(0.3, C.halfWidth + (C.quay ?? 0) - 0.45);
        const tall = spec.obstacles.some((o) => o.h > pos.y - ground() - 0.3);
        if (tall) {
          const distance = Math.hypot(pos.x - tgt.x, pos.z - tgt.z);
          const x = clamp(pos.x, C.cx - lim, C.cx + lim);
          if (x !== pos.x) {
            pos.x = x;
            // Sliding into the street must not turn a fitted wide shot into
            // an accidental close-up. Recover clearance along the road.
            pos.z =
              tgt.z + Math.sign(pos.z - tgt.z || 1) * Math.sqrt(Math.max(0, distance * distance - (x - tgt.x) ** 2));
          }
        }
      }
      // Pull toward the subject until clear of any set piece.
      for (let k = 0; k < 14; k++) {
        const hit = spec.obstacles.find(
          (o) => Math.hypot(pos.x - o.x, pos.z - o.z) < (o.rc ?? o.r) + 0.35 && pos.y - ground() < o.h + 0.4,
        );
        if (!hit) break;
        pos.lerp(tgt, 0.12);
      }
      // Never inside an acting model. A person needs enough distance that the
      // frame holds the whole body, not a cropped pair of arms.
      for (const a of actors) {
        const dx = pos.x - a.x,
          dz = pos.z - a.z;
        const d = Math.hypot(dx, dz);
        const human = a.h > 0.8 && a.h < 2.6 && a.r < 1.1;
        const min = human ? Math.max(a.r + 0.25, a.h * 2.1) : a.r + 0.25;
        if (d >= min || (!human && pos.y - ground() > a.h + 0.3)) continue;
        if (d > 1e-4) {
          pos.x = a.x + (dx / d) * min;
          pos.z = a.z + (dz / d) * min;
        } else pos.z = a.z + min;
      }
    }
    // Collision-free positions can still stare into a nearby facade. Find
    // an unobstructed view around the subject without changing shot distance.
    if (!spec.room && spec.obstacles.length) {
      const blocked = (x: number, z: number) => {
        const dx = tgt.x - x,
          dz = tgt.z - z;
        const length2 = dx * dx + dz * dz;
        return spec.obstacles.some((o) => {
          const t = clamp(((o.x - x) * dx + (o.z - z) * dz) / Math.max(0.001, length2), 0, 1);
          // Scenery behind the target does not obscure the subject.
          if (t > 0.97) return false;
          const separation = Math.hypot(x + dx * t - o.x, z + dz * t - o.z);
          const rayHeight = lerp(pos.y, tgt.y, t);
          return separation < o.r + 0.25 && rayHeight < spec.heightAt(o.x, o.z) + o.h + 0.2;
        });
      };
      if (blocked(pos.x, pos.z)) {
        const dx = pos.x - tgt.x,
          dz = pos.z - tgt.z;
        const valid = (x: number, z: number) =>
          !blocked(x, z) &&
          spec.obstacles.every(
            (o) => Math.hypot(x - o.x, z - o.z) >= (o.rc ?? o.r) + 0.35 || pos.y > spec.heightAt(o.x, o.z) + o.h + 0.4,
          ) &&
          actors.every((a) => Math.hypot(x - a.x, z - a.z) >= a.r + 0.3 || pos.y > spec.heightAt(x, z) + a.h + 0.3);
        for (let step = 1; step <= 12; step++) {
          let found = false;
          for (const direction of [1, -1]) {
            const a = ((step * Math.PI) / 12) * direction;
            const x = tgt.x + dx * Math.cos(a) + dz * Math.sin(a);
            const z = tgt.z - dx * Math.sin(a) + dz * Math.cos(a);
            if (valid(x, z)) {
              pos.x = x;
              pos.z = z;
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
    }
    // A camera that steps onto a bank, quay or rise keeps that height above
    // the new ground instead of skimming its surface.
    if (eyeOffset > 0) pos.y = Math.max(pos.y, ground() + Math.min(eyeOffset, 2.2));
    const W = spec.room;
    if (W) {
      pos.x = clamp(pos.x, W.minX + 0.35, W.maxX - 0.35);
      pos.z = clamp(pos.z, W.minZ + 0.35, W.maxZ - 0.2);
      pos.y = Math.min(pos.y, W.maxY);
    }
    pos.y = Math.max(pos.y, ground() + 0.14);
  };

  return {
    // A long lens preserves a true detail shot when collision clearance keeps
    // the camera outside a wide subject's footprint (wings, wheels, machinery).
    fov,
    near: clamp(d0 * 0.02, 0.02, 0.3),
    distance: d0,
    place(camera, local, duration) {
      const p = clamp(local / Math.max(0.1, duration), 0, 1);
      const e = easeInOut(p);
      centre.copy(spec.follow ? spec.follow() : focus);
      lift = spec.follow ? Math.max(0, centre.y) : (spec.restLift ?? 0);
      centre.y = focus.y;
      const base = centre.y + lift;
      tgt.set(centre.x, base + lookY, centre.z);
      switch (move) {
        case "eye_level":
          atEye(th0 * 0.6, d0 * (1.08 - 0.16 * e), eye);
          tgt.y = base + (wholeTall ? lookY : Math.min(lookY, eye * 0.9));
          break;
        case "tracking": {
          const slide = Math.min(d0 * 0.5, C ? C.halfWidth * 0.6 : d0 * 0.5) * side;
          const x = lerp(-slide, slide, e);
          pos.set(centre.x + x, centre.y + eye, centre.z + Math.max(d0, lift * 0.9));
          // Dolly past the subject while keeping its action on the optical axis.
          tgt.y = base + (wholeTall ? lookY : Math.min(lookY, eye * 0.9));
          break;
        }
        case "push_in":
          atEye(th0 + side * 0.06 * e, d0 * (1.25 - 0.35 * e), lerp(eye + Math.min(d0 * 0.1, 0.45), eye, e));
          break;
        case "pull_out":
          atEye(th0 * 0.5, d0 * (0.9 + 0.55 * e), lerp(eye, eye + d0 * 0.45, e * e));
          tgt.y = base + lerp(lookY, h * 0.35, e);
          break;
        case "orbit":
          atEye(th0 + side * lerp(-0.22, 0.22, e), d0 * (1.04 - 0.06 * e), eye * 1.05 + d0 * 0.06);
          break;
        case "pan_left":
        case "pan_right": {
          const k = (r * 0.6 + d0 * 0.32) * (move === "pan_left" ? 1 : -1);
          atEye(th0, d0, eye);
          tgt.x += lerp(k, -k, e);
          break;
        }
        case "flyover":
          polar(th0 * 0.5, lerp(28, 56, e), d0 * lerp(1.2, 0.95, e));
          pos.z += d0 * lerp(0.5, -0.1, e);
          break;
        case "crane_up":
          polar(th0, lerp(3, 40, e), d0);
          break;
        case "crane_down":
          polar(th0, lerp(40, 3, e), d0);
          break;
        case "low_angle":
          atEye(th0 + side * lerp(-0.14, 0.14, e), d0 * 1.05, clamp(h * 0.16, 0.16, 0.42));
          tgt.y = base + h * 0.5;
          break;
        case "top_down":
          polar(th0 + 0.35 * e, lerp(66, 78, e), d0 * 1.05);
          break;
        default:
          atEye(th0 + 0.04 * Math.sin(p * Math.PI), d0, eye);
          break;
      }
      if (hand) {
        // Gentle, deterministic hand-held drift.
        const a = 0.004 + d0 * 0.005;
        pos.x += a * (Math.sin(local * 0.9 + spec.index) + 0.5 * Math.sin(local * 2.3 + 1.7));
        pos.y += a * 0.6 * Math.sin(local * 1.3 + 0.4);
        tgt.x += a * 0.5 * Math.sin(local * 0.7 + 2.1);
      }
      const azimuth = (spec.viewAzimuth ?? 0) + side * (spec.yaw ?? 0);
      if (azimuth) {
        const c = Math.cos(azimuth),
          s = Math.sin(azimuth);
        const dx = pos.x - tgt.x,
          dz = pos.z - tgt.z;
        pos.x = tgt.x + dx * c + dz * s;
        pos.z = tgt.z - dx * s + dz * c;
      }
      resolve();
      camera.position.copy(pos);
      camera.lookAt(tgt);
    },
  };
}

/** Elevated diorama framing for classic presentation (previous behaviour). */
function classicShot(spec: ShotSpec, rng: () => number): Shot {
  const fov = spec.portrait ? 58 : 42;
  const r = Math.max(0.15, spec.radius),
    h = Math.max(0.1, spec.height);
  const fitHeight = (h / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)))) * 1.25;
  const dist = Math.max(fitHeight, clamp(r * 1.85 + h * 0.5, 0.8, 100)) * (spec.portrait ? 1.2 : 1);
  const theta0 = range(rng, -0.35, 0.35);
  const target = new THREE.Vector3();
  return {
    fov,
    near: Math.max(0.01, Math.min(0.3, dist * 0.02)),
    distance: dist,
    place(camera, local, duration) {
      const p = clamp(local / Math.max(0.1, duration), 0, 1);
      const e = easeInOut(p);
      let th = theta0,
        ph = 24,
        d = dist;
      target.copy(spec.focus);
      target.y += (spec.restLift ?? 0) + h * 0.5;
      switch (spec.move) {
        case "eye_level":
          ph = 0;
          d = dist * (1.02 - 0.18 * e);
          th = theta0 * 0.3;
          target.y -= h * 0.12;
          break;
        case "tracking":
          ph = 3;
          d = dist * 0.95;
          th = -0.25 + 0.5 * e;
          target.y -= h * 0.1;
          break;
        case "orbit":
          th = theta0 - 0.4 + 0.8 * e;
          break;
        case "push_in":
          th = theta0 + 0.12 * e;
          ph = 27 - 5 * e;
          d = dist * (1.12 - 0.22 * e);
          break;
        case "pull_out":
          ph = 18 + 10 * e;
          d = dist * (0.9 + 0.25 * e);
          break;
        case "pan_left":
          target.x += r * (0.55 - 1.1 * e);
          ph = 20;
          d = dist * 0.92;
          break;
        case "pan_right":
          target.x += r * (-0.55 + 1.1 * e);
          ph = 20;
          d = dist * 0.92;
          break;
        case "flyover":
          ph = 32 + 30 * e;
          d = dist * (1.12 - 0.22 * e);
          target.z += r * (0.4 - 0.8 * e);
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
          target.y += h * 0.25;
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
      if (!spec.aerial)
        camera.position.y = Math.max(
          camera.position.y,
          spec.heightAt(camera.position.x, camera.position.z) + Math.max(0.12, Math.min(1.6, h * 0.3)),
        );
      camera.lookAt(target);
    },
  };
}
