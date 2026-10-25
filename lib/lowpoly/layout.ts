/**
 * Ground-plane layout for placed units. Separates overlapping rest footprints,
 * then keeps straight-line movers off everything standing still and off each
 * other: a sideways lane shift first, clipped travel second. Pure and
 * deterministic; array order breaks every tie.
 */

export interface Body {
  /** Rest footprint centre on the ground plane at mid-scene (world metres). Mutated by resolveLayout. */
  x: number;
  z: number;
  heading: number;
  hx: number;
  hz: number;
  /** Higher priority moves less; equal priorities share the push. */
  priority: number;
  movable: boolean;
  /** Members of one formation share a group id (optional). */
  group?: number;
  /** Straight-line travel over the scene, in metres along dir: d(t) runs from dStart to dEnd. Mutated by resolveLayout (clipped when the path is blocked). */
  motion?: { dirX: number; dirZ: number; dStart: number; dEnd: number };
}

export interface LayoutOptions {
  /** Extra clearance kept between footprints (m). Default 0.15. */
  margin?: number;
  /** Optional clamp applied after every push (e.g. keep inside a room or out of water). Returns the corrected centre. */
  clamp?: (b: Body, x: number, z: number) => [number, number];
  /** Largest sideways lane shift (m) tried before clipping a blocked path. Default 4. */
  maxLaneShift?: number;
  /** Coarse steps per side when clipping a blocked path, refined by bisection. Swept tests are exact. Default 24. */
  samples?: number;
  /** Static relaxation passes. Default 24. */
  iterations?: number;
}

/** Overlap counts are pairs at rest (including immovable pairs, which are never pushed); path counts are bodies. */
export interface LayoutReport {
  overlapsBefore: number;
  overlapsAfter: number;
  pathsShifted: number;
  pathsClipped: number;
}

type Box = Pick<Body, "x" | "z" | "heading" | "hx" | "hz">;

interface Shape {
  c: number;
  s: number;
  hx: number;
  hz: number;
  r: number;
}

/** Centre path, piecewise linear in scene progress (knots run 0..1) and monotone along one line. */
interface Track {
  k: number[];
  x: number[];
  z: number[];
}

/** `lerp` follows positionAt; `held` is the original timing held inside a clipped interval (the engine's mapping). */
interface Obstacle {
  j: number;
  lerp: Track;
  held: Track;
  still: boolean;
}

const EPS = 1e-6;
const SLOP = 1e-4;
let axisX = 0,
  axisZ = 1;

const shapeOf = (b: Box): Shape => ({
  c: Math.cos(b.heading),
  s: Math.sin(b.heading),
  hx: b.hx,
  hz: b.hz,
  r: Math.hypot(b.hx, b.hz),
});
const reach = (f: Shape, ux: number, uz: number) =>
  f.hx * Math.abs(f.c * ux - f.s * uz) + f.hz * Math.abs(f.s * ux + f.c * uz);
const travels = (b: Body) => !!b.motion && Math.abs(b.motion.dEnd - b.motion.dStart) > 1e-3;

/** Minimum overlap of b (offset dx, dz from a) over the four face axes; leaves the axis in axisX/axisZ. */
function sat(a: Shape, b: Shape, dx: number, dz: number) {
  let depth = Infinity;
  // a's local z is tried first so coincident centres part sideways.
  for (let n = 0; n < 4; n++) {
    const f = n < 2 ? a : b;
    const ux = n & 1 ? f.c : f.s,
      uz = n & 1 ? -f.s : f.c;
    const p = dx * ux + dz * uz;
    const o = reach(a, ux, uz) + reach(b, ux, uz) - Math.abs(p);
    if (o < depth) {
      depth = o;
      const sign = p < -1e-12 ? -1 : 1;
      axisX = ux * sign;
      axisZ = uz * sign;
    }
  }
  return depth;
}

/** Whether b, translating relative to a from offset (x0, z0) to (x1, z1), comes within `gap` of it. Exact. */
function swept(a: Shape, b: Shape, x0: number, z0: number, x1: number, z1: number, gap: number) {
  let lo = 0,
    hi = 1;
  for (let n = 0; n < 4; n++) {
    const f = n < 2 ? a : b;
    const ux = n & 1 ? f.c : f.s,
      uz = n & 1 ? -f.s : f.c;
    const r = reach(a, ux, uz) + reach(b, ux, uz) + gap - EPS;
    const p = x0 * ux + z0 * uz,
      v = (x1 - x0) * ux + (z1 - z0) * uz;
    if (Math.abs(v) < 1e-12) {
      if (Math.abs(p) >= r) return false;
      continue;
    }
    const t0 = (-r - p) / v,
      t1 = (r - p) / v;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    if (lo >= hi) return false;
  }
  return true;
}

