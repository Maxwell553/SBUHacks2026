import assert from "node:assert/strict";
import { makeRng } from "../../lib/lowpoly/core";
import { penetration, positionAt, resolveLayout, sweptCircles, type Body } from "../../lib/lowpoly/layout";
import { deckTop, stageBeside, stageCrew, type StageFigure, type StageProp } from "../../lib/lowpoly/staging";

const MARGIN = 0.15;
const box = (x: number, z: number, hx: number, hz = hx, heading = 0, extra: Partial<Body> = {}): Body => ({
  x,
  z,
  heading,
  hx,
  hz,
  priority: 1,
  movable: true,
  ...extra,
});
const travel = (dirX: number, dirZ: number, dStart: number, dEnd: number) => ({ dirX, dirZ, dStart, dEnd });
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) <= e;
const clearance = (bodies: Body[], place: (b: Body, i: number, k: number) => [number, number], samples = 200) => {
  let worst = -Infinity;
  for (let s = 0; s < samples; s++) {
    const k = samples > 1 ? s / (samples - 1) : 0.5;
    const at = bodies.map((b, i) => place(b, i, k));
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = { ...bodies[i], x: at[i][0], z: at[i][1] },
          b = { ...bodies[j], x: at[j][0], z: at[j][1] };
        worst = Math.max(worst, penetration(a, b).depth + MARGIN);
      }
  }
  return worst;
};
/** Worst margin violation over shared samples of positionAt; <= 0 means every pair kept its clearance. */
const worstAlong = (bodies: Body[], samples = 200) => clearance(bodies, (b, _, k) => positionAt(b, k), samples);

const square = box(0, 0, 1);
let p = penetration(square, box(1.5, 0, 1));
assert(near(p.depth, 0.5) && near(p.nx, 1) && near(p.nz, 0), "Axis-aligned overlap pushes b along +x");
p = penetration(square, box(0, -1.2, 1));
assert(near(p.depth, 0.8) && near(p.nx, 0) && near(p.nz, -1), "The normal points from a to b");
assert(near(penetration(square, box(3, 0, 1)).depth, -1), "Separated footprints report the gap as negative depth");
// heading pi/2 turns local +x (the model's depth) onto world -z.
const beam = box(0, 0, 2, 0.5, Math.PI / 2);
p = penetration(beam, box(0, 1.8, 0.3));
assert(near(p.depth, 0.5) && near(p.nx, 0) && near(p.nz, 1), "Rotated footprint spans its depth along world z");
assert(near(penetration(beam, box(1, 0, 0.3)).depth, -0.2), "Rotated footprint stays narrow along world x");
const rail = box(0, 0, 5, 0.2, Math.PI / 4);
const crate = box(2, 2, 0.3);
assert(Math.hypot(crate.x, crate.z) < Math.hypot(5, 0.2) + Math.hypot(0.3, 0.3), "Bounding circles do overlap");
p = penetration(rail, crate);
assert(
  near(p.depth, -(2 * Math.SQRT2 - 0.2 - 0.3 * Math.SQRT2), 1e-9),
  "A long thin diagonal clears a crate beside it",
);
p = penetration(rail, box(3.1, -2.9, 0.3));
assert(p.depth > 0.4 && near(p.nx, Math.SQRT1_2) && near(p.nz, Math.SQRT1_2), "Overlap along a diagonal rail");
const q = penetration(box(3.1, -2.9, 0.3), rail);
assert(near(q.depth, p.depth) && near(q.nx, -p.nx) && near(q.nz, -p.nz), "Penetration is antisymmetric");
const twin = penetration(box(1, 1, 0.6, 0.3, 0.7), box(1, 1, 0.6, 0.3, 0.7));
assert.deepEqual(twin, penetration(box(1, 1, 0.6, 0.3, 0.7), box(1, 1, 0.6, 0.3, 0.7)));
assert(near(twin.depth, 0.6) && near(twin.nx, Math.sin(0.7)) && near(twin.nz, Math.cos(0.7)), "Twins part sideways");
console.log("PASS SAT depth and normals for axis-aligned, rotated, long thin and coincident footprints");

const walker = box(1, 2, 0.5, 0.25, 0, { motion: travel(0.6, 0.8, -5, 10) });
const [sx, sz] = positionAt(walker, 0),
  [ex, ez] = positionAt(walker, 1),
  [rx, rz] = positionAt(walker, 1 / 3);
