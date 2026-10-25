import { ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { ModelLibrary } from "@/lib/lowpoly/compiler";
import { REVIEW_ROUNDS, type ShotIssue } from "@/lib/lowpoly/shot-audit";
import type { ModelDefinition } from "@/lib/schema/model";
import {
  CAMERA_MOVES,
  geminiVideoScriptJsonSchema,
  normalizeVideoScript,
  SCENE_LAYOUTS,
  scriptText,
  SHOT_SIZES,
  type VideoScript,
} from "@/lib/schema/video";
import type { AuditContext } from "@/lib/server/audit";
import {
  generateContent,
  INTEGRITY,
  moderate,
  ModerationRejected,
  providerSceneSchema,
  repairModel,
  safetySettings,
} from "@/lib/server/gemini";
import { reviewModel, thinking } from "@/lib/server/models";
import { hasProgressiveMotion, hasUsefulMotion } from "@/lib/server/motion-quality";
import { describeLoose, looseParts, looseShare } from "@/lib/server/structure-quality";

export const MAX_REVIEW_ROUNDS = REVIEW_ROUNDS;
const MAX_REPAIRS = 3;
const REVIEWER_MS = 80_000;
/** Kept free at the end of a round for normalizing, moderation and saving. */
const FINISH_MS = 15_000;
/** A repair the reviewer asks for only starts with at least this much of the round left. */
const LATE_REPAIR_FLOOR_MS = 60_000;

export const reviewInputSchema = z.object({
  round: z.number().int().min(1).max(MAX_REVIEW_ROUNDS),
  /** Contact sheet of the film as rendered in the browser. */
  sheet: z
    .string()
    .max(6_000_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
  issues: z
    .array(
      z.object({
        scene: z.number().int().min(0),
        kind: z.enum(["overlap", "camera_inside", "subject_offscreen", "subject_small"]),
        elements: z.array(z.number().int().min(0)).max(16),
        models: z.array(z.string().max(40)).max(16),
        detail: z.string().max(200),
      }),
    )
    .max(150),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

const REVIEW_INSTRUCTIONS = `You are the quality reviewer for a short low-poly documentary while it is being made. The
image is a contact sheet of the film exactly as it renders now: each tile is labelled with its shot index (0-based, the
index into scenes) and how far through the shot it was sampled. You also get the storyboard, the models with their real
sizes in metres and how they animate, problems the renderer measured (objects passing through each other, the camera
inside a model, subjects out of frame or tiny) and model parts measured as floating loose from their model.

Judge what a viewer sees. Look for objects that intersect, overlap or float; models whose parts are scattered,
detached or jammed into each other; frames that are cluttered, empty or confusing; subjects that are hidden, cut off or
too small; and shots that fail to show what their caption describes. Measured problems are reliable evidence, but
check them against the picture. A figure or animal with moves false has no moving limbs: giving it march, charge or
retreat makes it glide, so give it idle or a slower role instead.

For each shot that needs it, return only the fields to change: a complete replacement elements list (separate things
with offset in metres, reduce counts, adjust scale, set roles so the subject is clear), a different camera, shotSize or
layout. Keep the story, captions, timing and the models listed; never invent model ids. Ask for a model repair only
when a model's own geometry is broken (detached, misplaced or wrongly intersecting parts), saying exactly what is wrong.
If the film already looks right, return verdict pass with no changes. ${INTEGRITY}`;

function reviewSchema(script: VideoScript) {
  const scene = (
    geminiVideoScriptJsonSchema(script.totalDuration, {
      modelIds: script.models.map((m) => m.id),
      includeModels: false,
    }) as { properties: { scenes: { items: { properties: Record<string, unknown> } } } }
  ).properties.scenes.items.properties;
  return {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["pass", "revise"] },
      summary: { type: "string", description: "One or two sentences on what was wrong and what changed" },
      scenes: {
        type: "array",
        maxItems: script.scenes.length,
        items: {
          type: "object",
          properties: {
            scene: { type: "integer", description: "Shot index (0-based)" },
            problem: { type: "string", description: "What is wrong in this shot" },
            elements: { ...(scene.elements as object), description: "Complete replacement list for this shot" },
            camera: scene.camera,
            shotSize: scene.shotSize,
            layout: scene.layout,
          },
          required: ["scene", "problem"],
        },
      },
      models: {
        type: "array",
        maxItems: MAX_REPAIRS,
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: script.models.map((m) => m.id) },
            problem: { type: "string", description: "Exactly what is wrong with the model's geometry" },
          },
          required: ["id", "problem"],
        },
      },
    },
    required: ["verdict", "summary", "scenes", "models"],
  };
}

const reviewOutput = z.object({
  verdict: z.enum(["pass", "revise"]),
  summary: z.string().max(600).catch(""),
  scenes: z
    .array(
      z.object({
        scene: z.number().int(),
        problem: z.string().catch(""),
        elements: z.array(z.unknown()).optional(),
        camera: z.enum(CAMERA_MOVES).optional().catch(undefined),
        shotSize: z.enum(SHOT_SIZES).optional().catch(undefined),
        layout: z.enum(SCENE_LAYOUTS).optional().catch(undefined),
      }),
    )
    .catch([]),
  models: z.array(z.object({ id: z.string(), problem: z.string().max(600) })).catch([]),
});

export interface ReviewResult {
  script: VideoScript;
  verdict: "pass" | "revise";
  summary: string;
  shotsChanged: number;
  modelsRepaired: string[];
}

/**
 * One review round: checks every model for loose parts, has the reviewer
 * judge the rendered contact sheet with the measured shot problems, applies
 * its shot changes and model repairs, and re-moderates the result. Anything
 * that fails validation or moderation leaves the film as it was.
 */
