import assert from "node:assert/strict";
import { resolveScore } from "../../lib/audio/score";
import { renderSoundtrack } from "../../lib/audio/soundtrack";
import { SHOWCASE_SCRIPT } from "../../lib/content/showcase";

class TestBuffer {
  length: number;
  channels: Float32Array[];
  constructor(o: { length: number; numberOfChannels: number }) {
    this.length = o.length;
    this.channels = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
  }
  getChannelData(i: number) {
    return this.channels[i];
  }
}
Object.defineProperty(globalThis, "AudioBuffer", { value: TestBuffer, configurable: true });

const energyOf = (data: Float32Array) => data.reduce((sum, x) => sum + x * x, 0);

/** Every film goes through the same mix, so the level has to hold on more than one story. */
function assertEven(buffer: { length: number; getChannelData(channel: number): Float32Array }, message: string) {
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const win = Math.floor(0.4 * 48000);
  let quiet = Infinity;
  let loud = 0;
  for (let i = 0; i + win <= buffer.length; i += win) {
    let windowEnergy = 0;
    for (let k = 0; k < win; k++) windowEnergy += left[i + k] * left[i + k] + right[i + k] * right[i + k];
    const level = Math.sqrt(windowEnergy / (win * 2));
    if (level < quiet) quiet = level;
    if (level > loud) loud = level;
  }
  assert(quiet > 0 && loud < quiet * 1.15, message);
}
const film = structuredClone(SHOWCASE_SCRIPT);
const a = renderSoundtrack(film),
  b = renderSoundtrack(film);
assert.equal(a.length, Math.ceil(film.totalDuration * 48000));
let peak = 0,
  energy = 0;
for (const sample of a.getChannelData(0)) {
  assert(Number.isFinite(sample));
  peak = Math.max(peak, Math.abs(sample));
  energy += sample * sample;
}
assert(peak < 1 && energy > 0, "Sound is audible and never clipped");
assert.deepEqual(a.getChannelData(0), b.getChannelData(0), "Deterministic soundtrack");

assert(peak < 0.2, "Peaks stay under the ceiling");
assertEven(a, "The Kitty Hawk flight stays even");

const room = structuredClone(film);
room.scenes.forEach((s) => {
  s.layout = "interior";
  s.setting = "coast";
  s.weather = "storm";
});
const indoor = renderSoundtrack(room).getChannelData(0);
const sheltered = resolveScore(room);
assertEven(renderSoundtrack(room), "An interior stays even");
room.scenes.forEach((s) => (s.layout = "open"));
const outdoors = renderSoundtrack(room).getChannelData(0);
assertEven(renderSoundtrack(room), "A storm stays even");
const indoorLevel = Math.sqrt(energyOf(indoor) / indoor.length);
const outdoorLevel = Math.sqrt(energyOf(outdoors) / outdoors.length);
assert(
  indoorLevel > 0 && outdoorLevel > indoorLevel * 0.9 && outdoorLevel < indoorLevel * 1.1,
  "A room and the storm outside stay at the same level",
);
assert(
  sheltered.every((layer) => layer.cue !== "rain" && layer.cue !== "thunder" && layer.cue !== "surf"),
  "Walls keep out the rain, thunder and surf",
);

film.scenes.forEach((s) => (s.setting = "orbit"));
assert(resolveScore(film).length === 0, "A vacuum has no wind, engines or animals");
assert(energyOf(renderSoundtrack(film).getChannelData(0)) > 0, "The score still plays where there is no air");

const desert = structuredClone(SHOWCASE_SCRIPT);
desert.scenes.forEach((scene) => {
  scene.setting = "desert";
  scene.weather = "clear";
  scene.timeOfDay = "day";
  scene.layout = "open";
  (scene as { sounds?: unknown }).sounds = [{ cue: "birds", level: 1 }];
});
const desertScore = resolveScore(desert);
assert(
  desertScore.every((layer) => layer.cue !== "birds" && layer.cue !== "insects" && layer.cue !== "surf"),
  "A desert day is wind, not birds, crickets or surf",
);
assert(
  desertScore.some((layer) => layer.cue === "wind") && desertScore.some((layer) => layer.cue === "engine"),
  "The aircraft in that desert is still audible",
);

const woods = structuredClone(SHOWCASE_SCRIPT);
woods.scenes.forEach((scene) => {
  scene.setting = "forest";
  scene.weather = "clear";
  scene.timeOfDay = "day";
  scene.layout = "open";
  scene.elements = [];
});
const woodScore = resolveScore(woods);
assert(
  woodScore.some((layer) => layer.cue === "birds" && layer.style === "song"),
  "Woodland has songbirds",
);
assert(
  woodScore.every((layer) => layer.cue !== "engine" && layer.cue !== "propeller" && layer.cue !== "surf"),
  "An empty forest has no machines or surf",
);

const plains = structuredClone(SHOWCASE_SCRIPT);
plains.scenes.forEach((scene) => {
  scene.setting = "plains";
  scene.weather = "clear";
  scene.timeOfDay = "day";
  scene.layout = "open";
  scene.elements = scene.elements.filter((element) => element.model !== "wright_flyer_1903");
});
assert(
  resolveScore(plains).every((layer) => layer.cue !== "birds"),
  "Open grassland does not get a birdsong bed",
);

const opening = resolveScore(SHOWCASE_SCRIPT).filter((layer) => layer.start < 1);
const flight = resolveScore(SHOWCASE_SCRIPT).filter((layer) => layer.start <= 20 && layer.end > 20);
assert(
  opening.some((layer) => layer.cue === "surf") &&
    opening.some((layer) => layer.cue === "birds" && layer.style === "gull") &&
    opening.some((layer) => layer.cue === "engine"),
  "The beach has surf and gulls, and the parked aircraft has its engine",
);
assert(!opening.some((layer) => layer.cue === "propeller"), "The propeller stays quiet until the aircraft is flying");
const liftoff = resolveScore(SHOWCASE_SCRIPT).filter((layer) => layer.start >= 11 && layer.start < 17);
assert(
  liftoff.some((layer) => layer.cue === "engine" && layer.start > 11.2),
  "The engine comes up as the aircraft launches",
);
assert(
  liftoff.some((layer) => layer.cue === "propeller" && layer.start > 13),
  "The propeller joins once the launch is airborne",
);
assert(
  flight.some((layer) => layer.cue === "propeller"),
  "The flying shot keeps the propeller",
);

const birdData = renderSoundtrack(woods).getChannelData(0);
const engineData = renderSoundtrack(desert).getChannelData(0);
assert(
  birdData.some((sample, index) => sample !== engineData[index]),
  "Woodland and a desert aircraft do not share one bed",
);

const hushed = structuredClone(SHOWCASE_SCRIPT);
hushed.scenes.forEach((scene) => {
  scene.layout = "interior";
  scene.setting = "city";
  scene.weather = "clear";
  scene.timeOfDay = "day";
  scene.elements = [];
});
const flightAudio = renderSoundtrack(SHOWCASE_SCRIPT).getChannelData(0);
const hush = renderSoundtrack(hushed).getChannelData(0);
const flightLevel = Math.sqrt(energyOf(flightAudio) / flightAudio.length);
const hushLevel = Math.sqrt(energyOf(hush) / hush.length);
assert(
  hushLevel > flightLevel * 0.9 && hushLevel < flightLevel * 1.1,
  "The flight and a quiet room stay at the same level",
);

console.log("PASS soundtrack follows the shot: score, habitat, machines, launch, shelter and vacuum");
