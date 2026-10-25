/** Kinds of construction a planned model involves. They label the plan (for
 * validation and model routing); how to build each object is left to the model.
 */
export const MODELING_SKILL_VERSION = "procedural-26-reel-stills";
export const MODELING_SKILLS = {
  silhouette: "Any object.",
  architecture: "Buildings, monuments, rooms, bridges and other construction.",
  mechanical: "Vehicles, vessels, aircraft, machinery and tools.",
  articulation: "People, animals and anything else with limbs.",
  organic: "Trees, plants, rocks, landforms and other natural forms.",
  effects: "Atmospheric or illustrative motion.",
} as const;
export type ModelingSkill = keyof typeof MODELING_SKILLS;
