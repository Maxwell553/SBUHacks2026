import assert from "node:assert/strict";
import * as THREE from "three";
import { trussGeometry } from "../lib/lowpoly/truss";
import { normalizeModelDefinition, trianglesOf } from "../lib/schema/model";
import { ModelLibrary } from "../lib/lowpoly/compiler";
const geometry = trussGeometry([4, 8, 4], 3, 1, 0.1);
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const mesh = new THREE.Mesh(geometry, material);
mesh.updateMatrixWorld(true);
const cast = (x: number, y: number) =>
  new THREE.Raycaster(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1)).intersectObject(mesh);
assert.equal(cast(0, 2.1).length, 0, "The lattice must have genuine open bays, not opaque walls");
assert(cast(2, 2.1).length > 0, "Corner posts must remain solid structural members");
const model = normalizeModelDefinition({
  id: "open_frame",
  name: "Open frame",
  category: "structure",
  placement: "ground",
  materials: [{ id: "iron", color: "#888888", finish: "metal" }],
  parts: [
    {
      id: "frame",
      shape: "truss",
      material: "iron",
      size: [4, 8, 4],
      segments: 3,
      taper: 1,
      beamWidth: 0.1,
      anchor: "bottom",
    },
  ],
});
assert.equal(geometry.index!.count / 3, trianglesOf(model.parts[0]), "Complexity estimates must include every beam");
const library = new ModelLibrary([model]);
const instance = library.instance(model.id)!;
const bounds = new THREE.Box3().setFromObject(instance.object);
assert(Math.abs(bounds.min.y) < 1e-6, "Anchoring must include beam thickness");
assert(bounds.max.y > 8 && bounds.max.y < 8.2);
const tapered = trussGeometry([4, 8, 4], 3, 0.2, 0.1);
const vertices = tapered.getAttribute("position");
let topWidth = 0;
for (let i = 0; i < vertices.count; i++) {
  assert(Number.isFinite(vertices.getX(i) + vertices.getY(i) + vertices.getZ(i)));
  if (vertices.getY(i) > 3.9) topWidth = Math.max(topWidth, Math.abs(vertices.getX(i)));
}
assert(topWidth < 0.6, "Taper must narrow the upper silhouette");
const again = trussGeometry([4, 8, 4], 3, 0.2, 0.1);
assert.deepEqual(again.getAttribute("position").array, vertices.array, "Geometry must be deterministic");
geometry.dispose();
tapered.dispose();
again.dispose();
material.dispose();
instance.dispose();
library.dispose();
console.log("PASS open bays, solid posts, exact triangle budget, anchors, taper and deterministic truss geometry");

const repeatedFrame = {
  id: "complete_frame",
  name: "Complete frame",
  category: "structure",
  placement: "ground",
  materials: [{ id: "iron", color: "#776655", finish: "metal" }],
  parts: [
    {
      id: "legs",
      shape: "truss",
      size: [1, 5, 1],
      material: "iron",
      repeat: { mode: "linear", count: 12, step: [2, 0, 0] },
    },
    { id: "upper", shape: "truss", size: [2, 8, 2], position: [0, 5, 0], material: "iron" },
    { id: "crown", shape: "cone", size: [1, 2, 1], position: [0, 13, 0], material: "iron" },
  ],
};
const complete = normalizeModelDefinition(repeatedFrame, "model", { requireComplete: true });
assert.deepEqual(
  complete.parts.map((p) => p.id),
  ["legs", "upper", "crown"],
  "Budget adaptation preserves the whole silhouette",
);
assert((complete.parts[0].segments ?? 8) < 8, "Repeated lattice is simplified before structural parts are removed");
assert.throws(
  () =>
    normalizeModelDefinition(
      {
        ...repeatedFrame,
        parts: [{ ...repeatedFrame.parts[0], repeat: { mode: "linear", count: 32, step: [2, 0, 0] } }],
      },
      "model",
      { requireComplete: true },
    ),
  /remove structural parts/,
  "An impossible budget must trigger reconstruction, not silently accept a partial object",
);
console.log("PASS complete silhouette retained under budget pressure; impossible models rejected");

const planarFrame = trussGeometry([11, 6, 0.2], 3, 1);
planarFrame.computeBoundingBox();
assert(planarFrame.boundingBox!.max.z > 0.14, "Shallow structural frames need visible beam thickness");
assert(planarFrame.boundingBox!.max.z <= 0.151, "Planar beams remain bounded by frame depth");
const explicitFrame = trussGeometry([11, 6, 0.2], 3, 1, 0.02);
explicitFrame.computeBoundingBox();
assert(explicitFrame.boundingBox!.max.z < 0.111, "Explicit fine structural detailing stays under author control");
assert.equal(planarFrame.index!.count, explicitFrame.index!.count, "Improved visibility adds no triangles");
planarFrame.dispose();
explicitFrame.dispose();
console.log("PASS planar frame visibility, explicit beam widths and unchanged complexity");
