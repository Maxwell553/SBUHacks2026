import assert from "node:assert/strict";
import * as THREE from "three";
import { normalizeModelDefinition } from "../../lib/schema/model";
import { framingBounds, groundPlacement, ModelLibrary } from "../../lib/lowpoly/compiler";
import { hasUsefulMotion } from "../../lib/server/motion-quality";
const model = normalizeModelDefinition({
  id: "joint_test",
  name: "Joint test",
  category: "figure",
  placement: "ground",
  scale: 1.7,
  materials: [{ id: "surface", color: "#88aa99", finish: "matte" }],
  parts: [
    {
      id: "limb",
      shape: "box",
      material: "surface",
      size: [0.2, 1, 0.2],
      position: [0, 1, 0],
      rotation: [0, 0, 20],
      animationPivot: [0, 0.5, 0],
      animation: [{ property: "rotation", axis: "z", wave: "sine", amplitude: 40, frequency: 1, when: "moving" }],
    },
  ],
});
const library = new ModelLibrary([model]);
const inst = library.instance(model.id)!;
let mesh: THREE.Mesh | undefined;
inst.object.traverse((o) => {
  if (o instanceof THREE.Mesh) mesh = o;
});
assert(mesh);
const point = (y: number) => {
  inst.object.updateMatrixWorld(true);
  return mesh!.localToWorld(new THREE.Vector3(0, y, 0));
};
const state = { time: 0, progress: 0, moving: true, night: false, phase: 0 };
inst.update(state);
const hinge = point(0.5),
  tip = point(-0.5);
inst.update({ ...state, time: 0.25 });
assert(
  hinge.distanceTo(point(0.5)) < 1e-6,
  "An animated limb must stay attached at its hinge despite its rest rotation and model scale",
);
assert(tip.distanceTo(point(-0.5)) > 0.3, "The free end must visibly move");
inst.update({ ...state, time: 0.25, moving: false });
assert(tip.distanceTo(point(-0.5)) < 1e-6, "Walking stops when the subject is idle");
assert(!hasUsefulMotion(model, true), "One joint is insufficient for a walk cycle");
model.parts[0].mirror = "z";
assert(!hasUsefulMotion(model, true), "A synchronized pair cannot pass as alternating locomotion");
model.parts[0].animation![0].alternate = true;
assert(hasUsefulMotion(model, true), "Mirrored paired joints can supply a walk cycle");
const bob = normalizeModelDefinition({
  ...model,
  parts: [
    {
      ...model.parts[0],
      shape: "group",
      mirror: undefined,
      animation: [{ property: "position", axis: "y", wave: "bounce", amplitude: 0.1, frequency: 1 }],
    },
    { id: "body", parent: "limb", shape: "box", material: "surface", size: [1, 1, 1] },
  ],
});
assert(!hasUsefulMotion(bob, true), "Root bobbing cannot pass as articulated movement");
inst.dispose();
library.dispose();
console.log("PASS fixed physical hinge, visible limb swing, idle gating and useful-motion validation");

// Generated bodies can use a hip-centred, foot-centred or elevated origin.
for (const origin of [-1.2, 0, 1.8]) {
  const groundedModel = normalizeModelDefinition({
    ...model,
    scale: 1.7,
    parts: [{ id: "body", shape: "box", material: "surface", size: [0.5, 2, 0.5], position: [0, origin, 0] }],
  });
  const lib = new ModelLibrary([groundedModel]);
  const body = lib.instance(groundedModel.id)!;
  const placement = groundPlacement(lib.bounds(groundedModel.id), 1.3);
  body.object.scale.multiplyScalar(1.3);
  body.object.position.y = 4 + placement.lift;
  const box = new THREE.Box3().setFromObject(body.object);
  assert(box.min.y >= 3.969 && box.min.y <= 4, "Feet must contact the floor, not be buried or float");
  assert(
    Math.abs(box.getSize(new THREE.Vector3()).y - placement.height) < 1e-5,
    "Framing must use the complete grounded height",
  );
  body.dispose();
  lib.dispose();
}
console.log("PASS ground contact with negative, zero and positive model origins");

