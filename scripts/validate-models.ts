// Validates example ModelDefinitions + the showcase script against the
// strict schemas and complexity limits. Usage: npm run validate:models
import { EXAMPLE_MODELS } from "../lib/content/model-examples";
import {
  analyzeModel,
  modelDefinitionSchema,
  normalizeModelDefinition,
  geminiModelSetJsonSchema,
} from "../lib/schema/model";
import { normalizeVideoScript, validateVideoScript, geminiVideoScriptJsonSchema } from "../lib/schema/video";
import { SHOWCASE_SCRIPT } from "../lib/content/showcase";

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
