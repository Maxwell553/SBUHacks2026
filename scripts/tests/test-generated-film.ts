import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateVideoScript } from "../../lib/schema/video";
import { ModelLibrary } from "../../lib/lowpoly/compiler";
const path = process.argv[2];
if (!path) throw new Error("Usage: node --import tsx scripts/tests/test-generated-film.ts scene.json");
const parsed = validateVideoScript(JSON.parse(readFileSync(path, "utf8")));
assert(parsed.success, "Generated script must satisfy renderer schema");
const script = parsed.data;
assert(Math.abs(script.scenes.reduce((n, s) => n + s.duration, 0) - script.totalDuration) < 0.01);
for (const scene of script.scenes) {
  const caption = scene.caption.trim();
  assert(caption.length > 0 && caption.length <= 160, "Caption is a complete line, not a chopped fragment");
  assert(!/\b(and|or|the|a|an|across|of|to|in)$/i.test(caption), `Caption ends mid-sentence: ${caption}`);
}
const library = new ModelLibrary(script.models);
let animated = 0;
for (const model of script.models) {
  const bounds = library.bounds(model.id);
  assert(Number.isFinite(bounds.radius) && bounds.radius > 0, "Finite positive model bounds");
  if (!model.parts.some((p) => p.animation?.length)) continue;
  const instance = library.instance(model.id, { seed: 17 });
  assert(instance);
  const snapshot = () => {
    instance.object.updateMatrixWorld(true);
    const matrices: number[] = [];
    instance.object.traverse((o) => matrices.push(...o.matrixWorld.elements));
    return matrices;
  };
  instance.update({ time: 0, progress: 0, moving: true, night: false, phase: 0 });
  const before = snapshot();
  instance.update({ time: 0.43, progress: 0.3, moving: true, night: false, phase: 0 });
  const after = snapshot();
  assert(
    before.some((v, i) => Math.abs(v - after[i]) > 1e-7),
    `Animated geometry actually moves: ${model.id}`,
  );
  animated++;
}
library.dispose();
console.log(
  `PASS ${script.scenes.length} timed shots, readable captions, finite geometry and ${animated} genuinely animated models`,
);
