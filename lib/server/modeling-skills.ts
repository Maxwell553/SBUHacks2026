/** Application-level skills supplied to Gemini, not a catalog of prebuilt meshes.
 * Each skill teaches a reusable construction strategy. The requested object,
 * dimensions, parts, colors, and joints are synthesized for each historical scene.
 */
export const MODELING_SKILL_VERSION = "procedural-5-world";
export const MODELING_SKILLS = {
  silhouette: {
    purpose: "Every model: readable silhouette and efficient low-poly construction.",
    instructions: `Identify the 2–4 shapes that make this particular object recognizable at small size. Begin with its overall silhouette and relative proportions; add only details that distinguish its historical role. Build from geometric primitives, not imported assets. Use a consistent ground plane and sensible origin. Keep the main volume readable from multiple camera angles. Favor flat shaded forms, a small cohesive material palette, and deliberate negative space. Reuse parts through repetition rather than redundant hand descriptions. Avoid tiny features the camera cannot resolve.`,
  },
  architecture: {
    purpose: "Structures, monuments, engineered spaces, and historically specific construction.",
    instructions: `Infer a structural hierarchy from the researched place and period: foundation, supports, occupied volumes, roofline, then defining details. Derive proportions and repeated bays from the description. Express roofs, openings, walls, columns and bridges through primitives and bounded repetition; create clear gaps rather than pretending to subtract unbounded geometry. Ground the whole structure. Keep characteristic roof profiles, facade rhythms and relative heights; do not substitute a stock named building.`,
  },
  mechanical: {
    purpose: "Vehicles, ships, machinery, tools and spacecraft.",
    instructions: `Determine the object's primary axis and load-bearing body, then propulsion, support and functional attachments. Synthesize a hull/chassis/fuselage appropriate to its actual period and purpose. Keep wheels, sails, wings, booms and mechanisms in plausible relative positions. Use child parts or hinges for moving components. Include small bounded animation channels that visibly demonstrate the mechanism, such as rotation for wheels or position for a press platen; a motionless mechanism does not explain its operation. Preserve recognizability through silhouette and arrangement rather than decorative complexity. Space/water/ground placement is explicit. Do not assume all vehicles share one preset mesh.`,
  },
  articulation: {
    purpose: "People, animals and other articulated subjects.",
    instructions: `Design a compact hierarchy of masses and joints with pivots at their actual attachment points. Place head/torso/limbs or corresponding body segments with coherent proportions; attach costume, tools and period identifiers as simple geometry. Animate local joint rotations with small bounded periodic motion, balanced phases, and an anchored root. Ensure geometry follows its parent. Avoid gore, sexual anatomy and demeaning caricatures. A figure is assembled from the requested description, not selected from a fixed soldier/knight/civilian list.`,
  },
  organic: {
    purpose: "Vegetation, terrain features, rocks, natural formations and landscapes.",
    instructions: `Use a small number of angular masses to express growth or geological structure. Vary scale and orientation coherently with a deterministic seed. Respect taper, branching and gravity. Group repeated forms into a silhouette; avoid hundreds of separate tiny meshes. Keep the bottom grounded, reserve negative space around branches or arches, and use restrained irregularity rather than random noise everywhere.`,
  },
  effects: {
    purpose: "Non-graphic atmospheric and illustrative motion.",
    instructions: `Represent phenomena with a few simple low-poly forms and bounded opacity/scale/position animation. Use readable timing and a limited palette. Keep effects abstract and non-graphic; no injury details. Flames rise and taper, smoke drifts upward and expands, water motion stays low amplitude. Maintain deterministic animation and hard complexity budgets. Do not request textures, arbitrary shaders, executable scripts, network resources or unbounded particles.`,
  },
} as const;
export type ModelingSkill = keyof typeof MODELING_SKILLS;
export function modelingGuide(skills: ModelingSkill[]): string {
  const selected = [...new Set<ModelingSkill>(["silhouette", ...skills])];
  return selected
    .map((name) => `SKILL ${name}\nPurpose: ${MODELING_SKILLS[name].purpose}\n${MODELING_SKILLS[name].instructions}`)
    .join("\n\n");
}