const carrier = normalizeModelDefinition({
  id: "carrier",
  name: "Carrier",
  category: "figure",
  placement: "ground",
  materials: [{ id: "surface", color: "#88aa99", finish: "matte" }],
  parts: [
    { id: "foot", shape: "box", material: "surface", size: [0.2, 0.1, 0.3], position: [0, 0.05, 0] },
    { id: "bucket", shape: "box", material: "surface", size: [0.3, 0.4, 0.3], position: [0.5, -0.05, 0] },
  ],
});
const carrierLib = new ModelLibrary([carrier]);
const carrierBounds = carrierLib.bounds(carrier.id);
assert(carrierBounds.minY < -0.2, "The bucket still hangs below the sole");
assert(carrierBounds.plantY > -0.02 && carrierBounds.plantY < 0.02, "The figure is planted on its foot");
carrierLib.dispose();
console.log("PASS a carried prop does not lift the feet off the ground");

// Moving a model's authored origin must not change its visual camera bounds.
let baseline: { radius: number; worldCenter: THREE.Vector3 } | undefined;
for (const shift of [-4, 0, 5]) {
  const m = normalizeModelDefinition({
    ...model,
    parts: [{ id: "body", shape: "box", material: "surface", size: [2, 1, 1], position: [shift, 0.5, 0] }],
  });
  const lib = new ModelLibrary([m]);
  const frame = framingBounds(lib.bounds(m.id), 1.3);
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7);
  const root = new THREE.Vector3(-shift * 1.7 * 1.3, 0, 0).applyQuaternion(rotation);
  const worldCenter = frame.offset.applyQuaternion(rotation).add(root);
  if (baseline) {
    assert(Math.abs(frame.radius - baseline.radius) < 1e-5, "Origin shifts must not widen the camera fit");
    assert(
      worldCenter.distanceTo(baseline.worldCenter) < 1e-5,
      "Follow target must stay on geometry after origin shifts",
    );
  } else baseline = { radius: frame.radius, worldCenter };
  lib.dispose();
}
console.log("PASS origin-independent camera bounds and rotated follow target");

for (const rotation of [0, 90]) {
  const attached = normalizeModelDefinition({
    ...model,
    scale: 1,
    parts: [
      { id: "parent", shape: "box", size: [1, 2, 1], material: "surface", rotation: [0, 0, rotation] },
      {
        id: "child",
        parent: "parent",
        shape: "box",
        size: [0.4, 1, 0.4],
        material: "surface",
        attachTo: "top",
        anchor: "bottom",
        position: [0, 0.8, 0],
      },
      {
        id: "tip",
        parent: "child",
        shape: "box",
        size: [0.2, 0.5, 0.2],
        material: "surface",
        attachTo: "top",
        anchor: "bottom",
        position: [0, 0, 0],
      },
    ],
  });
  const lib = new ModelLibrary([attached]);
  const body = lib.instance(attached.id)!;
  const bounds = new THREE.Box3().setFromObject(body.object);
  assert(
    Math.abs((rotation ? -bounds.min.x : bounds.max.y) - 2.5) < 1e-6,
    "Face attachments must connect chains across parent rotations",
  );
  assert(Math.abs((rotation ? bounds.max.x : -bounds.min.y) - 1) < 1e-6, "Parent geometry must remain unchanged");
  body.dispose();
  lib.dispose();
}
console.log("PASS face attachment chains, anchors and rotated parents");

const explicitlyDetached = normalizeModelDefinition({
  ...model,
  parts: [{ ...model.parts[0], attachTo: "none" }],
});
assert.equal(
  explicitlyDetached.parts[0].attachTo,
  undefined,
  "Provider none means no face attachment, never center attachment",
);
console.log("PASS explicit unconnected provider mode preserves local coordinates");

const oriented = normalizeModelDefinition({
  ...model,
  scale: 1,
  parts: [
    {
      id: "body",
      shape: "box",
      size: [1, 4, 1],
      material: "surface",
      position: [0, 1, 0],
      geometryRotation: [0, 0, 90],
    },
    { id: "foot", parent: "body", shape: "box", size: [0.2, 0.2, 0.2], material: "surface", position: [1.5, -1, 0] },
    {
      id: "crest",
      parent: "body",
      shape: "box",
      size: [0.2, 0.5, 0.2],
      material: "surface",
      attachTo: "top",
      anchor: "bottom",
      position: [0, 0, 0],
    },
  ],
});
const orientedLib = new ModelLibrary([oriented]);
const orientedBody = orientedLib.instance(oriented.id)!;
const orientedBounds = new THREE.Box3().setFromObject(orientedBody.object);
assert(Math.abs(orientedBounds.min.y + 0.1) < 1e-6, "Primitive orientation must not rotate a child's downward offset");
assert(Math.abs(orientedBounds.max.y - 2) < 1e-6, "Attachments use oriented primitive bounds");
assert(Math.abs(orientedBounds.max.x - 2) < 1e-6, "The primitive rotates into a horizontal body");
orientedBody.dispose();
orientedLib.dispose();
console.log("PASS primitive orientation preserves child frames and face attachments");

