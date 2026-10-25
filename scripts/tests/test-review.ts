import assert from "node:assert/strict";
import { ModelLibrary } from "../../lib/lowpoly/compiler";
import { shotIssues, type ShotSnapshot, type UnitSnapshot } from "../../lib/lowpoly/shot-audit";
import { normalizeModelDefinition, type ModelDefinition } from "../../lib/schema/model";

const model = (id: string, parts: unknown[]): ModelDefinition =>
  normalizeModelDefinition({
    id,
    name: id,
    category: "prop",
    placement: "ground",
    materials: [{ id: "wood", color: "#8a6a4a", finish: "matte" }],
    parts,
  });

// Loose parts: a table holds together; a lamp hovering half a metre above it does not.
const table = model("table", [
  { id: "top", shape: "box", material: "wood", size: [2, 0.1, 1], position: [0, 0.75, 0] },
  { id: "leg", shape: "box", material: "wood", size: [0.1, 0.7, 0.1], position: [0.9, 0.35, 0.4], mirror: "x" },
]);
const floating = model("floating", [
  ...table.parts,
  { id: "lamp", shape: "sphere", material: "wood", size: [0.3, 0.3, 0.3], position: [0, 1.5, 0] },
]);
// Separate stones resting on the ground are not loose: the ground connects them.
const stones = model("stones", [
  { id: "a", shape: "ico", material: "wood", size: [0.4, 0.3, 0.4], position: [0, 0.15, 0] },
  { id: "b", shape: "ico", material: "wood", size: [0.4, 0.3, 0.4], position: [1.2, 0.15, 0.3] },
]);
const lib = new ModelLibrary([table, floating, stones]);
assert.deepEqual(lib.structure("table").detached, []);
assert.deepEqual(lib.structure("stones").detached, []);
const loose = lib.structure("floating").detached;
assert.equal(loose.length, 1);
assert.deepEqual(loose[0].parts, ["lamp"]);
assert.ok(loose[0].gap > 0.5 && loose[0].gap < 0.8, `gap ${loose[0].gap}`);
lib.dispose();

// Shot audit.
const unit = (over: Partial<UnitSnapshot>): UnitSnapshot => ({
  element: 0,
  model: "m",
  role: "subject",
  solid: true,
  placement: "ground",
  span: false,
  x: 0,
  z: 0,
  heading: 0,
  hx: 1,
  hz: 1,
  y0: 0,
  y1: 2,
  screen: { x0: 0.3, y0: 0.3, x1: 0.6, y1: 0.7 },
  ...over,
});
const shot = (units: UnitSnapshot[], over: Partial<ShotSnapshot> = {}): ShotSnapshot => ({
  scene: 0,
  at: 0.5,
  camera: { x: 0, y: 1.6, z: 20 },
  units,
  ...over,
});
const kinds = (s: ShotSnapshot[]) => shotIssues(s).map((i) => i.kind);

assert.deepEqual(kinds([shot([unit({}), unit({ element: 1, model: "n", x: 2.3 })])]), []);
const crash = shotIssues([shot([unit({}), unit({ element: 1, model: "n", x: 0.8, heading: 0.5 })])]);
assert.deepEqual(
  crash.map((i) => [i.kind, i.elements]),
  [["overlap", [0, 1]]],
);
// Repeated in several samples, one issue; a boat under a bridge and a rug underfoot are fine.
assert.equal(
  shotIssues([
    shot([unit({}), unit({ element: 1, x: 0.5 })]),
    shot([unit({}), unit({ element: 1, x: 0.5 })], { at: 0.9 }),
  ]).length,
  1,
);
assert.deepEqual(
  kinds([shot([unit({ span: true, placement: "water", hx: 20 }), unit({ element: 1, placement: "water" })])]),
  [],
);
assert.deepEqual(kinds([shot([unit({}), unit({ element: 1, solid: false, y1: 0.1 })])]), []);
// Stacked vertically without overlapping heights is fine.
assert.deepEqual(kinds([shot([unit({}), unit({ element: 1, y0: 2.5, y1: 4 })])]), []);
// Camera inside a model, subject off screen, subject a speck.
assert.deepEqual(kinds([shot([unit({ z: 20, hz: 2 })])]), ["camera_inside"]);
assert.deepEqual(kinds([shot([unit({ screen: { x0: 1.2, y0: 0.3, x1: 1.5, y1: 0.6 } })])]), ["subject_offscreen"]);
assert.deepEqual(kinds([shot([unit({ screen: null })])]), ["subject_offscreen"]);
assert.deepEqual(kinds([shot([unit({ screen: { x0: 0.5, y0: 0.5, x1: 0.52, y1: 0.54 } })], { shotSize: "medium" })]), [
  "subject_small",
]);
assert.deepEqual(kinds([shot([unit({ screen: { x0: 0.5, y0: 0.5, x1: 0.53, y1: 0.57 } })], { shotSize: "wide" })]), []);
// Background scenery never triggers framing issues.
assert.deepEqual(kinds([shot([unit({ role: "background", screen: null })])]), []);

console.log(
  "PASS loose-part detection (attached, floating, ground-resting) and shot audit (overlap, spans, camera, framing)",
);
