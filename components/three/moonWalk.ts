import { makeRng } from "@/lib/lowpoly/core";

/** Ground plan of the Tranquility Base diorama, in world units on the lunar surface (x, z). */
export const SURFACE_RADIUS = 5.3;
export const LANDER = { x: -0.45, z: -0.6 };
export const FLAG_POLE = { x: 3.3, z: -0.1 };
export const CRATERS: readonly (readonly [x: number, z: number, radius: number])[] = [
  [-3.5, 1.2, 0.65],
  [2.7, -2.7, 0.8],
  [1.4, 3.5, 0.48],
  [-2.5, -2.5, 0.35],
];
export const START = { x: 2.15, z: 1.3, heading: -0.25 };

export type Rock = { x: number; z: number; size: number; light: boolean; spin: [number, number, number] };
/** Boulders scattered around the landing site, which itself is left clear. */
export const ROCKS: readonly Rock[] = (() => {
  const rng = makeRng(1969);
  const rocks: Rock[] = [];
  for (let i = 0; i < 65; i++) {
    const a = rng() * Math.PI * 2,
      r = 1.5 + rng() * 3.5;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    if (Math.abs(x) < 2.4 && z > -2.5 && z < 2.4) continue;
    const size = 0.06 + rng() * 0.18;
    const light = rng() > 0.5;
    rocks.push({ x, z, size, light, spin: [rng(), rng(), rng()] });
  }
  return rocks;
})();

/** Farthest the astronaut's centre may go from the middle of the disc, so his boots stay on it. */
export const WALK_RADIUS = 4.5;
/** Half-width of the astronaut, boots included. */
const BODY = 0.3;
export const OBSTACLES: readonly { x: number; z: number; r: number }[] = [
  { x: LANDER.x, z: LANDER.z, r: 2.45 + BODY },
  { x: FLAG_POLE.x, z: FLAG_POLE.z, r: 0.05 + BODY },
  ...CRATERS.map(([x, z, r]) => ({ x, z, r: r * 1.15 + BODY })),
  ...ROCKS.map((k) => ({ x: k.x, z: k.z, r: k.size * 1.3 + BODY })),
];

/** True when a straight walk from a to b stays on the disc and clear of everything on it. */
export function isClear(ax: number, az: number, bx: number, bz: number) {
  // The disc is convex, so checking the destination keeps the whole walk on it.
  if (Math.hypot(bx, bz) > WALK_RADIUS) return false;
  const dx = bx - ax,
    dz = bz - az;
  const len = dx * dx + dz * dz || 1;
  for (const o of OBSTACLES) {
    const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / len));
    if (Math.hypot(ax + dx * t - o.x, az + dz * t - o.z) < o.r) return false;
  }
  return true;
}

export type Act = "walk" | "look" | "wave" | "salute" | "gaze";
type Goal = { x: number; z: number; act: Exclude<Act, "walk">; hold: number; face?: number; bound?: boolean };

/** Places worth a visit: both faces of the flag for a salute, and the foot of the ladder to look up at Eagle. */
const SPOTS: readonly Goal[] = [
  { x: 3.75, z: 0.95, face: Math.PI, act: "salute", hold: 2.8 },
  { x: 3.75, z: -1.2, face: 0, act: "salute", hold: 2.8 },
  { x: LANDER.x, z: 2.35, face: Math.PI, act: "gaze", hold: 2.6 },
];

const WALK_SPEED = 0.7;
const HOP_SPEED = 0.85;
/** Ground covered by a full lope cycle (two steps) and by a full bounding cycle (two hops). */
const STRIDE = 1;
const BOUND_STRIDE = 1.9;
const TURN_RATE = 2.6;

/** Everything the renderer needs to pose the astronaut. Angles in radians, weights 0–1. */
export type WalkPose = {
  x: number;
  z: number;
  heading: number;
  /** Gait cycle position; feet land at 0 and 0.5. */
  phase: number;
  gait: number;
  /** Blend from an alternating lope (0) to two-footed kangaroo hops (1). */
  bound: number;
  look: number;
  lookUp: number;
  salute: number;
  wave: number;
  time: number;
};

const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/** True when Eagle's cabin stands between (x, z) and the viewer, so a wave would go unseen. */
function behindLander(x: number, z: number, viewer: { x: number; z: number }) {
  const dx = viewer.x - x,
    dz = viewer.z - z;
  const len = Math.hypot(dx, dz) || 1;
  const ahead = ((LANDER.x - x) * dx + (LANDER.z - z) * dz) / len;
  return ahead > 0 && Math.abs((LANDER.x - x) * dz - (LANDER.z - z) * dx) / len < 1.3;
}

/**
 * Armstrong's stroll: pick a clear destination, turn, lope or hop there, then pause for a moment
 * (look around, wave at the viewer, salute the flag, look up at the lander) and go again.
 */