const tiltedContact = normalizeModelDefinition({
  ...model,
  scale: 1,
  parts: [
    { id: "support", shape: "box", size: [2, 2, 2], material: "surface" },
    {
      id: "tilted",
      parent: "support",
      shape: "box",
      size: [2, 1, 1],
      material: "surface",
      anchor: "bottom",
      attachTo: "top",
      rotation: [0, 0, 45],
    },
  ],
});
const tiltedLib = new ModelLibrary([tiltedContact]);
const tiltedBody = tiltedLib.instance(tiltedContact.id)!;
const tiltedBounds = new THREE.Box3().setFromObject(tiltedBody.object);
assert(
  Math.abs(tiltedBounds.max.y - (1 + Math.SQRT2)) < 1e-6,
  "Tilted attachment pivots at mating face centre, not its lowest rotated corner",
);
tiltedBody.dispose();
tiltedLib.dispose();
console.log("PASS tilted face joints retain contact instead of floating");

// Named hinges remove the center-vs-anchor arithmetic from generated rigs.
for (const anchor of ["center", "top", "bottom"] as const) {
  const hinged = normalizeModelDefinition({
    id: "named_hinge",
    name: "Named hinge",
    category: "figure",
    placement: "ground",
    materials: [{ id: "surface", color: "#88aa99", finish: "matte" }],
    parts: [
      {
        id: "limb",
        shape: "box",
        material: "surface",
        size: [0.2, 1, 0.2],
        anchor,
        animationAnchor: "top",
        animationPivot: [0, 99, 0],
        animation: [{ property: "rotation", axis: "z", wave: "sine", amplitude: 35, frequency: 1, when: "moving" }],
      },
    ],
  });
  const lib = new ModelLibrary([hinged]);
  const item = lib.instance(hinged.id)!;
  let geometry: THREE.Mesh | undefined;
  item.object.traverse((o) => {
    if (o instanceof THREE.Mesh) geometry = o;
  });
  assert(geometry);
  geometry.geometry.computeBoundingBox();
  const localContact = geometry.geometry.boundingBox!.getCenter(new THREE.Vector3());
  localContact.y = geometry.geometry.boundingBox!.max.y;
  item.update({ ...state, time: 0 });
  item.object.updateMatrixWorld(true);
  const start = geometry.localToWorld(localContact.clone());
  item.update({ ...state, time: 0.25 });
  item.object.updateMatrixWorld(true);
  assert(
    start.distanceTo(geometry.localToWorld(localContact.clone())) < 1e-6,
    `${anchor}-anchored limb keeps its named contact fixed`,
  );
  item.dispose();
  lib.dispose();
}
console.log("PASS named hinges retain exact contact for centered, top- and bottom-anchored primitives");

const paired = normalizeModelDefinition({
  id: "paired_hinges",
  name: "Mirrored joints",
  category: "figure",
  placement: "ground",
  materials: [{ id: "surface", color: "#88aa99", finish: "matte" }],
  parts: [
    { id: "hip", shape: "group", size: [0.1, 0.1, 0.1], position: [0, 1, 0.2], mirror: "z" },
    {
      id: "limb",
      parent: "hip",
      shape: "box",
      material: "surface",
      size: [0.1, 0.8, 0.1],
      anchor: "top",
      animationAnchor: "top",
      animation: [
        { property: "rotation", axis: "z", wave: "sine", amplitude: 25, frequency: 1, when: "moving", alternate: true },
      ],
    },
  ],
});
assert(
  hasUsefulMotion(paired, true),
  "Inherited alternating joints must not trigger an unnecessary AI motion-repair request",
);
const pairLib = new ModelLibrary([paired]);
const pair = pairLib.instance(paired.id)!;
pair.update({ ...state, time: 0.25 });
pair.object.updateMatrixWorld(true);
const tips: THREE.Vector3[] = [];
pair.object.traverse((o) => {
  if (o instanceof THREE.Mesh) tips.push(o.localToWorld(new THREE.Vector3(0, -0.8, 0)));
});
assert.equal(tips.length, 2);
assert(tips[0].x * tips[1].x < 0, "Mirrored parent joints must give child limbs opposite gait phases");
assert(Math.abs(tips[0].x + tips[1].x) < 1e-6, "Paired gait has balanced forward/backward travel");
pair.dispose();
pairLib.dispose();
console.log("PASS mirrored parent joints propagate alternating gait to animated children");