assert(near(sx, -2) && near(sz, -2) && near(ex, 7) && near(ez, 10) && near(rx, 1) && near(rz, 2), "Linear travel");
const circles = sweptCircles(walker);
assert(near(circles[0].x, -2) && near(circles.at(-1)!.z, 10) && near(circles[0].r, Math.hypot(0.5, 0.25) + 0.3));
for (let i = 1; i < circles.length; i++)
  assert(Math.hypot(circles[i].x - circles[i - 1].x, circles[i].z - circles[i - 1].z) <= 0.25 + 1e-9);
assert.deepEqual(sweptCircles(box(4, 5, 1, 2), 0.5), [{ x: 4, z: 5, r: Math.hypot(1, 2) + 0.5 }]);
console.log("PASS positionAt and swept circles cover the whole path at footprint spacing");

const rng = makeRng(7);
const pile: Body[] = Array.from({ length: 30 }, (_, i) =>
  box((rng() - 0.5) * 3, (rng() - 0.5) * 3, 0.3 + rng() * 0.5, 0.3 + rng() * 0.5, rng() * Math.PI * 2, {
    priority: i % 3,
  }),
);
pile[0] = box(-2.5, 0, 0.6, 0.6, 0.3, { movable: false });
pile[1] = box(2.5, 0.2, 0.5, 0.8, 1.1, { movable: false });
pile[2] = box(0, 0, 0.7, 0.4, 0.6, { movable: false, priority: 0 });
const anchors = pile.slice(0, 3).map((b) => ({ ...b }));
const piled = resolveLayout(pile);
assert(piled.overlapsBefore > 30, `A dense pile starts heavily overlapped (${piled.overlapsBefore})`);
assert.equal(piled.overlapsAfter, 0);
assert(worstAlong(pile, 1) <= 1e-6, "Every pair keeps the margin");
assert.deepEqual(pile.slice(0, 3), anchors, "Immovable bodies never move");
console.log(`PASS pile of 30 separated (${piled.overlapsBefore} overlaps -> 0) with immovable bodies untouched`);

const keep = box(0, 0, 1, 1, 0, { priority: 5 }),
  yieldTo = box(1.2, 0.3, 1, 1, 0.4, { priority: 1 });
resolveLayout([keep, yieldTo]);
assert(keep.x === 0 && keep.z === 0, "Higher priority stays");
assert(penetration(keep, yieldTo).depth <= -MARGIN + 1e-6);
const left = box(0, 0, 1),
  right = box(1, 0.2, 1);
resolveLayout([left, right]);
assert(near(Math.hypot(left.x, left.z), Math.hypot(right.x - 1, right.z - 0.2)), "Equal priorities share the push");
const pier = box(0, 0, 1, 1, 0, { movable: false, priority: 0 }),
  barge = box(0.5, 0, 1, 1, 0, { priority: 9 });
resolveLayout([pier, barge]);
assert(pier.x === 0 && barge.x > 1.9, "An immovable body holds even against higher priority");
console.log("PASS priority: lower priority yields, equals share, immovable holds");

const wall = (b: Body, x: number, z: number): [number, number] => [Math.min(x, 0), z];
const big = box(-1.5, 0, 1, 1, 0, { priority: 3 }),
  small = box(-0.5, 0, 0.6, 0.6, 0, { priority: 1 });
resolveLayout([big, small], { clamp: wall });
assert(small.x <= 0 && big.x < -1.5, "A pinned low-priority body hands the remaining push to the other");
assert(penetration(big, small).depth <= -MARGIN + 1e-6);
const room = (b: Body, x: number, z: number): [number, number] => {
  const r = Math.hypot(x, z),
    lim = 4 - Math.hypot(b.hx, b.hz);
  return r > lim ? [(x * lim) / r, (z * lim) / r] : [x, z];
};
const crowd = Array.from({ length: 14 }, () => box((rng() - 0.5) * 2, (rng() - 0.5) * 2, 0.4, 0.3, rng() * 6));
const roomed = resolveLayout(crowd, { clamp: room });
assert(
  crowd.every((b) => Math.hypot(b.x, b.z) <= 4 - Math.hypot(b.hx, b.hz) + 1e-9),
  "Clamp holds every push",
);
assert.equal(roomed.overlapsAfter, 0);
console.log("PASS clamp respected on every push (wall and round room)");