export function createMoonWalker(seed: number) {
  const rng = makeRng(seed);
  const pose: WalkPose = {
    ...START,
    phase: 0,
    gait: 0,
    bound: 0,
    look: 0,
    lookUp: 0,
    salute: 0,
    wave: 0,
    time: rng() * 100,
  };
  let goal: Goal | null = null;
  let act: Act = "look";
  let face: number | undefined;
  let wait = 1 + rng();
  let speed = 0;
  let lastSpot: Goal | undefined;

  function choose(): Goal | null {
    if (rng() < 0.22) {
      const spots = SPOTS.filter((s) => s !== lastSpot && isClear(pose.x, pose.z, s.x, s.z));
      if (spots.length) return (lastSpot = spots[Math.floor(rng() * spots.length)]);
    }
    for (let i = 0; i < 60; i++) {
      // Long strolls first; short hops get him out of tight corners.
      const d = i < 40 ? 1.2 + rng() * 2.8 : 0.4 + rng() * 0.8;
      const a = rng() * Math.PI * 2;
      const x = pose.x + Math.sin(a) * d,
        z = pose.z + Math.cos(a) * d;
      if (!isClear(pose.x, pose.z, x, z)) continue;
      lastSpot = undefined;
      return { x, z, act: rng() < 0.3 ? "wave" : "look", hold: 1.4 + rng() * 2.4, bound: d > 2 && rng() < 0.4 };
    }
    return null;
  }

  /** Advance by dt seconds. `viewer` is the camera position; `onStep` fires as a boot (or both) lands. */
  function update(dt: number, viewer: { x: number; z: number }, onStep?: (side: 0 | 1) => void) {
    pose.time += dt;
    const ease = (rate: number) => Math.min(1, dt * rate);
    let want: number | undefined;
    let cruise = 0;
    if (goal) {
      const dx = goal.x - pose.x,
        dz = goal.z - pose.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.04) {
        ({ act, face } = goal);
        if (act === "wave" && behindLander(pose.x, pose.z, viewer)) act = "look";
        wait = goal.hold;
        goal = null;
      } else {
        want = Math.atan2(dx, dz);
        // Face the way first, then set off; slow down on arrival.
        const align = Math.max(0, Math.cos(wrap(want - pose.heading))) ** 6;
        cruise = Math.min(goal.bound ? HOP_SPEED : WALK_SPEED, dist * 1.5) * align;
        // Move only along the checked straight line, whatever the body is doing.
        const move = Math.min(dist, speed * dt);
        pose.x += (dx / dist) * move;
        pose.z += (dz / dist) * move;
      }
    }
    if (!goal) {
      if (act === "wave") want = Math.atan2(viewer.x - pose.x, viewer.z - pose.z);
      else if (face !== undefined) want = face;
      // The pause only counts once he has turned to whatever he stopped for.
      if (want === undefined || Math.abs(wrap(want - pose.heading)) < 0.3) wait -= dt;
      if (wait <= 0) {
        goal = choose();
        if (goal) {
          act = "walk";
          face = undefined;
        } else wait = 0.5;
      }
    }
    speed += (cruise - speed) * ease(3);

    let turning = 0;
    if (want !== undefined) {
      const off = wrap(want - pose.heading);
      const turn = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, off * ease(4)));
      pose.heading = wrap(pose.heading + turn);
      turning = Math.min(1, Math.abs(turn) / (TURN_RATE * dt || 1));
    }
    pose.bound += ((goal?.bound ? 1 : 0) - pose.bound) * ease(3);
    pose.gait += (Math.max(speed / WALK_SPEED, turning * 0.4) - pose.gait) * ease(4);
    const stride = STRIDE + (BOUND_STRIDE - STRIDE) * pose.bound;
    const before = Math.floor(pose.phase * 2);
    pose.phase += (speed / stride + turning * 0.7) * dt;
    const after = Math.floor(pose.phase * 2);
    if (after !== before && pose.gait > 0.2) onStep?.((after % 2) as 0 | 1);
    pose.phase %= 1;

    const idle = !goal;
    const facing = want === undefined || Math.abs(wrap(want - pose.heading)) < 0.3;
    pose.salute += ((idle && act === "salute" && facing && wait > 0.4 ? 1 : 0) - pose.salute) * ease(5);
    pose.wave += ((idle && act === "wave" && facing && wait > 0.3 ? 1 : 0) - pose.wave) * ease(5);
    pose.lookUp += ((idle && act === "gaze" && facing ? 0.45 : 0) - pose.lookUp) * ease(3);
    const scan = idle && act === "look" ? 0.55 * Math.sin(pose.time * 0.9) : 0;
    pose.look += (scan - pose.look) * ease(3);
  }

  return { pose, update };
}

export type MoonWalker = ReturnType<typeof createMoonWalker>;