for (const shape of ["sphere", "cone"] as const) {
  const curved = normalizeModelDefinition({
    ...model,
    scale: 1,
    parts: [
      { id: "support", shape, size: [2, 2, 2], segments: 16, material: "surface" },
      {
        id: "extension",
        shape: "box",
        size: [0.1, 2, 0.1],
        parent: "support",
        anchor: "bottom",
        attachTo: "top",
        position: [0.5, 0, 0],
        material: "surface",
      },
    ],
  });
  const lib = new ModelLibrary([curved]);
  const body = lib.instance(curved.id)!;
  const bounds = new THREE.Box3().setFromObject(body.object);
  const expected =
    shape === "cone"
      ? 2
      : 2 +
        (1 - (0.5 - Math.sin(Math.PI / 8)) / (Math.sin(Math.PI / 4) - Math.sin(Math.PI / 8))) * Math.cos(Math.PI / 8) +
        ((0.5 - Math.sin(Math.PI / 8)) / (Math.sin(Math.PI / 4) - Math.sin(Math.PI / 8))) * Math.cos(Math.PI / 4);
  assert(
    Math.abs(bounds.max.y - expected) < 1e-5,
    `${shape}: attachment must meet the faceted surface at its offset, not its bounding face`,
  );
  body.dispose();
  lib.dispose();
}
console.log("PASS offset attachments follow curved and tapered surfaces");

const stiff = normalizeModelDefinition({
  id: "stiff_walker",
  name: "Stiff walker",
  category: "figure",
  placement: "ground",
  materials: [{ id: "cloth", color: "#335577", finish: "cloth" }],
  parts: [
    { id: "torso", shape: "box", material: "cloth", size: [0.4, 0.7, 0.25], position: [0, 1.25, 0] },
    {
      id: "leg_l",
      parent: "torso",
      shape: "box",
      material: "cloth",
      size: [0.14, 0.8, 0.14],
      position: [0, -0.75, 0.08],
    },
    {
      id: "hip",
      shape: "group",
      size: [0, 0, 0],
      position: [0, 0.9, 0],
      animation: [
        {
          property: "rotation",
          axis: "z",
          wave: "sine",
          amplitude: 24,
          frequency: 1.6,
          alternate: true,
          when: "moving",
        },
      ],
    },
    {
      id: "leg_r",
      parent: "hip",
      shape: "box",
      material: "cloth",
      size: [0.14, 0.8, 0.14],
      position: [0, -0.4, -0.08],
    },
  ],
});
const stiffLib = new ModelLibrary([stiff]);
const stiffBody = stiffLib.instance("stiff_walker")!;
const pose = () => {
  stiffBody.object.updateWorldMatrix(true, true);
  const points: number[] = [];
  stiffBody.object.traverse((obj) => {
    if (obj instanceof THREE.Mesh)
      points.push(+new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld).y.toFixed(4));
  });
  return points.join(",");
};
const gait = { time: 0, progress: 0, moving: true, night: false, phase: 0 };
stiffBody.update(gait);
const standing = pose();
stiffBody.update({ ...gait, time: 0.18 });
const stepping = pose();
assert.notEqual(standing, stepping, "A figure with no authored cycle still walks");
assert.equal(
  stiff.parts.find((p) => p.id === "leg_l")?.animation,
  undefined,
  "Life is applied at compile, not written back",
);
stiffBody.update({ ...gait, time: 0 });
const rest = pose();
stiffBody.update({ ...gait, time: 0.18, moving: false });
const idle = pose();
assert.notEqual(rest, idle, "A standing figure still shifts its weight");
stiffBody.dispose();
stiffLib.dispose();
console.log("PASS unauthored limbs walk and idle without disturbing an existing cycle");