function at(v: number[], k: number[], t: number) {
  let i = 0;
  while (i < k.length - 2 && t > k[i + 1]) i++;
  const span = k[i + 1] - k[i];
  return span > 0 ? v[i] + ((v[i + 1] - v[i]) * (t - k[i])) / span : v[i + 1];
}

function bound(t: Track, r: number): [number, number, number] {
  const e = t.k.length - 1;
  return [(t.x[0] + t.x[e]) / 2, (t.z[0] + t.z[e]) / 2, Math.hypot(t.x[e] - t.x[0], t.z[e] - t.z[0]) / 2 + r];
}

/** Face-axis clearance can be 1/√2 of the true gap (corner to corner), hence the widened circle test. */
function trackHit(a: Shape, p: Track, b: Shape, q: Track, gap: number) {
  const [px, pz, pr] = bound(p, a.r),
    [qx, qz, qr] = bound(q, b.r),
    reachSum = pr + qr + gap * Math.SQRT2;
  if ((qx - px) ** 2 + (qz - pz) ** 2 >= reachSum * reachSum) return false;
  const ks = p.k.length === 2 && q.k.length === 2 ? p.k : [...new Set([...p.k, ...q.k])].sort((u, v) => u - v);
  let x0 = at(q.x, q.k, 0) - at(p.x, p.k, 0),
    z0 = at(q.z, q.k, 0) - at(p.z, p.k, 0);
  for (let i = 1; i < ks.length; i++) {
    const x1 = at(q.x, q.k, ks[i]) - at(p.x, p.k, ks[i]),
      z1 = at(q.z, q.k, ks[i]) - at(p.z, p.k, ks[i]);
    if (swept(a, b, x0, z0, x1, z1, gap)) return true;
    x0 = x1;
    z0 = z1;
  }
  return false;
}

const still = (x: number, z: number): Track => ({ k: [0, 1], x: [x, x], z: [z, z] });
const line = (b: Body, x: number, z: number, k: number[], d: number[]): Track => ({
  k,
  x: d.map((v) => x + b.motion!.dirX * v),
  z: d.map((v) => z + b.motion!.dirZ * v),
});

/** Linear travel from dStart to dEnd, held inside [d0, d1]. */
function held(dStart: number, dEnd: number, d0: number, d1: number) {
  const lo = Math.min(d0, d1),
    hi = Math.max(d0, d1);
  const k = new Set([0, 1]);
  for (const e of [lo, hi]) {
    const t = (e - dStart) / (dEnd - dStart);
    if (t > 0 && t < 1) k.add(t);
  }
  const ks = [...k].sort((u, v) => u - v);
  return { k: ks, d: ks.map((t) => Math.min(hi, Math.max(lo, dStart + (dEnd - dStart) * t))) };
}

/** Signed penetration depth of two oriented footprints (positive = overlapping, metres), and the unit axis (x,z) along which to push b away from a. */
export function penetration(a: Box, b: Box): { depth: number; nx: number; nz: number } {
  const depth = sat(shapeOf(a), shapeOf(b), b.x - a.x, b.z - a.z);
  return { depth, nx: axisX, nz: axisZ };
}

/** Position of a body at normalized scene progress k in [0,1], assuming d(k) = lerp(dStart, dEnd, k). */
export function positionAt(b: Body, k: number): [number, number] {
  const m = b.motion;
  if (!m) return [b.x, b.z];
  const d = m.dStart + (m.dEnd - m.dStart) * k;
  return [b.x + m.dirX * d, b.z + m.dirZ * d];
}

/** Circles (x,z,r) covering a body's whole swept path, for keeping set dressing and scatter off it. Static bodies return one circle covering the footprint. */
export function sweptCircles(b: Body, margin = 0.3): { x: number; z: number; r: number }[] {
  const r = Math.hypot(b.hx, b.hz) + margin;
  if (!travels(b)) {
    const [x, z] = positionAt(b, 0.5);
    return [{ x, z, r }];
  }
  const [x0, z0] = positionAt(b, 0),
    [x1, z1] = positionAt(b, 1);
  const count = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / Math.max(0.05, Math.min(b.hx, b.hz))));
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / count,
    z: z0 + ((z1 - z0) * i) / count,
    r,
  }));
}

