import { ModelLibrary } from "../../lib/lowpoly/compiler";
import { dressingModels } from "../../lib/lowpoly/world";
import { buildEnvironment } from "../../lib/lowpoly/environment";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SHOWCASE_SCRIPT } from "../../lib/content/showcase";
import { normalizeVideoScript, validateVideoScript, geminiVideoScriptJsonSchema } from "../../lib/schema/video";
const path = process.argv[2];
const original = path ? JSON.parse(fs.readFileSync(path, "utf8")) : SHOWCASE_SCRIPT;
assert(validateVideoScript(original).success, "Existing films stay readable");
const raw = structuredClone(original);
raw.presentation = "immersive";
const sceneIndex = raw.scenes.findIndex((scene: { elements: unknown[] }) => scene.elements.length > 0);
assert(sceneIndex >= 0, "Fixture has a model scene");
raw.scenes[sceneIndex].camera = "tracking";
raw.scenes[sceneIndex].elements[0].role = "background";
raw.scenes[sceneIndex].elements[0].offset = { x: 999, z: -999 };
const normalized = normalizeVideoScript(raw, { targetDuration: original.totalDuration });
assert.equal(normalized.presentation, "immersive");
assert.equal(normalized.scenes[sceneIndex].camera, "tracking");
assert.equal(normalized.scenes[sceneIndex].elements[0].role, "background");
assert.deepEqual(normalized.scenes[sceneIndex].elements[0].offset, { x: 80, z: -80 });
assert(validateVideoScript(normalized).success);
const schema = JSON.stringify(geminiVideoScriptJsonSchema(20));
assert(schema.includes("eye_level") && schema.includes("foreground"));
for (const layout of ["open", "street", "interior"]) {
  raw.scenes[sceneIndex].layout = layout;
  const film = normalizeVideoScript(raw, { targetDuration: original.totalDuration });
  assert.equal(film.scenes[sceneIndex].layout, layout);
  assert(validateVideoScript(film).success);
}
raw.scenes[sceneIndex].layout = "arbitrary code";
assert.equal(normalizeVideoScript(raw).scenes[sceneIndex].layout, undefined);
assert(schema.includes('"interior"'));
console.log("PASS legacy compatibility, immersive cameras/layers, bounded offsets and provider schema");

for (const shotSize of ["wide", "medium", "close"]) {
  raw.scenes[sceneIndex].shotSize = shotSize;
  assert.equal(normalizeVideoScript(raw).scenes[sceneIndex].shotSize, shotSize);
}
assert(schema.includes('"close"'));

for (const state of ["intact", "ruined"]) {
  raw.scenes[sceneIndex].structureState = state;
  assert.equal(normalizeVideoScript(raw).scenes[sceneIndex].structureState, state);
}
raw.scenes[sceneIndex].structureState = "unbounded";
assert.equal(normalizeVideoScript(raw).scenes[sceneIndex].structureState, undefined);
assert(schema.includes('"ruined"'));

const uniqueRaw = structuredClone(original);
const uniqueId = uniqueRaw.scenes[sceneIndex].elements[0].model;
const uniqueDefinition = uniqueRaw.models.find((m: { id: string }) => m.id === uniqueId)!;
uniqueDefinition.instancePolicy = "unique";
uniqueDefinition.category = "building";
uniqueRaw.scenes[sceneIndex].elements[0].count = 8;
uniqueRaw.scenes[sceneIndex].elements.push({ ...uniqueRaw.scenes[sceneIndex].elements[0] });
const uniqueFilm = normalizeVideoScript(uniqueRaw);
assert.equal(uniqueFilm.scenes[sceneIndex].elements.filter((e) => e.model === uniqueId).length, 1);
assert.equal(uniqueFilm.scenes[sceneIndex].elements.find((e) => e.model === uniqueId)!.count, 1);

const library = new ModelLibrary(uniqueFilm.models);
assert(
  !dressingModels(uniqueFilm, library).includes(uniqueId),
  "Unique subjects must never become repeated street dressing",
);
library.dispose();
console.log("PASS unique model count, duplicate removal and scenery exclusion");

const placeRaw = structuredClone(original);
for (const settlement of ["wild", "village", "town", "city"]) {
  placeRaw.scenes[sceneIndex].settlement = settlement;
  assert.equal(normalizeVideoScript(placeRaw).scenes[sceneIndex].settlement, settlement);
}
placeRaw.scenes[sceneIndex].settlement = "metropolis";
placeRaw.scenes[sceneIndex].waterWidth = 9000;
placeRaw.scenes[sceneIndex].banks = "embankment";
const placeFilm = normalizeVideoScript(placeRaw);
assert.equal(placeFilm.scenes[sceneIndex].settlement, undefined);
assert.equal(placeFilm.scenes[sceneIndex].waterWidth, 300);
assert.equal(placeFilm.scenes[sceneIndex].banks, "embankment");
assert(validateVideoScript(placeFilm).success);
assert(schema.includes('"settlement"') && schema.includes('"waterWidth"') && schema.includes('"embankment"'));
// An embanked channel is water down its middle and quay-height land beyond.
const river = buildEnvironment({ setting: "river", timeOfDay: "day", weather: "clear" }, 7, {
  focus: { x: 0, z: 0 },
  corridor: { cx: 0, cz: 0, halfWidth: 10, front: 40, back: 150, paved: true, water: true, quay: 6 },
  waterway: { cx: 0, halfWidth: 10, banks: "embankment", quay: 6, bankHeight: 1.6 },
  settlement: "city",
});
assert(river.isWater(0, 0) && river.isWater(0, -120) && river.isWater(-8, 30), "Channel runs along the view axis");
assert(!river.isWater(14, 0) && !river.isWater(-14, -60), "Banks are land");
assert(Math.abs(river.heightAt(14, 0) - 1.6) < 0.05, "Quay sits at bank height");
river.dispose();
console.log("PASS settlement and waterfront fields normalise, and embanked channels shape the ground");