export async function reviewFilm(
  script: VideoScript,
  input: ReviewInput,
  signal: AbortSignal,
  audit: AuditContext,
  deadline: number,
): Promise<ReviewResult> {
  const lib = new ModelLibrary(script.models);
  const loose = new Map(script.models.map((m) => [m.id, looseParts(lib, m)]));
  const ids = new Set(script.models.map((m) => m.id));
  const issues: ShotIssue[] = input.issues.filter(
    (i) => i.scene < script.scenes.length && i.models.every((m) => ids.has(m)),
  );

  // Measured loose parts are repaired straight away, alongside the visual review.
  const repairs = new Map<string, Promise<ModelDefinition | null>>();
  const repair = (id: string, problem: string) => {
    if (repairs.has(id) || repairs.size >= MAX_REPAIRS) return;
    const model = script.models.find((m) => m.id === id);
    if (!model) return;
    repairs.set(
      id,
      repairModel(model, problem, signal, deadline - FINISH_MS).catch((error) => {
        console.warn("Model repair failed", { modelId: id, reason: error instanceof Error ? error.name : "error" });
        return null;
      }),
    );
  };
  [...loose.entries()]
    .filter(([, l]) => l.length)
    .sort((a, b) => b[1][0].share - a[1][0].share)
    .forEach(([id, l]) => repair(id, describeLoose(l)));

  const reviewer = reviewModel();
  const data = input.sheet.slice(input.sheet.indexOf(",") + 1);
  const response = await generateContent({
    model: reviewer,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/jpeg", data } },
          {
            text: JSON.stringify({
              storyboard: { ...script, models: undefined },
              models: script.models.map((m) => {
                const b = lib.bounds(m.id);
                return {
                  id: m.id,
                  name: m.name,
                  category: m.category,
                  placement: m.placement,
                  sizeMetres: [b.size.x, b.size.y, b.size.z].map((v) => +v.toFixed(2)),
                  moves: hasUsefulMotion(m, m.category === "figure" || m.category === "animal"),
                  oneWayAction: hasProgressiveMotion(m),
                  loosePartsMeasured: describeLoose(loose.get(m.id) ?? []) || undefined,
                };
              }),
              measuredShotProblems: issues.map((i) => ({ shot: i.scene, kind: i.kind, detail: i.detail })),
            }),
          },
        ],
      },
    ],
    config: {
      systemInstruction: REVIEW_INSTRUCTIONS,
      responseMimeType: "application/json",
      responseJsonSchema: providerSceneSchema(reviewSchema(script)),
      safetySettings,
      maxOutputTokens: 16384,
      thinkingConfig: thinking(reviewer, ThinkingLevel.LOW),
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(REVIEWER_MS)]),
    },
  }).catch((error: unknown) => {
    console.warn("Shot review unavailable", { reason: error instanceof Error ? error.name : "error" });
    return null;
  });
  lib.dispose();
  let review: z.infer<typeof reviewOutput> = { verdict: "pass", summary: "", scenes: [], models: [] };
  try {
    if (response?.candidates?.[0]?.finishReason === "STOP" && response.text)
      review = reviewOutput.parse(JSON.parse(response.text));
  } catch {
    console.warn("Review response was not usable; keeping the shots as they are.");
  }
  if (deadline - Date.now() >= LATE_REPAIR_FLOOR_MS)
    for (const m of review.models) repair(m.id, `${m.problem} ${describeLoose(loose.get(m.id) ?? [])}`.trim());

  const scenes = script.scenes.map((sc) => ({ ...sc }));
  let shotsChanged = 0;
  for (const edit of review.scenes) {
    const target = scenes[edit.scene];
    if (!target || target.kind !== "diorama") continue;
    const changed: Record<string, unknown> = {};
    if (edit.elements?.length) changed.elements = edit.elements;
    if (edit.camera) changed.camera = edit.camera;
    if (edit.shotSize) changed.shotSize = edit.shotSize;
    if (edit.layout) changed.layout = edit.layout;
    if (!Object.keys(changed).length) continue;
    Object.assign(target, changed);
    shotsChanged++;
  }

  // A repair is kept only when it is valid and holds together better than the original.
  const models = [...script.models];
  const modelsRepaired: string[] = [];
  for (const [id, pending] of repairs) {
    const fixed = await pending;
    if (!fixed) continue;
    const index = models.findIndex((m) => m.id === id);
    const before = loose.get(id) ?? [];
    const check = new ModelLibrary([fixed]);
    const after = looseParts(check, fixed);
    check.dispose();
    if (after.length > before.length || looseShare(after) > looseShare(before) + 1e-6) continue;
    models[index] = fixed;
    modelsRepaired.push(id);
  }

  if (!shotsChanged && !modelsRepaired.length)
    return { script, verdict: review.verdict, summary: review.summary, shotsChanged: 0, modelsRepaired };
  let next: VideoScript;
  try {
    next = normalizeVideoScript(
      { ...script, scenes, models },
      { targetDuration: script.totalDuration, seed: script.seed },
    );
  } catch {
    return { script, verdict: "pass", summary: "", shotsChanged: 0, modelsRepaired: [] };
  }
  try {
    await moderate(scriptText(next), true, signal, audit);
  } catch (error) {
    if (error instanceof ModerationRejected)
      return { script, verdict: "pass", summary: "", shotsChanged: 0, modelsRepaired: [] };
    throw error;
  }
  return { script: next, verdict: review.verdict, summary: review.summary, shotsChanged, modelsRepaired };
}