export function resolveLayout(bodies: Body[], opts: LayoutOptions = {}): LayoutReport {
  const margin = opts.margin ?? 0.15;
  const maxShift = opts.maxLaneShift ?? 4;
  const steps = Math.max(1, Math.round(opts.samples ?? 24));
  const n = bodies.length;
  const shapes = bodies.map(shapeOf);
  const touching = (i: number, ix: number, iz: number, j: number, jx: number, jz: number) => {
    const dx = jx - ix,
      dz = jz - iz,
      r = shapes[i].r + shapes[j].r + margin * Math.SQRT2;
    return dx * dx + dz * dz < r * r && sat(shapes[i], shapes[j], dx, dz) > EPS - margin;
  };
  const overlaps = () => {
    let count = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) if (touching(i, bodies[i].x, bodies[i].z, j, bodies[j].x, bodies[j].z)) count++;
    return count;
  };
  const overlapsBefore = overlaps();

  const shove = (b: Body, ux: number, uz: number, amount: number) => {
    let x = b.x + ux * amount,
      z = b.z + uz * amount;
    if (opts.clamp) [x, z] = opts.clamp(b, x, z);
    const moved = (x - b.x) * ux + (z - b.z) * uz;
    b.x = x;
    b.z = z;
    return moved;
  };
  for (let pass = 0; pass < (opts.iterations ?? 24); pass++) {
    let pushed = false;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = bodies[i],
          b = bodies[j];
        if ((!a.movable && !b.movable) || !touching(i, a.x, a.z, j, b.x, b.z)) continue;
        const want = sat(shapes[i], shapes[j], b.x - a.x, b.z - a.z) + margin + SLOP;
        const nx = axisX,
          nz = axisZ;
        const [sa, sb] =
          !a.movable || (b.movable && b.priority < a.priority)
            ? [0, 1]
            : !b.movable || a.priority < b.priority
              ? [1, 0]
              : [0.5, 0.5];
        let left = want;
        if (sa) left -= shove(a, -nx, -nz, want * sa);
        if (sb) left -= shove(b, nx, nz, want * sb);
        // A body held back by the clamp counts as immovable: the other takes the remainder.
        if (left > EPS && b.movable && sb < 1) left -= shove(b, nx, nz, left);
        if (left > EPS && a.movable && sa < 1) left -= shove(a, -nx, -nz, left);
        pushed ||= left < want - EPS;
      }
    if (!pushed) break;
  }
  // Pairwise pushes spread a dense pile slowly (or wedge a low rank against
  // an immovable). Any remainder is settled greedily: by rank, each body
  // keeps its spot or takes the nearest one clear of those already settled.
  if (overlaps()) {
    const placed: number[] = [];
    const clearOf = (i: number, x: number, z: number) =>
      placed.every((j) => !touching(i, x, z, j, bodies[j].x, bodies[j].z));
    const fit = (i: number, x: number, z: number): [number, number] | null => {
      if (opts.clamp) [x, z] = opts.clamp(bodies[i], x, z);
      return clearOf(i, x, z) ? [x, z] : null;
    };
    const freeSpot = (i: number) => {
      const b = bodies[i];
      let best: [number, number] | null = null,
        bestD = Infinity,
        awayX = 0,
        awayZ = 0;
      for (const j of placed) {
        const o = bodies[j];
        if (!touching(i, b.x, b.z, j, o.x, o.z)) continue;
        awayX += b.x - o.x;
        awayZ += b.z - o.z;
        const out = sat(shapes[j], shapes[i], b.x - o.x, b.z - o.z) + margin + SLOP;
        const spot = fit(i, b.x + axisX * out, b.z + axisZ * out);
        const d = spot ? Math.hypot(spot[0] - b.x, spot[1] - b.z) : Infinity;
        if (d < bestD) [best, bestD] = [spot, d];
      }
      if (best) return best;
      const step = Math.max(0.2, Math.min(b.hx, b.hz)),
        from = Math.atan2(awayZ, awayX);
      for (let q = 1; q <= 32; q++) {
        const count = Math.min(48, Math.ceil(2 * Math.PI * q));
        for (let s = 0; s < count; s++) {
          const a = from + (s & 1 ? -1 : 1) * Math.ceil(s / 2) * ((2 * Math.PI) / count);
          const spot = fit(i, b.x + Math.cos(a) * q * step, b.z + Math.sin(a) * q * step);
          if (spot) return spot;
        }
      }
      return null;
    };
    const order = bodies.map((_, i) => i);
    order.sort((i, j) => +bodies[i].movable - +bodies[j].movable || bodies[j].priority - bodies[i].priority || i - j);
    for (const i of order) {
      const b = bodies[i];
      const spot = b.movable && !clearOf(i, b.x, b.z) ? freeSpot(i) : null;
      if (spot) [b.x, b.z] = spot;
      placed.push(i);
    }
  }

  const moves = bodies.map(travels);
  const formations: number[][] = [];
  const byGroup = new Map<number, number[]>();
  bodies.forEach((b, i) => {
    if (!moves[i]) return;
    const f = b.group === undefined ? undefined : byGroup.get(b.group);
    if (f) f.push(i);
    else {
      formations.push([i]);
      if (b.group !== undefined) byGroup.set(b.group, formations[formations.length - 1]);
    }
  });
  const rank = (f: number[]) => Math.max(...f.map((i) => bodies[i].priority));
  formations.sort((f, g) => rank(g) - rank(f) || f[0] - g[0]);

  const snap = bodies.map((b) => ({ x: b.x, z: b.z, d0: b.motion?.dStart ?? 0, d1: b.motion?.dEnd ?? 0 }));
  const rested = (j: number, x: number, z: number): Obstacle => {
    const t = still(x, z);
    return { j, lerp: t, held: t, still: true };
  };
  const stills = bodies.flatMap((b, j) => (moves[j] ? [] : [rested(j, ...positionAt(b, 0.5))]));
  const anchor = (s: number, e: number) => Math.min(Math.max(0, Math.min(s, e)), Math.max(s, e));
  /** Member i's tracks with its rest offset by (ox, oz), travelling the fractions tb (back) and tf (forward) of its path around d = 0. */
  const trackOf = (i: number, ox: number, oz: number, tb: number, tf: number) => {
    const b = bodies[i],
      { x, z, d0: s, d1: e } = snap[i],
      a = anchor(s, e);
    const d0 = tb === 1 ? s : a + (s - a) * tb,
      d1 = tf === 1 ? e : a + (e - a) * tf;
    const lerp = line(b, x + ox, z + oz, [0, 1], [d0, d1]);
    if (tb === 1 && tf === 1) return { d0, d1, lerp, held: lerp };
    const h = held(s, e, d0, d1);
    return { d0, d1, lerp, held: line(b, x + ox, z + oz, h.k, h.d) };
  };
  const blocker = (
    f: number[],
    near: Obstacle[],
    ox: number,
    oz: number,
    tb: number,
    tf: number,
    skip?: Set<Obstacle>,
  ) => {
    for (const i of f) {
      const t = trackOf(i, ox, oz, tb, tf);
      for (const o of near) {
        if (skip?.has(o)) continue;
        if (trackHit(shapes[i], t.lerp, shapes[o.j], o.lerp, margin)) return o;
        if (o.still || (t.held === t.lerp && o.held === o.lerp)) continue;
        if (trackHit(shapes[i], t.held, shapes[o.j], o.held, margin)) return o;
      }
    }
    return null;
  };
  const fits = (f: number[], ox: number, oz: number) =>
    f.every((i) => {
      const x = snap[i].x + ox,
        z = snap[i].z + oz;
      if (opts.clamp) {
        const [cx, cz] = opts.clamp(bodies[i], x, z);
        if (Math.abs(cx - x) + Math.abs(cz - z) > EPS) return false;
      }
      for (let j = 0; j < n; j++) if (!f.includes(j) && touching(i, x, z, j, bodies[j].x, bodies[j].z)) return false;
      return true;
    });

  let pathsShifted = 0,
    pathsClipped = 0;
  /** Settles one formation against fixed obstacles; null asks for its rest to be reserved (another path sweeps it). */
  const settle = (f: number[], pool: Obstacle[], canReserve: boolean): Obstacle[] | null => {
    const reachOf = f.map((i) => bound(trackOf(i, 0, 0, 1, 1).lerp, shapes[i].r + maxShift));
    const near = pool.filter((o) => {
      const [ox, oz, or] = bound(o.lerp, shapes[o.j].r);
      return reachOf.some(([x, z, r]) => Math.hypot(ox - x, oz - z) < r + or + margin * Math.SQRT2);
    });
    const finish = (ox: number, oz: number, tb: number, tf: number) =>
      f.map((i): Obstacle => {
        const t = trackOf(i, ox, oz, tb, tf),
          b = bodies[i];
        b.x = snap[i].x + ox;
        b.z = snap[i].z + oz;
        b.motion!.dStart = t.d0;
        b.motion!.dEnd = t.d1;
        return { j: i, lerp: t.lerp, held: t.held, still: false };
      });
    if (!blocker(f, near, 0, 0, 1, 1)) return finish(0, 0, 1, 1);

    const m = bodies[f[0]].motion!,
      len = Math.hypot(m.dirX, m.dirZ);
    if (len > EPS && f.every((i) => bodies[i].movable)) {
      const px = -m.dirZ / len,
        pz = m.dirX / len;
      const step = Math.max(0.25, Math.min(...f.map((i) => Math.min(bodies[i].hx, bodies[i].hz))));
      for (let q = 1; q * step <= maxShift + EPS; q++)
        for (const off of [q * step, -q * step])
          if (fits(f, px * off, pz * off) && !blocker(f, near, px * off, pz * off, 1, 1)) {
            pathsShifted += f.length;
            return finish(px * off, pz * off, 1, 1);
          }
    }

    // Standing at rest must be safe before any travel is. Static residue the
    // relaxation could not clear is ignored rather than freezing the path.
    const skip = new Set<Obstacle>();
    for (let o = blocker(f, near, 0, 0, 0, 0); o; o = blocker(f, near, 0, 0, 0, 0, skip)) {
      if (!o.still && canReserve) return null;
      skip.add(o);
    }
    const clear = (tb: number, tf: number) => !blocker(f, near, 0, 0, tb, tf, skip);
    const extend = (ok: (t: number) => boolean) => {
      let good = 0;
      for (let s = 1; s <= steps; s++) {
        if (ok(s / steps)) {
          good = s / steps;
          continue;
        }
        let bad = s / steps;
        for (let r = 0; r < 12; r++) {
          const mid = (good + bad) / 2;
          if (ok(mid)) good = mid;
          else bad = mid;
        }
        break;
      }
      return good;
    };
    let tf = extend((t) => clear(0, t));
    let tb = extend((t) => clear(t, tf));
    const lead = snap[f[0]],
      a = anchor(lead.d0, lead.d1);
    const pullBack = (t: number, side: number) => (t < 1 && side > EPS ? Math.max(0, t - 0.05 / side) : t);
    const tb2 = pullBack(tb, Math.abs(lead.d0 - a)),
      tf2 = pullBack(tf, Math.abs(lead.d1 - a));
    if ((tb2 !== tb || tf2 !== tf) && clear(tb2, tf2)) [tb, tf] = [tb2, tf2];
    if (tb < 1 || tf < 1) pathsClipped += f.length;
    return finish(0, 0, tb, tf);
  };

  // A formation whose rest another path sweeps is reserved: earlier
  // (higher-priority) paths then avoid that rest, and the pass restarts.
  const reserved = new Set<number>();
  for (let retry = true; retry;) {
    retry = false;
    pathsShifted = pathsClipped = 0;
    for (const f of formations)
      for (const i of f) {
        bodies[i].x = snap[i].x;
        bodies[i].z = snap[i].z;
        bodies[i].motion!.dStart = snap[i].d0;
        bodies[i].motion!.dEnd = snap[i].d1;
      }
    const done: Obstacle[] = [];
    for (let fi = 0; fi < formations.length; fi++) {
      const ahead = formations.flatMap((g, gi) =>
        gi > fi && reserved.has(gi) ? g.map((j) => rested(j, snap[j].x, snap[j].z)) : [],
      );
      const out = settle(formations[fi], [...stills, ...done, ...ahead], !reserved.has(fi));
      if (!out) {
        reserved.add(fi);
        retry = true;
        break;
      }
      done.push(...out);
    }
  }

  return { overlapsBefore, overlapsAfter: overlaps(), pathsShifted, pathsClipped };
}