const strider = box(0, 0, 0.5, 0.5, 0, { motion: travel(1, 0, -10, 10) });
const rock = box(6, 0, 0.5, 0.5, 0, { movable: false });
const laned = resolveLayout([strider, rock]);
assert.equal(laned.pathsShifted, 1);
assert.equal(laned.pathsClipped, 0);
assert(strider.x === 0 && near(strider.z, 1.5), `Smallest clearing lane is taken (z=${strider.z})`);
assert.deepEqual(strider.motion, travel(1, 0, -10, 10), "A lane shift keeps the full travel");
assert(worstAlong([strider, rock]) <= 1e-6);
console.log("PASS mover crossing a static body shifts to the nearest clear lane");

const corridor = () => [box(0, 4, 20, 3, 0, { movable: false }), box(0, -4, 20, 3, 0, { movable: false })];
const boxed = box(0, 0, 0.5, 0.5, 0, { motion: travel(1, 0, -10, 10) });
const boxedScene = [
  boxed,
  ...corridor(),
  box(6, 0, 0.5, 0.8, 0, { movable: false }),
  box(-4, 0, 0.5, 0.8, 0, { movable: false }),
];
const clipped = resolveLayout(boxedScene);
assert.equal(clipped.pathsShifted, 0);
assert.equal(clipped.pathsClipped, 1);
assert.equal(clipped.overlapsAfter, 0);
const { dStart, dEnd } = boxed.motion!;
assert(dEnd > 4.7 && dEnd < 4.85 && dStart < -2.7 && dStart > -2.85, `Largest clear interval [${dStart}, ${dEnd}]`);
assert(worstAlong(boxedScene) <= 1e-6, "No sample of the clipped path comes within the margin");
console.log(`PASS boxed-in mover clipped to [${dStart.toFixed(3)}, ${dEnd.toFixed(3)}] with no overlap at 200 samples`);

const column = [0, -1.5].flatMap((x) =>
  [-1.2, 0, 1.2].map((z) => box(x, z, 0.4, 0.4, 0, { group: 3, motion: travel(1, 0, -8, 8) })),
);
const offsets = column.map((b) => [b.x - column[0].x, b.z - column[0].z]);
const post = box(7, 0, 0.6, 0.6, 0, { movable: false });
const marched = resolveLayout([...column, post]);
assert.equal(marched.pathsShifted, column.length);
assert(
  column.every((b, i) => near(b.x - column[0].x, offsets[i][0]) && near(b.z - column[0].z, offsets[i][1])),
  "The formation keeps its shape",
);
assert(
  column.every((b) => b.motion!.dStart === -8 && b.motion!.dEnd === 8),
  "Members keep identical travel",
);
assert(near(column[0].z, -1.2 + 2.4), `Whole formation steps clear (z=${column[0].z})`);
assert(worstAlong([...column, post]) <= 1e-6);
console.log("PASS formation shifts as one rigid group and clears the obstacle");

const east = box(-3, 0, 0.6, 0.4, 0, { group: 1, priority: 2, motion: travel(1, 0, -5, 5) });
const west = box(3, 0, 0.6, 0.4, Math.PI, { group: 2, priority: 1, motion: travel(-1, 0, -5, 5) });
const met = resolveLayout([east, west]);
assert(east.x === -3 && east.z === 0 && east.motion!.dEnd === 5, "Higher priority keeps its path");
assert.equal(met.pathsShifted, 1);
assert(worstAlong([east, west]) <= 1e-6, "Opposing movers never meet at a shared sample");
console.log("PASS head-on movers in the open: the lower priority steps aside");

const north = box(-3, 0, 0.5, 0.5, 0, { priority: 2, motion: travel(1, 0, -5, 5) });
const south = box(3, 0, 0.5, 0.5, Math.PI, { priority: 1, motion: travel(-1, 0, -5, 5) });
const street = [north, south, ...corridor()];
const original = street.map((b) => ({ ...b.motion! }));
const jammed = resolveLayout(street);
assert.equal(jammed.pathsShifted, 0);
assert.equal(jammed.pathsClipped, 2);
assert(north.x === -3 && south.x === 3, "Clipping never moves a rest position");
assert(worstAlong(street) <= 1e-6, "No overlap under positionAt timing");
const engineTiming = clearance(street, (b, i, k) => {
  const m = b.motion,
    o = original[i];
  if (!m || !o) return [b.x, b.z];
  const d = Math.min(
    Math.max(o.dStart + (o.dEnd - o.dStart) * k, Math.min(m.dStart, m.dEnd)),
    Math.max(m.dStart, m.dEnd),
  );
  return [b.x + m.dirX * d, b.z + m.dirZ * d];
});
assert(engineTiming <= 1e-6, "No overlap when the original timing is held inside the clipped interval");
console.log(
  `PASS head-on in a narrow street: both clip (north [${north.motion!.dStart.toFixed(2)}, ${north.motion!.dEnd.toFixed(2)}],` +
    ` south [${south.motion!.dStart.toFixed(2)}, ${south.motion!.dEnd.toFixed(2)}]) with no overlap in either timing`,
);

