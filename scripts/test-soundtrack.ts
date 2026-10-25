import assert from "node:assert/strict";
import { renderSoundtrack } from "../lib/audio/soundtrack";
import { SHOWCASE_SCRIPT } from "../lib/content/showcase";
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
const room = structuredClone(film);
room.scenes.forEach((s) => {
  s.layout = "interior";
  s.setting = "coast";
  s.weather = "storm";
});
const indoor = renderSoundtrack(room).getChannelData(0);
room.scenes.forEach((s) => (s.layout = "open"));
const outdoors = renderSoundtrack(room).getChannelData(0);
const energyOf = (data: Float32Array) => data.reduce((sum, x) => sum + x * x, 0);
assert(energyOf(indoor) > 0 && energyOf(indoor) < energyOf(outdoors) * 0.25, "Rooms shelter outdoor storm and surf");
film.scenes.forEach((s) => (s.setting = "orbit"));
assert(
  renderSoundtrack(film)
    .getChannelData(0)
    .every((s) => s === 0),
  "No environmental sound in a vacuum",
);
console.log("PASS soundtrack duration, deterministic samples, non-clipping audible mix and silent vacuum");
