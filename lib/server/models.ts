import { ThinkingLevel } from "@google/genai";

/** Storyboard, and the default for geometry and the draft review. */
export const creativeModel = () => process.env.GEMINI_CREATIVE_MODEL || "gemini-4-argon";
/** Research, moderation, the model plan and the fallback when a build times out. */
export const fastModel = () => process.env.GEMINI_FAST_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash";
/** The model plan is a short structured list, and every later stage waits for it. */
export const plannerModel = () => process.env.GEMINI_PLANNER_MODEL || fastModel();
/** Reviews rendered shots and repairs broken models while a film is being made. */
export const reviewModel = () => process.env.GEMINI_REVIEW_MODEL || creativeModel();
export const builderModel = (articulated = false) =>
  (articulated ? process.env.GEMINI_ARTICULATED_MODEL : undefined) ||
  process.env.GEMINI_BUILDER_MODEL ||
  creativeModel();

// gemini-3.5-flash accepts MINIMAL. gemini-3.8-flash and gemini-4-argon reject it
// and accept only low, medium and high (medium is their default).
export const thinking = (model: string, level: ThinkingLevel = ThinkingLevel.LOW) => ({
  thinkingLevel: model.includes("3.5-flash") ? ThinkingLevel.MINIMAL : level,
});
