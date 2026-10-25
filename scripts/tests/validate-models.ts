// Validates example ModelDefinitions + the showcase script against the
// strict schemas and complexity limits. Usage: npm run validate:models
import { EXAMPLE_MODELS } from "../../lib/content/model-examples";
import {
  analyzeModel,
  MODEL_LIMITS,
  modelDefinitionSchema,
  normalizeModelDefinition,
  geminiModelSetJsonSchema,
} from "../../lib/schema/model";
import { normalizeVideoScript, validateVideoScript, geminiVideoScriptJsonSchema } from "../../lib/schema/video";
import { SHOWCASE_SCRIPT } from "../../lib/content/showcase";
import assert from "node:assert/strict";

// A too-deep decorative branch must not remove later independent limbs.
const boundedRig = normalizeModelDefinition({
  id: "depth_regression",
  name: "Depth regression",
  category: "figure",
  placement: "ground",
  materials: [{ id: "cloth", color: "#445566" }],
  parts: [
    ...Array.from({ length: MODEL_LIMITS.maxDepth + 2 }, (_, i) => ({
      id: `joint_${i}`,
      shape: "box",
      size: [0.1, 0.1, 0.1],
      material: "cloth",
      ...(i ? { parent: `joint_${i - 1}` } : {}),
    })),
    { id: "leg", parent: "joint_0", shape: "box", size: [0.2, 0.8, 0.2], material: "cloth" },
    { id: "foot", parent: "leg", shape: "box", size: [0.3, 0.1, 0.2], material: "cloth" },
  ],
});
assert.deepEqual(
  boundedRig.parts.map((p) => p.id),
  [...Array.from({ length: MODEL_LIMITS.maxDepth }, (_, i) => `joint_${i}`), "leg", "foot"],
);
assert.equal(analyzeModel(boundedRig).depth, MODEL_LIMITS.maxDepth);
assert.ok(modelDefinitionSchema.safeParse(boundedRig).success);
console.log("✓ over-deep detail removal preserves later limbs and their transforms");

let failed = false;
for (const m of EXAMPLE_MODELS) {
  const r = modelDefinitionSchema.safeParse(m);
  const a = analyzeModel(m);
  if (!r.success) {
    failed = true;
    console.error(`✗ ${m.id}:`, r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
  } else {
    const round = normalizeModelDefinition(JSON.parse(JSON.stringify(m)));
    const same = JSON.stringify(round.parts.length) === JSON.stringify(m.parts.length);
    console.log(
      `✓ ${m.id}: ${a.nodes} nodes, ~${a.triangles} tris, depth ${a.depth}${same ? "" : " (normalize changed part count!)"}`,
    );
  }
}

const s = validateVideoScript(SHOWCASE_SCRIPT);
if (!s.success) {
  failed = true;
  console.error("✗ showcase script:", s.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
} else
  console.log(`✓ showcase script: ${SHOWCASE_SCRIPT.scenes.length} scenes, ${SHOWCASE_SCRIPT.models.length} models`);

// Repair path: legacy/sloppy input still yields a valid script.
const sloppy = {
  title: "Test",
  dateLabel: "1066",
  location: "Hastings",
  models: [
    {
      id: "Norman Knight",
      name: "Norman knight",
      materials: [{ id: "a", color: "#ff0000", finish: "matte" }],
      parts: [{ id: "body", shape: "cube", size: [1, 2, 1] }],
    },
  ],
  scenes: [1, 2, 3].map((i) => ({
    duration: 9,
    caption: `Scene ${i}`,
    elements: [{ model: "norman knight", count: 500 }],
  })),
};
const fixed = normalizeVideoScript(sloppy, { targetDuration: 30 });
console.log(
  `✓ normalize repair: total ${fixed.totalDuration}s, model ${fixed.models[0].id}, count ${fixed.scenes[0].elements[0].count}`,
);

const js =
  JSON.stringify(geminiModelSetJsonSchema()).length +
  JSON.stringify(geminiVideoScriptJsonSchema(40, { modelIds: ["a"] })).length;
console.log(`✓ gemini schemas serialise (${js} bytes)`);
if (failed) process.exit(1);
