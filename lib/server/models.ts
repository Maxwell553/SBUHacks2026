import { ThinkingLevel } from "@google/genai";

/** The flagship model writes everything a film is made of: plans, geometry, motion and direction. */
export const creativeModel = () => process.env.GEMINI_CREATIVE_MODEL || "gemini-4-argon";
/** Research, moderation and caption fitting favour latency. */
export const fastModel = () => process.env.GEMINI_FAST_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const plannerModel = () => process.env.GEMINI_PLANNER_MODEL || creativeModel();
export const builderModel = (articulated = false) =>
  (articulated ? process.env.GEMINI_ARTICULATED_MODEL : undefined) ||
  process.env.GEMINI_BUILDER_MODEL ||
  creativeModel();

// gemini-4-argon rejects MINIMAL; only the 3.5 Flash family benefits from it.
export const thinking = (model: string, level: ThinkingLevel = ThinkingLevel.LOW) => ({
  thinkingLevel: model.includes("3.5-flash") ? ThinkingLevel.MINIMAL : level,
});
