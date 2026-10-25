import assert from "node:assert/strict";
import * as THREE from "three";
import { SHOWCASE_SCRIPT } from "../lib/content/showcase";
import { attachEnvironmentalFire } from "../lib/lowpoly/scene-effects";
import { makeFire, makeSmoke, type Effect } from "../lib/lowpoly/effects";
import { makeRng } from "../lib/lowpoly/core";
import type { Scene, SceneElement } from "../lib/schema/video";
const base = SHOWCASE_SCRIPT.models[0];
const models = [
  { ...base, id: "fuel", category: "building" as const },
  { ...base, id: "person", category: "figure" as const },
  { ...base, id: "fire", category: "effect" as const },
];
const element = (model: string, motion: SceneElement["motion"], role: SceneElement["role"]): SceneElement => ({
  model,
  motion,
  role,
  count: 1,
  scale: 1,
  formation: "scatter",
  position: "center",
});
const scene: Scene = {
  ...SHOWCASE_SCRIPT.scenes[0],
  elements: [
    element("fuel", "idle", "background"),
    element("person", "walk", "foreground"),
    element("fire", "burn", "subject"),
  ],
};
const before = structuredClone(scene);
const bound = attachEnvironmentalFire(scene, models);
assert.deepEqual(scene, before, "Renderer must not rewrite the stored source");
assert.equal(bound.elements.length, 2);
assert.equal(bound.elements[0].motion, "burn");
assert.equal(bound.elements[0].role, "subject");
assert.equal(bound.elements[1].motion, "walk", "Living figures retain their authored action");
for (const motion of ["collapse", "explode"] as const) {
  const destruction = {
    ...scene,
    elements: [element("fuel", motion, "subject"), element("fire", "burn", "background")],
  };
  assert.equal(
    attachEnvironmentalFire(destruction, models),
    destruction,
    "Do not replace authored destruction with fire",
  );
}
const campfire = { ...scene, elements: [element("fire", "burn", "subject")] };
assert.equal(attachEnvironmentalFire(campfire, models), campfire, "Independent fires remain valid");
function snapshot(effect: Effect, time: number) {
  effect.update({ time, progress: 0.5, moving: true, night: true, phase: 0.6 });
  return effect.object.children.map((o) => {
    assert(o instanceof THREE.Mesh);
    const values = [...o.position.toArray(), ...o.scale.toArray(), o.rotation.x, o.rotation.y, o.rotation.z];
    assert(values.every(Number.isFinite));
    const material = o.material as THREE.Material;
    assert(material.opacity >= 0 && material.opacity <= 1);
    return [...values, material.opacity];
  });
}
for (const factory of [() => makeFire(3, 2, makeRng(42)), () => makeSmoke(makeRng(42))]) {
  const effect = factory();
  const first = snapshot(effect, 1.5);
  assert.notDeepEqual(snapshot(effect, 2.5), first, "Effects must visibly animate");
  assert.deepEqual(snapshot(effect, 1.5), first, "Seeking/export must yield identical frames");
  const materials = new Set<THREE.Material>();
  effect.object.traverse((o) => {
    if (o instanceof THREE.Mesh) materials.add(o.material as THREE.Material);
  });
  let disposed = 0;
  materials.forEach((m) => m.addEventListener("dispose", () => disposed++));
  effect.dispose();
  assert.equal(disposed, materials.size, "Dispose every per-puff material");
}
console.log("PASS attached environmental fire, preserved actions, deterministic animated effects and disposal");
