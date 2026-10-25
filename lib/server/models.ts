import { ThinkingLevel } from "@google/genai";

/**
 * Research, moderation, the model plan, geometry, the storyboard and review.
 * Gemini 3.8 Flash is the fast flagship: quicker than Gemini 4 Argon, and
 * strong enough at structured JSON that a film can finish inside two minutes.
 */
export const fastModel = () => process.env.GEMINI_FAST_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash";
/** Storyboard, and the default for geometry and the draft review. */
export const creativeModel = () => process.env.GEMINI_CREATIVE_MODEL || fastModel();
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
