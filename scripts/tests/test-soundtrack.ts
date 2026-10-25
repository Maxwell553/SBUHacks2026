import assert from "node:assert/strict";
import { resolveScore } from "../../lib/audio/score";
import { renderSoundtrack } from "../../lib/audio/soundtrack";
import { SHOWCASE_SCRIPT } from "../../lib/content/showcase";
import {
  geminiVideoScriptJsonSchema,
  inferScoreMood,
  normalizeVideoScript,
  toneOf,
  type ScoreMood,
  type VideoScript,
} from "../../lib/schema/video";

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

function aired(
  mood: ScoreMood,
  setting: VideoScript["scenes"][number]["setting"],
  layout: "open" | "interior" | "street",
) {
  const next = structuredClone(SHOWCASE_SCRIPT);
  next.music = { mood };
  next.scenes.forEach((scene) => {
    scene.setting = setting;
    scene.layout = layout;
    scene.weather = "clear";
    scene.timeOfDay = "day";
    scene.shotSize = "wide";
    scene.structureState = "intact";
    scene.tone = "open";
    scene.elements = [];
  });
  return next;
}

const levelOf = (data: Float32Array) => Math.sqrt(energyOf(data) / data.length);

const dunes = aired("solemn", "desert", "open");
const space = aired("solemn", "orbit", "open");
const roomTone = aired("solemn", "city", "interior");
const street = aired("solemn", "city", "street");
const duneData = renderSoundtrack(dunes).getChannelData(0);
const spaceData = renderSoundtrack(space).getChannelData(0);
assert(
  duneData.some((sample, index) => sample !== spaceData[index]),
  "A desert has wind; orbit keeps the underscore and loses the air",
);
assert(
  renderSoundtrack(roomTone)
    .getChannelData(0)
    .some((sample, index) => sample !== renderSoundtrack(street).getChannelData(0)[index]),
  "A room and a street do not share one bed",
);
for (const film of [dunes, space, roomTone, street])
  assertEven(renderSoundtrack(film), `${film.scenes[0].setting} stays even`);
const duneLevel = levelOf(duneData);
const spaceLevel = levelOf(spaceData);
assert(spaceLevel > duneLevel * 0.9 && spaceLevel < duneLevel * 1.1, "Wind does not lift the desert above the score");

const mournful = aired("mournful", "orbit", "open");
const wonder = aired("wonder", "orbit", "open");
wonder.seed = mournful.seed;
const mournfulData = renderSoundtrack(mournful).getChannelData(0);
const wonderData = renderSoundtrack(wonder).getChannelData(0);
assert(
  mournfulData.some((sample, index) => sample !== wonderData[index]),
  "A loss and a discovery do not share an underscore",
);
assertEven(renderSoundtrack(mournful), "A mournful score stays even");
assertEven(renderSoundtrack(wonder), "A wonder score stays even");
const mournfulLevel = levelOf(mournfulData);
const wonderLevel = levelOf(wonderData);
assert(
  wonderLevel > mournfulLevel * 0.9 && wonderLevel < mournfulLevel * 1.1,
  "Mood changes the notes, not the loudness",
);

const otherKey = aired("wonder", "orbit", "open");
otherKey.seed = mournful.seed + 1;
assert(
  wonderData.some((sample, index) => sample !== renderSoundtrack(otherKey).getChannelData(0)[index]),
  "Two films in the same mood still sit in their own key",
);

const dark = aired("solemn", "orbit", "open");
dark.scenes.forEach((scene) => (scene.tone = "dark"));
const bright = aired("solemn", "orbit", "open");
bright.scenes.forEach((scene) => (scene.tone = "bright"));
const darkData = renderSoundtrack(dark).getChannelData(0);
const brightData = renderSoundtrack(bright).getChannelData(0);
assert(
  darkData.some((sample, index) => sample !== brightData[index]),
  "A dark shot and a bright shot do not share a register",
);
const darkLevel = levelOf(darkData);
const brightLevel = levelOf(brightData);
assert(brightLevel > darkLevel * 0.9 && brightLevel < darkLevel * 1.1, "Tone does not change the level");

assert.equal(inferScoreMood(SHOWCASE_SCRIPT), "wonder", "Kitty Hawk is a discovery");
assert.equal(
  inferScoreMood({ title: "The Great Fire of London", subtitle: "The city burned", scenes: [] }),
  "mournful",
);
assert.equal(inferScoreMood({ title: "Hastings", subtitle: "Two armies met", scenes: [] }), "martial");
assert.equal(inferScoreMood({ title: "A coronation", subtitle: "The crown changed hands", scenes: [] }), "solemn");
assert.equal(
  inferScoreMood({
    title: "Apollo 1",
    subtitle: "Three astronauts died",
    scenes: [
      { caption: "The crew died on the pad", setting: "orbit", weather: "clear" },
      { caption: "The hatch stayed shut", setting: "orbit", weather: "clear" },
      { caption: "The programme halted", setting: "orbit", weather: "clear" },
    ],
  }),
  "mournful",
  "A death in orbit is not scored as a discovery",
);
assert.equal(
  inferScoreMood({
    title: "A field in October",
    scenes: [
      { caption: "The line stood", setting: "battlefield", weather: "clear" },
      { caption: "The day turned", setting: "battlefield", weather: "clear" },
      { caption: "The ground held", setting: "battlefield", weather: "clear" },
    ],
  }),
  "martial",
);
assert.equal(
  toneOf({ ...SHOWCASE_SCRIPT.scenes[0], timeOfDay: "night", setting: "battlefield", tone: undefined }),
  "dark",
);
assert.equal(toneOf({ ...SHOWCASE_SCRIPT.scenes[0], timeOfDay: "night", tone: "bright" }), "bright");

const directed = normalizeVideoScript(
  {
    title: "The Great Fire of London",
    subtitle: "The city burned for four days",
    dateLabel: "1666",
    location: "London",
    music: { mood: "tense" },
    scenes: [1, 2, 3].map((i) => ({
      duration: 8,
      caption: `The fire spread through the streets ${i}`,
      setting: "city",
      tone: i === 1 ? "dark" : "nope",
      elements: [],
    })),
  },
  { targetDuration: 24 },
);
assert.equal(directed.music?.mood, "tense", "The director's mood wins over the title");
assert.equal(directed.scenes[0].tone, "dark");
assert.equal(directed.scenes[1].tone, undefined);
const inferred = normalizeVideoScript(
  {
    title: "The Great Fire of London",
    subtitle: "The city burned for four days",
    dateLabel: "1666",
    location: "London",
    scenes: [1, 2, 3].map(() => ({ duration: 8, caption: "The fire spread", setting: "city", elements: [] })),
  },
  { targetDuration: 24 },
);
assert.equal(inferred.music?.mood, "mournful", "A fire with no mood is mournful");
assert(JSON.stringify(geminiVideoScriptJsonSchema(30)).includes('"wonder"'), "The director is asked for a mood");

console.log("PASS soundtrack follows the shot: score, habitat, machines, launch, shelter and vacuum");
