import assert from "node:assert/strict";
import * as THREE from "three";
import { makeShot } from "../../lib/lowpoly/camera";
for (const portrait of [false, true])
  for (const index of [0, 1]) {
    const shot = makeShot({
      move: "tracking",
      shotSize: "medium",
      immersive: true,
      portrait,
      index,
      seed: 42,
      focus: new THREE.Vector3(),
      radius: 1,
      height: 2,
      aerial: false,
      corridor: null,
      obstacles: [],
      heightAt: () => 0,
    });
    const camera = new THREE.PerspectiveCamera(shot.fov, portrait ? 9 / 16 : 16 / 9, shot.near, 100);
    for (const t of [0, 1.25, 2.5, 3.75, 5]) {
      shot.place(camera, t, 5);
      camera.updateMatrixWorld();
      const projected = new THREE.Vector3(0, 1, 0).project(camera);
      assert(
        Math.abs(projected.x) < 0.04,
        "Tracking must retain the action at frame center instead of panning away from it",
      );
    }
  }
console.log("PASS tracking retains focal action through lateral movement in both formats");

import { sceneDressingModels } from "../../lib/lowpoly/world";
const phases = [
  { elements: [{ model: "old_houses" }] },
  { elements: [{ model: "workers" }] },
  { elements: [{ model: "new_houses" }] },
];
assert.deepEqual(sceneDressingModels(phases, 0, ["old_houses", "new_houses"]), ["old_houses"]);
assert.deepEqual(
  sceneDressingModels(phases, 1, ["old_houses", "new_houses"]),
  ["old_houses"],
  "Detail shots inherit their established historical surroundings",
);
assert.deepEqual(
  sceneDressingModels(phases, 2, ["old_houses", "new_houses"]),
  ["new_houses"],
  "Later rebuilding replaces the previous architectural phase",
);
console.log("PASS scenery respects scene chronology without mixing future buildings into earlier scenes");

const facade = makeShot({
  move: "static",
  shotSize: "medium",
  immersive: true,
  portrait: true,
  index: 0,
  seed: 42,
  focus: new THREE.Vector3(),
  radius: 3,
  height: 9,
  aerial: false,
  corridor: null,
  obstacles: [],
  heightAt: () => 0,
  viewAzimuth: -Math.PI / 2,
});
const facadeCamera = new THREE.PerspectiveCamera(facade.fov, 9 / 16, facade.near, 100);
facade.place(facadeCamera, 2, 6);
assert(
  facadeCamera.position.x < -Math.abs(facadeCamera.position.z) * 2,
  "A facade-facing shot must view the authored front instead of the gable",
);
console.log("PASS architectural view respects facade direction");

const streetFocus = new THREE.Vector3(6, 0, 0);
const constrained = makeShot({
  move: "static",
  shotSize: "wide",
  immersive: true,
  portrait: true,
  index: 0,
  seed: 42,
  focus: streetFocus,
  radius: 6,
  height: 13,
  aerial: false,
  viewAzimuth: -Math.PI / 2,
  corridor: { cx: 0, cz: 0, halfWidth: 3, front: 100, back: 100, paved: true },
  obstacles: [{ x: 50, z: 50, r: 1, h: 20 }],
  heightAt: () => 0,
});
const constrainedCamera = new THREE.PerspectiveCamera(constrained.fov, 9 / 16, constrained.near, 100);
constrained.place(constrainedCamera, 1, 6);
assert(Math.abs(constrainedCamera.position.x) <= 2.55 + 1e-6, "Lens stays in the street");
assert(
  Math.hypot(constrainedCamera.position.x - streetFocus.x, constrainedCamera.position.z - streetFocus.z) >=
    constrained.distance * 0.98,
  "Street collision preserves fitted subject distance",
);
console.log("PASS street collision retains wide-shot clearance");

// A camera can stand outside a facade while still looking straight into it.
const occludedSpec = {
  move: "static" as const,
  shotSize: "wide" as const,
  immersive: true,
  portrait: true,
  index: 0,
  seed: 42,
  focus: new THREE.Vector3(),
  radius: 3,
  height: 8,
  aerial: false,
  corridor: null,
  obstacles: [] as { x: number; z: number; r: number; h: number }[],
  heightAt: () => 0,
};
const originalView = makeShot(occludedSpec);
const originalCamera = new THREE.PerspectiveCamera();
originalView.place(originalCamera, 2, 6);
const obstruction = { x: originalCamera.position.x * 0.7, z: originalCamera.position.z * 0.7, r: 2, h: 12 };
const clearView = makeShot({ ...occludedSpec, obstacles: [obstruction] });
const clearCamera = new THREE.PerspectiveCamera();
for (const t of [0, 1, 2, 3, 4, 5]) {
  clearView.place(clearCamera, t, 6);
  const dx = -clearCamera.position.x,
    dz = -clearCamera.position.z;
  const u = Math.max(
    0,
    Math.min(
      1,
      ((obstruction.x - clearCamera.position.x) * dx + (obstruction.z - clearCamera.position.z) * dz) /
        (dx * dx + dz * dz),
    ),
  );
  assert(
    Math.hypot(clearCamera.position.x + u * dx - obstruction.x, clearCamera.position.z + u * dz - obstruction.z) >
      obstruction.r,
    "Foreground architecture must not blank the subject sightline",
  );
}
console.log("PASS camera clears foreground architecture from subject sightline");

const broadShot = makeShot({ ...occludedSpec, move: "eye_level", radius: 15, height: 20 });
const broadCamera = new THREE.PerspectiveCamera(broadShot.fov, 16 / 9, broadShot.near, 1000);
broadShot.place(broadCamera, 2, 6);
broadCamera.updateMatrixWorld(true);
const broadCenter = new THREE.Vector3(0, 9, 0).project(broadCamera);
assert(Math.abs(broadCenter.y) < 0.05, "A wide shot aims at the whole subject, not its ground-level base");
console.log("PASS broad architectural subjects retain centered wide-shot framing");
