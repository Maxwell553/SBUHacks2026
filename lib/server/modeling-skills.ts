/** Kinds of construction a planned model involves. Each skill labels the plan
 * (for validation and model routing) and teaches the builder a reusable
 * construction strategy. They are strategies, not a catalog of prebuilt meshes:
 * the object, its dimensions, parts, colours and joints come from the research.
 */
export const MODELING_SKILL_VERSION = "procedural-27-construction-skills";
export const MODELING_SKILLS = {
  silhouette: {
    purpose: "Any object.",
    instructions: `Identify the 2–4 shapes that make this particular object recognizable at small size. Begin with its overall silhouette and relative proportions; add only details that distinguish its historical role. Use a consistent ground plane and sensible origin. Keep the main volume readable from several camera angles. Favor flat shaded forms, a small cohesive material palette and deliberate negative space. Reuse parts through mirror and repeat rather than describing each copy. Skip details under about 5 cm that the camera cannot resolve. Never add a ground plate, display base or soil slab under the object: the renderer provides the terrain.`,
  },
  architecture: {
    purpose: "Buildings, monuments, rooms, bridges and other construction.",
    instructions: `Infer a structural hierarchy from the researched place and period: foundation, supports, occupied volumes, roofline, then defining details. One storey is about 3 m and a door about 2 m by 1 m; scale monuments against 1.75 m people. Derive proportions and repeated bays from the description. Express roofs, openings, walls, columns and bridges through primitives and bounded repetition; create clear gaps rather than pretending to subtract geometry. When asked for a room shell, leave its interior empty: separate thin walls and beams, real gaps for windows, an open +x viewing side and no opaque roof hiding the action. A solid enclosing box is invalid for an interior. Ground the whole structure. A building size is [depth,height,width]: put front doors, windows and trim at x greater than half the wall depth, with enough offset for their own thickness, and side details beyond half the wall width on z. Never bury decorative beams or glass inside a solid wall box. Every repeat needs an explicit first-copy position at its intended storey and surface; check both end copies against the wall they decorate. Decorate at least two sides so changing cameras still show detail. For open ironwork, lattice towers, scaffolding and bridge frames, use the truss primitive with taper, bays and beamWidth; never substitute a solid box named trusses. Keep characteristic roof profiles, facade rhythms and relative heights; do not substitute a stock named building.`,
  },
  mechanical: {
    purpose: "Vehicles, vessels, aircraft, machinery and tools.",
    instructions: `Determine the object's primary axis and load-bearing body, then propulsion, support and functional attachments. Synthesize a hull, chassis or fuselage appropriate to its actual period and purpose, nose or bow toward +x. Keep wheels, sails, wings, booms and mechanisms in plausible relative positions, touching what holds them. Use the truss primitive for open crane booms, gantries and bridge members. Put moving components on child parts or hinges and give them small bounded animation channels that visibly demonstrate the mechanism: wheels spin about their axle while moving, a propeller spins about its shaft (wave spin, about 1080 degrees per second), a press platen moves on position. A motionless mechanism does not explain its operation. Preserve recognizability through silhouette and arrangement rather than decorative complexity. Do not assume all vehicles share one preset mesh.`,
  },
  articulation: {
    purpose: "People, animals and anything else with limbs.",
    instructions: `Design a compact hierarchy of masses and joints with pivots at their actual attachment points. A person is about 1.75 m tall unless the plan says otherwise; derive widths and limb thickness from that stature. Construct the COMPLETE body before accessories: torso, neck, head, both arms, both legs and feet must exist before buttons, collars or facial details. Connect visible body primitives with attachTo faces: torso top to neck bottom, neck top to head bottom, thigh bottom to shin top, with zero or small position offsets. All primitives including lathe are centred by default; do not treat a centred torso as bottom-anchored. A group is a zero-size joint, not a visible mass: its top-anchored child starts at position [0,0,0] with attachTo none. Put lateral separation on the mirrored hip or shoulder group (mirror z, nonzero z offset) so the two legs stay distinct. Use animationAnchor top for hanging limbs and center for axle-centred wheels, and omit a numeric animationPivot when using animationAnchor. Walk cycles rotate about z on the hip and shoulder joints, 25–35 degrees at 1.6–2 Hz, alternate true, when moving; quadrupeds use four leg joints the same way, a little faster. Keep the hierarchy shallow (about 6 levels) and attach costume details to the torso or head rather than chaining accessories. For people, shape shoulders and a narrower waist with a low-segment lathe or tapered masses, an elongated faceted head, a distinct neck, knees, visible separation between the legs, substantial shoes and bent elbows. Give at least half the parts to the body when combining a person with equipment; up to 36 purposeful parts is better than omitting knees or hands. Keep hands on held tools while the legs alternate; equipment gets its own stable root rather than inheriting a walking limb rotation. Avoid gore, sexual anatomy and demeaning caricatures. A figure is assembled from the requested description, not chosen from a fixed soldier, knight or civilian list.`,
  },
  organic: {
    purpose: "Trees, plants, rocks, landforms and other natural forms.",
    instructions: `Use a small number of angular masses to express growth or geological structure. Vary scale and orientation coherently. Respect taper, branching and gravity. Group repeated forms into a silhouette; avoid many separate tiny meshes. Build only the requested natural object, never a miniature scene: no soil slab, base plate, embedded machinery, rails, people or architecture, which belong to separate models and would be duplicated with this scenery. Terrain features need irregular silhouettes and tapered edges meeting the ground. Keep the bottom grounded, leave negative space around branches or arches, and use restrained irregularity rather than random noise everywhere.`,
  },
  effects: {
    purpose: "Atmospheric or illustrative motion.",
    instructions: `Represent phenomena with a few simple low-poly forms and bounded opacity, scale or position animation. Use readable timing and a limited palette. Keep effects abstract and non-graphic, with no injury details. Flames rise and taper, smoke drifts upward and expands, water motion stays low amplitude. Do not request textures, shaders, scripts, network resources or unbounded particles.`,
  },
} as const;
export type ModelingSkill = keyof typeof MODELING_SKILLS;

/** The construction strategies for a planned model's skills; silhouette always applies. */
export function modelingGuide(skills: readonly ModelingSkill[]): string {
  const selected = [...new Set<ModelingSkill>(["silhouette", ...skills])];
  return selected
    .map((name) => `SKILL ${name}: ${MODELING_SKILLS[name].purpose}\n${MODELING_SKILLS[name].instructions}`)
    .join("\n\n");
}