const scene = (seed: number, statics: number, movers: number) => {
  const r = makeRng(seed);
  const out: Body[] = [];
  for (let i = 0; i < statics; i++)
    out.push(
      box((r() - 0.5) * 80, (r() - 0.5) * 80, 0.3 + r() * 2.5, 0.3 + r() * 2.5, r() * Math.PI * 2, {
        priority: Math.floor(r() * 3),
        movable: r() > 0.1,
      }),
    );
  for (let i = 0; i < movers; i++) {
    const group = i < 12 ? Math.floor(i / 6) : undefined;
    const a = group === undefined ? r() * Math.PI * 2 : group * 2.1;
    const base = group === undefined ? [(r() - 0.5) * 50, (r() - 0.5) * 50] : [group * 20 - 10, 0];
    const slot = group === undefined ? [0, 0] : [(i % 3) * 1.4, Math.floor((i % 6) / 3) * 1.4];
    const reach = group === undefined ? 5 + r() * 10 : 8 + group * 3;
    out.push(
      box(base[0] + slot[0], base[1] + slot[1], 0.5, 0.35, -a, {
        group,
        priority: 1 + Math.floor(r() * 3),
        motion: travel(Math.cos(a), Math.sin(a), -reach, reach),
      }),
    );
  }
  return out;
};
const first = scene(11, 60, 10),
  second = structuredClone(first);
assert.deepEqual(resolveLayout(first), resolveLayout(second));
assert.deepEqual(first, second, "Identical input yields identical layout");
console.log("PASS deterministic: deep copies resolve identically");

const busy = scene(5, 140, 20);
let t0 = performance.now();
const report = resolveLayout(busy);
const cold = performance.now() - t0;
const runs: number[] = [];
for (let i = 0; i < 20; i++) {
  const copy = scene(5, 140, 20);
  t0 = performance.now();
  resolveLayout(copy);
  runs.push(performance.now() - t0);
}
runs.sort((a, b) => a - b);
const median = runs[runs.length >> 1];
assert(cold < 50, `160 bodies with 20 movers resolve in under 50 ms (cold ${cold.toFixed(2)} ms)`);
assert(median < 20, `Warm runs stay well under 20 ms (median ${median.toFixed(2)} ms)`);
for (let i = 0; i < busy.length; i++)
  for (let j = i + 1; j < busy.length; j++)
    if (penetration(busy[i], busy[j]).depth > -MARGIN + 1e-6)
      assert(!busy[i].movable && !busy[j].movable, "Only immovable pairs may still overlap at rest");
const movers = busy.filter((b) => b.motion),
  fixed = busy.filter((b) => !b.motion);
assert(worstAlong(movers) <= 1e-6, "Movers keep the margin from each other along the whole scene");
for (let s = 0; s < 200; s++)
  for (const m of movers) {
    const [x, z] = positionAt(m, s / 199);
    for (const f of fixed) assert(penetration({ ...m, x, z }, f).depth <= -MARGIN + 1e-6, "Paths stay clear");
  }
console.log(
  `PASS 160 bodies / 20 movers: cold ${cold.toFixed(2)} ms, warm median ${median.toFixed(2)} ms, max ${runs.at(-1)!.toFixed(2)} ms` +
    ` (overlaps ${report.overlapsBefore} -> ${report.overlapsAfter}, shifted ${report.pathsShifted}, clipped ${report.pathsClipped})`,
);

