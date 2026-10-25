import assert from "node:assert/strict";
import { counterText } from "../../lib/lowpoly/overlay";
import { SHOWCASE_SCRIPT } from "../../lib/content/showcase";
import { MAX_SCENES, normalizeVideoScript, scriptText, type SceneCounter } from "../../lib/schema/video";

const c = (over: Partial<SceneCounter>): SceneCounter => ({ label: "x", from: 0, to: 0, format: "number", ...over });

// Countdown in the examples' style, real-time milliseconds.
assert.equal(counterText(c({ format: "duration", from: 8, to: 0, decimals: 3 }), 0), "0:08.000");
assert.equal(counterText(c({ format: "duration", from: 8, to: 0, decimals: 3 }), 0.5), "0:04.000");
assert.equal(counterText(c({ format: "duration", from: 8, to: 0, decimals: 3 }), 1), "0:00.000");
assert.equal(counterText(c({ format: "duration", from: 3600 * 26 + 61, to: 0 }), 0), "26:01:01");
// Hour of day wraps past midnight.
assert.equal(counterText(c({ format: "clock", from: 23.5, to: 25 }), 0), "23:30");
assert.equal(counterText(c({ format: "clock", from: 23.5, to: 25 }), 1), "01:00");
// Tallies group thousands, keep their sign and clamp progress.
assert.equal(counterText(c({ from: 0, to: 13200 }), 1), "13,200");
assert.equal(counterText(c({ from: 8231456114, to: 8231456114 }), 2), "8,231,456,114");
assert.equal(counterText(c({ from: -44, to: -44 }), 0), "-44");
assert.equal(counterText(c({ from: 0, to: 1, decimals: 2 }), 0.5), "0.50");

// Near-miss provider output is repaired; unusable counters are dropped, never fatal.
const scenes = SHOWCASE_SCRIPT.scenes.map((s, i) => ({
  ...s,
  counter:
    i === 0
      ? { label: "Fire has burned for", from: "0", to: 3600, format: "Duration", decimals: 9, unit: "", note: "Sunday" }
      : i === 1
        ? { label: "", from: 1, to: 2, format: "number" }
        : { label: "Homes lost", from: 0, to: 13200, format: "nonsense", unit: "homes" },
}));
const fixed = normalizeVideoScript({ ...SHOWCASE_SCRIPT, scenes });
assert.deepEqual(fixed.scenes[0].counter, {
  label: "Fire has burned for",
  from: 0,
  to: 3600,
  format: "duration",
  decimals: 3,
  note: "Sunday",
});
assert.equal(fixed.scenes[1].counter, undefined);
assert.equal(fixed.scenes[2].counter?.format, "number");
assert.match(scriptText(fixed), /Homes lost\nhomes/);

// The scene cap leaves room for the examples' short beats in a 60 s film.
assert.ok(MAX_SCENES >= 16);

console.log("PASS counter formats, countdowns, clock wrap, repair of near-miss counters and moderation coverage");
