import assert from "node:assert/strict";
import * as THREE from "three";
import { hasProgressiveMotion, hasUsefulMotion } from "../lib/server/motion-quality";
import { channelValue } from "../lib/lowpoly/motion";
import { ModelLibrary } from "../lib/lowpoly/compiler";
import { normalizeModelDefinition, type ModelChannel } from "../lib/schema/model";
const channel: ModelChannel = {
  property: "position",
  axis: "y",
  wave: "sine",
  amplitude: 4,
  frequency: 1,
  keyframes: [
    { at: 0.2, value: 0 },
    { at: 0.6, value: 1 },
  ],
  interpolation: "linear",
};
assert.equal(channelValue(channel, 100, 0, false), 0);
assert(Math.abs(channelValue(channel, 100, 0.4, false) - 2) < 1e-8);
assert.equal(channelValue(channel, 100, 1, false), 4);
assert.equal(
  channelValue(channel, 1, 0.8, false),
  channelValue(channel, 999, 0.8, false),
  "One-shot movement follows progress, not oscillator time",
);
assert.equal(channelValue(channel, 1, 0.8, true), -4);
assert.equal(channelValue({ ...channel, interpolation: "hold" }, 1, 0.59, false), 0);
assert.equal(channelValue({ ...channel, interpolation: "hold" }, 1, 0.6, false), 4);
const wave = { ...channel, keyframes: undefined };
assert(Math.abs(channelValue(wave, 0.25, 0, false) - 4) < 1e-8, "Legacy periodic motion remains unchanged");
const model = normalizeModelDefinition({
  id: "progressive_rig",
  name: "Progressive rig",
  category: "prop",
  placement: "ground",
  materials: [{ id: "surface", color: "#7799aa", finish: "matte" }],
  parts: [
    {
      id: "moving",
      shape: "box",
      size: [1, 1, 1],
      material: "surface",
      animation: [
        {
          ...channel,
          keyframes: [
            { at: 0.6, value: 1 },
            { at: 0.2, value: 0 },
            { at: 0.6, value: 1 },
          ],
        },
      ],
    },
  ],
});
assert.deepEqual(model.parts[0].animation![0].keyframes, channel.keyframes, "Normalize key order and duplicate times");
assert(hasUsefulMotion(model, false), "Progressive transforms count as purposeful motion");
const frozen = structuredClone(model);
frozen.parts[0].animation![0].keyframes!.forEach((k) => {
  k.value = 0.5;
});
assert(!hasUsefulMotion(frozen, false), "Constant keyframes are a static pose, not useful motion");
const lib = new ModelLibrary([model]);
const inst = lib.instance(model.id)!;
let mesh: THREE.Mesh | undefined;
inst.object.traverse((o) => {
  if (o instanceof THREE.Mesh) mesh = o;
});
assert(mesh);
const sample = (progress: number) => {
  inst.update({ time: 100, progress, moving: true, night: false, phase: 0 });
  inst.object.updateMatrixWorld(true);
  return mesh!.getWorldPosition(new THREE.Vector3()).y;
};
assert.equal(sample(1) - sample(0), 4, "Compiler applies one-shot channels to actual geometry");
const middle = sample(0.4);
sample(1);
assert.equal(sample(0.4), middle, "Rewinding is deterministic");
inst.dispose();
lib.dispose();
console.log(
  "PASS bounded keyframes, endpoint holds, interpolation, legacy waves and deterministic rendered transforms",
);

assert(hasProgressiveMotion(model), "Changing settled endpoints satisfy a progressive action");
assert(!hasProgressiveMotion(frozen), "A held pose cannot satisfy a progressive action");
const cyclic = structuredClone(model);
cyclic.parts[0].animation![0].keyframes = undefined;
assert(!hasProgressiveMotion(cyclic), "An oscillator cannot satisfy a one-way mechanism action");
const returning = structuredClone(model);
returning.parts[0].animation![0].keyframes = [
  { at: 0, value: 0 },
  { at: 0.5, value: 1 },
  { at: 1, value: 0 },
];
assert(!hasProgressiveMotion(returning), "A cycle encoded as keys is still not a settled state change");
console.log("PASS progressive action contracts reject static poses and repeating cycles");

const absolute = normalizeModelDefinition({
  ...model,
  parts: [
    {
      ...model.parts[0],
      animation: [
        {
          property: "rotation",
          axis: "z",
          wave: "sine",
          amplitude: 0,
          frequency: 0,
          keyframes: [
            { at: 0, value: 0 },
            { at: 1000, value: -85 },
            { at: 2000, value: -85 },
          ],
        },
      ],
    },
  ],
});
const raised = absolute.parts[0].animation?.[0];
assert.equal(raised?.amplitude, 85, "Keys in degrees move their peak into the amplitude");
assert.deepEqual(
  raised?.keyframes,
  [
    { at: 0, value: 0 },
    { at: 0.5, value: -1 },
    { at: 1, value: -1 },
  ],
  "Keys in milliseconds become scene progress",
);
assert(hasProgressiveMotion(absolute), "Rescaled absolute keys still satisfy a progressive action");
const scaled = normalizeModelDefinition({
  ...model,
  parts: [
    {
      ...model.parts[0],
      animation: [
        {
          ...channel,
          property: "rotation",
          amplitude: 30,
          keyframes: [
            { at: 0, value: 0 },
            { at: 1, value: 45 },
          ],
        },
      ],
    },
  ],
});
assert.equal(scaled.parts[0].animation?.[0].amplitude, 30, "An explicit amplitude is kept when keys overshoot");
console.log("PASS keys written in absolute units keep their intended motion");