const wing: StageProp = { x: 0, z: 0, hx: 6, hz: 1.2, heading: 0 };
const stray: StageFigure = { x: 0, z: 8, radius: 0.4, role: "subject" };
assert.equal(stageBeside([stray], wing), 1, "A person metres in front of the subject is moved");
assert(Math.abs(stray.z) < 1.5, `They leave the lens (z ${stray.z.toFixed(2)})`);
assert(Math.abs(stray.x) > wing.hx, "They stand off the subject's flank");
const beside: StageFigure = { x: 6.8, z: 0, radius: 0.4, role: "subject" };
const kept = { ...beside };
assert.equal(stageBeside([beside], wing), 0, "Someone already at the wing is left there");
assert.deepEqual(beside, kept);
const witness: StageFigure = { x: 0, z: 14, radius: 0.4, role: "foreground" };
stageBeside([witness], wing);
assert(witness.z < 4 && witness.z > 1, `A witness comes closer without joining the crew (z ${witness.z.toFixed(2)})`);
assert(Math.abs(witness.x) > 5, "A witness steps off the centre line");
const pilot: StageFigure = { x: 4, z: 3, radius: 0.4, role: "subject", aboard: true };
assert.equal(stageBeside([pilot], wing), 1, "A lying figure is moved onto the machine");
assert(Math.hypot(pilot.x, pilot.z) < 0.01, `The lying figure is on the machine (${pilot.x}, ${pilot.z})`);
const span: StageProp = { x: 0, z: 0, hx: 2, hz: 6, heading: 0 };
const lying: StageFigure = { x: 1, z: 1, radius: 0.4, role: "subject", aboard: true };
assert.equal(stageBeside([lying], span), 1, "A lying figure is moved onto a wide machine");
assert(lying.z > 2 && lying.z < 6, `The lying figure rests on the near half (z ${lying.z.toFixed(2)})`);
const runner: StageFigure = { x: 0, z: 0, radius: 0.4, role: "subject" };
assert.equal(stageBeside([runner], span), 1, "A person under a wide footprint is moved");
assert(runner.z > 6, `They stand off the span (z ${runner.z.toFixed(2)})`);
assert(Math.abs(runner.x) <= 2, `They stay alongside the body (x ${runner.x.toFixed(2)})`);
const company = Array.from({ length: 6 }, (_, i) => ({ x: i * 3, z: 12, radius: 0.4, role: "subject" as const }));
const before = company.map((figure) => ({ ...figure }));
assert.equal(stageBeside(company, wing), 0, "A crowd keeps its formation");
assert.deepEqual(company, before);
const load: StageProp = { x: 0, z: 0, hx: 3, hz: 1, heading: 0 };
const haulers = Array.from({ length: 8 }, (_, i) => ({
  x: -8,
  z: i,
  radius: 0.35,
  role: "subject" as const,
  crew: true,
}));
assert.equal(stageCrew(haulers, load), 8, "A crew is lined up on the load");
for (const person of haulers) {
  assert(person.x > load.hx, `The crew is ahead of the load (x ${person.x.toFixed(2)})`);
  assert(Math.abs(person.z) < 1.2, `The crew stays with the load (z ${person.z.toFixed(2)})`);
}
const backer: StageFigure = { x: 0, z: 0, radius: 0.35, role: "subject", crew: true };
assert.equal(stageCrew([backer], load, -1), 1);
assert(backer.x < -load.hx, `Backing up puts the crew behind the load (x ${backer.x.toFixed(2)})`);
const bystander: StageFigure = { x: 9, z: 9, radius: 0.35, role: "subject" };
assert.equal(stageCrew([bystander], load), 0, "Someone who is not on the crew stays put");
assert.equal(bystander.x, 9);
const planted: StageFigure = { x: 8, z: 0, radius: 0.35, role: "subject", crew: true };
assert.equal(stageBeside([planted], wing), 0, "A crew member is not pulled off the load");
assert.equal(planted.x, 8);
assert.equal(
  deckTop([
    { shape: "box", size: [4, 0.08, 0.1] as [number, number, number], position: [0, 0.2, 0] },
    { shape: "box", size: [0.12, 1.2, 0.12] as [number, number, number], position: [0, 0, 0] },
  ]),
  null,
  "A beam or a post is not a surface, even when it is named like one",
);
assert.equal(
  deckTop([
    { shape: "box", size: [1.6, 0.1, 0.9] as [number, number, number], position: [0, 0.8, 0], anchor: "bottom" },
    { shape: "box", size: [2, 0.08, 1.2] as [number, number, number], position: [0, 0.4, 0], anchor: "center" },
  ]),
  0.44,
  "A lying figure uses the lowest broad slab, whatever it is called",
);