const plane = normalizeModelDefinition({
  id: "prop_plane",
  name: "Prop plane",
  category: "aircraft",
  placement: "air",
  materials: [{ id: "m", color: "#888888", finish: "matte" }],
  parts: [
    { id: "fuselage", shape: "box", material: "m", size: [2, 0.4, 0.4], position: [0, 1, 0] },
    { id: "propeller", shape: "box", material: "m", size: [0.08, 1.2, 0.06], position: [1.1, 1, 0] },
    { id: "propeller_right", shape: "box", material: "m", size: [0.08, 1.2, 0.06], position: [1.1, 1, 0.8] },
  ],
});
const planeLib = new ModelLibrary([plane]);
const planeBody = planeLib.instance("prop_plane")!;
const bladeTop = () => {
  planeBody.object.updateWorldMatrix(true, true);
  let top = -Infinity;
  const v = new THREE.Vector3();
  planeBody.object.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const pos = obj.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i += 4) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      if (v.y > top) top = v.y;
    }
  });
  return top;
};
const parked = { time: 0, progress: 0, moving: false, night: false, phase: 0 };
planeBody.update(parked);
const still = bladeTop();
planeBody.update({ ...parked, time: 0.08 });
assert(Math.abs(bladeTop() - still) > 0.05, "Propellers turn while the aircraft is parked");
assert.equal(plane.parts[1].animation, undefined, "Propeller spin is not written back into the model");
planeBody.dispose();
planeLib.dispose();
console.log("PASS parked propellers keep turning");

const striker = normalizeModelDefinition({
  id: "striker",
  name: "Striker",
  category: "figure",
  placement: "ground",
  materials: [{ id: "m", color: "#888888", finish: "matte" }],
  parts: [
    { id: "torso", shape: "box", material: "m", size: [0.4, 0.6, 0.25], position: [0, 1, 0] },
    {
      id: "staff_shaft",
      parent: "torso",
      shape: "box",
      material: "m",
      size: [0.04, 1.4, 0.04],
      position: [0.2, 1.6, 0],
      animation: [{ property: "rotation", axis: "z", wave: "sine", amplitude: 80, frequency: 2, when: "always" }],
    },
  ],
});
const strikeLib = new ModelLibrary([striker]);
const strikeBody = strikeLib.instance("striker")!;
const staffTip = (time: number) => {
  strikeBody.update({ time, progress: 0, moving: true, night: false, phase: 0 });
  strikeBody.object.updateMatrixWorld(true);
  let tip = new THREE.Vector3();
  strikeBody.object.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const size = obj.geometry.boundingBox?.getSize(new THREE.Vector3());
    if (!size || size.y < 1) return;
    tip = obj.localToWorld(new THREE.Vector3(0, 0.7, 0));
  });
  return tip;
};
const held = staffTip(0).distanceTo(staffTip(0.125));
assert(held < 0.35, `A held staff stays aimed at the work (${held.toFixed(2)} m)`);
assert.equal(striker.parts[1].animation?.[0].amplitude, 80, "The stored model is not rewritten");
strikeBody.dispose();
strikeLib.dispose();
console.log("PASS a held tool on any figure stays aimed instead of striking the air");

const raised = normalizeModelDefinition({
  id: "raised_arms",
  name: "Raised arms",
  category: "figure",
  placement: "ground",
  materials: [{ id: "m", color: "#c47a4a", finish: "matte" }],
  parts: [
    { id: "torso", shape: "box", material: "m", size: [0.4, 0.5, 0.28], position: [0, 1.1, 0] },
    {
      id: "arm",
      parent: "torso",
      shape: "box",
      material: "m",
      size: [0.12, 0.7, 0.12],
      position: [0.28, 1.35, 0],
      rotation: [0, 0, 80],
    },
  ],
});
const raisedLib = new ModelLibrary([raised]);
const raisedBody = raisedLib.instance("raised_arms")!;
raisedBody.object.updateMatrixWorld(true);
let armSize = new THREE.Vector3();
raisedBody.object.traverse((obj) => {
  if (!(obj instanceof THREE.Mesh)) return;
  obj.geometry.computeBoundingBox();
  const size = obj.geometry.boundingBox!.getSize(new THREE.Vector3());
  if (size.x > 0.2 || size.y < 0.6) return;
  const world = obj.geometry.boundingBox!.clone().applyMatrix4(obj.matrixWorld);
  armSize = world.getSize(new THREE.Vector3());
});
assert(
  armSize.y > armSize.x,
  `A raised arm is eased back toward the body (${armSize.x.toFixed(2)} x ${armSize.y.toFixed(2)})`,
);
assert.equal(raised.parts[1].rotation?.[2], 80, "The stored pose is not rewritten");
raisedBody.dispose();
raisedLib.dispose();
console.log("PASS extreme arms are eased into a reachable pose");
