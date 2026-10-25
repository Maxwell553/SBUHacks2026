/**
 * Polyhistor video script — the contract between the Gemini scriptwriter
 * (server) and the low-poly renderer (browser).
 *
 * The renderer is deterministic: the same script + seed always produces the
 * same frames, so a stored script is a lossless description of its video.
 *
 * Isomorphic: no DOM / three.js / Node imports. Safe for app/api and client.
 */
import { z } from "zod";
import charsetJson from "@/lib/typography/charset.json";
import {
  MODEL_LIMITS,
  MODELING_SKILL_GUIDE,
  geminiModelDefinitionJsonSchema,
  modelDefinitionSchema,
  modelText,
  normalizeModelDefinition,
  slugify,
  type ModelDefinition,
} from "@/lib/schema/model";

export type { ModelDefinition } from "@/lib/schema/model";

export const VIDEO_SCHEMA_VERSION = 2 as const;
export const MAX_INSTANCES_PER_SCENE = 160;
export const MIN_TOTAL_SECONDS = 20;
export const MAX_TOTAL_SECONDS = 60;
export const MIN_SCENES = 3;
export const MAX_SCENES = 12;
export const MIN_SCENE_SECONDS = 2.5;
export const MAX_SCENE_SECONDS = 10;
export const MAX_ELEMENTS_PER_SCENE = 8;
export const MAX_COUNT_PER_ELEMENT = 60;

// ---------------------------------------------------------------- vocab
export const SETTINGS = [
  "plains",
  "hills",
  "forest",
  "desert",
  "snow",
  "mountains",
  "coast",
  "ocean",
  "river",
  "city",
  "jungle",
  "battlefield",
  "lunar",
  "orbit",
] as const;

export const TIMES_OF_DAY = ["dawn", "day", "dusk", "night"] as const;
export const SCENE_LAYOUTS = ["open", "street", "interior"] as const;
export const SETTLEMENTS = ["wild", "village", "town", "city"] as const;
export const BANKS = ["natural", "embankment"] as const;
export const MIN_WATER_WIDTH = 4;
export const MAX_WATER_WIDTH = 300;
export const SHOT_SIZES = ["wide", "medium", "close"] as const;
export const WEATHER = ["clear", "cloudy", "rain", "snow", "fog", "storm", "dust", "smoke"] as const;
export const CAMERA_MOVES = [
  "eye_level",
  "tracking",
  "orbit",
  "push_in",
  "pull_out",
  "pan_left",
  "pan_right",
  "flyover",
  "crane_up",
  "crane_down",
  "low_angle",
  "top_down",
  "static",
] as const;
export const FORMATIONS = ["single", "line", "column", "block", "scatter", "ring", "wedge"] as const;
export const POSITIONS = [
  "center",
  "left",
  "right",
  "front",
  "back",
  "front_left",
  "front_right",
  "back_left",
  "back_right",
] as const;
export const MOTIONS = [
  "idle",
  "march",
  "charge",
  "retreat",
  "sail",
  "fly",
  "launch",
  "burn",
  "collapse",
  "wave",
  "sway",
  "explode",
] as const;
export const FACINGS = ["left", "right", "camera", "away", "center"] as const;
export const SCENE_KINDS = ["diorama", "map"] as const;
export const MAP_ZOOMS = ["world", "region", "local"] as const;
export const ASPECTS = ["landscape", "portrait"] as const;

export type Setting = (typeof SETTINGS)[number];
export type Settlement = (typeof SETTLEMENTS)[number];
export type Banks = (typeof BANKS)[number];
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
export type Weather = (typeof WEATHER)[number];
export type CameraMove = (typeof CAMERA_MOVES)[number];
export type Formation = (typeof FORMATIONS)[number];
export type Position = (typeof POSITIONS)[number];
export type Motion = (typeof MOTIONS)[number];
export type Facing = (typeof FACINGS)[number];
export type Aspect = (typeof ASPECTS)[number];

// ---------------------------------------------------------------- schema
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb");
const lat = z.number().min(-90).max(90);
const lon = z.number().min(-180).max(180);

export const sceneElementSchema = z.object({
  /** id of a ModelDefinition in script.models */
  model: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  count: z.number().int().min(1).max(MAX_COUNT_PER_ELEMENT),
  formation: z.enum(FORMATIONS),
  position: z.enum(POSITIONS),
  motion: z.enum(MOTIONS),
  role: z.enum(["subject", "background", "foreground"]).optional(),
  offset: z.object({ x: z.number().min(-80).max(80), z: z.number().min(-80).max(80) }).optional(),
  facing: z.enum(FACINGS).optional(),
  color: hex.optional(),
  scale: z.number().min(0.5).max(3).optional(),
  label: z.string().max(28).optional(),
});

export const mapSpecSchema = z.object({
  lat,
  lon,
  label: z.string().min(1).max(40),
  zoom: z.enum(MAP_ZOOMS),
  route: z.array(z.object({ lat, lon })).max(12).optional(),
});

export const sceneSchema = z.object({
  kind: z.enum(SCENE_KINDS),
  duration: z.number().min(MIN_SCENE_SECONDS).max(MAX_SCENE_SECONDS),
  kicker: z.string().min(1).max(40),
  caption: z.string().min(1).max(160),
  setting: z.enum(SETTINGS),
  layout: z.enum(SCENE_LAYOUTS).optional(),
  /** How built-up the surroundings are; inferred from the scene's models when absent. */
  settlement: z.enum(SETTLEMENTS).optional(),
  /** River/canal channel width in metres. */
  waterWidth: z.number().min(MIN_WATER_WIDTH).max(MAX_WATER_WIDTH).optional(),
  banks: z.enum(BANKS).optional(),
  shotSize: z.enum(SHOT_SIZES).optional(),
  structureState: z.enum(["intact", "ruined"]).optional(),
  timeOfDay: z.enum(TIMES_OF_DAY),
  weather: z.enum(WEATHER),
  camera: z.enum(CAMERA_MOVES),
  elements: z.array(sceneElementSchema).max(MAX_ELEMENTS_PER_SCENE),
  map: mapSpecSchema.optional(),
  palette: z.object({ sky: hex.optional(), ground: hex.optional(), accent: hex.optional() }).optional(),
});

export const factionSchema = z.object({
  name: z.string().min(1).max(32),
  color: hex,
});

export const videoScriptSchema = z
  .object({
    version: z.literal(VIDEO_SCHEMA_VERSION),
    presentation: z.enum(["classic", "immersive"]).optional(),
    title: z.string().min(1).max(60),
    subtitle: z.string().max(90).optional(),
    dateLabel: z.string().min(1).max(40),
    location: z.string().min(1).max(60),
    coordinates: z.object({ lat, lon }).optional(),
    totalDuration: z.number().min(MIN_TOTAL_SECONDS).max(MAX_TOTAL_SECONDS),
    seed: z.number().int().min(0).max(2_147_483_647),
    palette: z.object({ primary: hex, secondary: hex, accent: hex }),
    factions: z.array(factionSchema).max(4).optional(),
    /** Per-request low-poly model definitions referenced by scene elements. */
    models: z.array(modelDefinitionSchema).max(MODEL_LIMITS.maxModelsPerScript),
    scenes: z.array(sceneSchema).min(MIN_SCENES).max(MAX_SCENES),
  })
  .superRefine((s, ctx) => {
    const sum = s.scenes.reduce((a, sc) => a + sc.duration, 0);
    if (Math.abs(sum - s.totalDuration) > 0.51) {
      ctx.addIssue({
        code: "custom",
        path: ["totalDuration"],
        message: `scene durations sum to ${sum}, expected ${s.totalDuration}`,
      });
    }
    const ids = new Set<string>();
    s.models.forEach((m, i) => {
      if (ids.has(m.id))
        ctx.addIssue({ code: "custom", path: ["models", i, "id"], message: `duplicate model id ${m.id}` });
      ids.add(m.id);
    });
    s.scenes.forEach((sc, i) => {
      if (sc.kind === "map" && !sc.map) {
        ctx.addIssue({ code: "custom", path: ["scenes", i, "map"], message: "map scenes require a map spec" });
      }
      let instances = 0;
      sc.elements.forEach((e, j) => {
        instances += e.count;
        if (!ids.has(e.model))
          ctx.addIssue({
            code: "custom",
            path: ["scenes", i, "elements", j, "model"],
            message: `unknown model ${e.model}`,
          });
      });
      if (instances > MAX_INSTANCES_PER_SCENE) {
        ctx.addIssue({
          code: "custom",
          path: ["scenes", i, "elements"],
          message: `${instances} instances > ${MAX_INSTANCES_PER_SCENE}`,
        });
      }
    });
  });

export type SceneElement = z.infer<typeof sceneElementSchema>;
export type MapSpec = z.infer<typeof mapSpecSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Faction = z.infer<typeof factionSchema>;
export type VideoScript = z.infer<typeof videoScriptSchema>;

// ---------------------------------------------------------------- text
const CHARSET = new Set<string>(Array.from(charsetJson as string));

/**
 * Restricts text to glyphs present in the Polyhistor typefaces. Accented
 * Latin is kept when we have the composite; otherwise diacritics are
 * stripped; anything else (CJK, emoji, control chars) is dropped.
 */
export function sanitizeText(input: string, max?: number): string {
  const replaced = input
    .normalize("NFC")
    .replace(/[\u2018\u201B\u2032]/g, "‘")
    .replace(/[\u2019\u02BC]/g, "’")
    .replace(/[\u201C\u201F\u2033]/g, "“")
    .replace(/[\u201D]/g, "”")
    .replace(/[\u2010\u2011\u2012]/g, "-")
    .replace(/\u2015/g, "—")
    .replace(/\s+/g, " ");
  let out = "";
  for (const ch of replaced) {
    if (CHARSET.has(ch)) {
      out += ch;
      continue;
    }
    const stripped = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    for (const s of stripped) if (CHARSET.has(s)) out += s;
  }
  out = out.trim();
  if (max && out.length > max) out = out.slice(0, max - 1).trimEnd() + "…";
  return out;
}

// ---------------------------------------------------------------- normalise
const pick = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] => {
  const s =
    typeof v === "string"
      ? v
          .toLowerCase()
          .trim()
          .replace(/[\s-]+/g, "_")
      : "";
  return (list as readonly string[]).includes(s) ? (s as T[number]) : fallback;
};
const num = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const hexOr = (v: unknown, fallback?: string) =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : fallback;
const text = (v: unknown, max: number, fallback = "") =>
  sanitizeText(typeof v === "string" ? v : fallback, max) || fallback;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function resolveModelRef(raw: unknown, models: ModelDefinition[]): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = slugify(raw, "");
  if (models.some((m) => m.id === s)) return s;
  const byName = models.find((m) => slugify(m.name, "") === s);
  if (byName) return byName.id;
  const partial = models.find((m) => m.id.includes(s) || s.includes(m.id));
  return partial ? partial.id : null;
}

function normalizeElement(raw: unknown, models: ModelDefinition[]): SceneElement | null {
  const e = obj(raw);
  const model = resolveModelRef(e.model ?? e.modelId ?? e.kind, models);
  if (!model) return null;
  const out: SceneElement = {
    model,
    count:
      models.find((m) => m.id === model)?.instancePolicy === "unique"
        ? 1
        : Math.round(num(e.count, 1, MAX_COUNT_PER_ELEMENT, 1)),
    formation: pick(FORMATIONS, e.formation, "scatter"),
    position: pick(POSITIONS, e.position, "center"),
    motion: pick(MOTIONS, e.motion, "idle"),
  };
  if (["subject", "background", "foreground"].includes(String(e.role))) out.role = e.role as SceneElement["role"];
  if (e.offset) {
    const at = obj(e.offset);
    out.offset = { x: num(at.x, -80, 80, 0), z: num(at.z, -80, 80, 0) };
  }
  if (e.facing !== undefined) out.facing = pick(FACINGS, e.facing, "center");
  const color = hexOr(e.color);
  if (color) out.color = color;
  if (e.scale !== undefined) out.scale = num(e.scale, 0.5, 3, 1);
  if (typeof e.label === "string" && e.label.trim()) out.label = text(e.label, 28);
  return out;
}

function normalizeMap(raw: unknown, fallbackLabel: string, coords?: { lat: number; lon: number }): MapSpec | undefined {
  const m = obj(raw);
  const la = num(m.lat, -90, 90, coords?.lat ?? NaN);
  const lo = num(m.lon ?? m.lng, -180, 180, coords?.lon ?? NaN);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return undefined;
  const route = Array.isArray(m.route)
    ? m.route
        .map((p) => obj(p))
        .map((p) => ({ lat: num(p.lat, -90, 90, NaN), lon: num(p.lon ?? p.lng, -180, 180, NaN) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .slice(0, 12)
    : undefined;
  return {
    lat: la,
    lon: lo,
    label: text(m.label, 40, fallbackLabel || "Here"),
    zoom: pick(MAP_ZOOMS, m.zoom, "region"),
    ...(route && route.length >= 2 ? { route } : {}),
  };
}

/**
 * Repairs near-miss model output into a valid VideoScript: maps aliases,
 * clamps ranges, sanitises text and rescales scene durations so they sum to
 * the requested total. Throws if the result still fails validation.
 */
export function normalizeVideoScript(raw: unknown, opts: { targetDuration?: number; seed?: number } = {}): VideoScript {
  const r = obj(raw);
  const coordsRaw = obj(r.coordinates);
  const coordinates =
    Number.isFinite(Number(coordsRaw.lat)) && Number.isFinite(Number(coordsRaw.lon ?? coordsRaw.lng))
      ? { lat: num(coordsRaw.lat, -90, 90, 0), lon: num(coordsRaw.lon ?? coordsRaw.lng, -180, 180, 0) }
      : undefined;
  const location = text(r.location, 60, "Unknown location");
  const target = num(opts.targetDuration ?? r.totalDuration, MIN_TOTAL_SECONDS, MAX_TOTAL_SECONDS, 40);

  const models: ModelDefinition[] = [];
  for (const [i, mr] of (Array.isArray(r.models) ? r.models : []).entries()) {
    if (models.length >= MODEL_LIMITS.maxModelsPerScript) break;
    try {
      const m = normalizeModelDefinition(mr, `model_${i}`);
      if (models.some((x) => x.id === m.id)) m.id = `${m.id.slice(0, 36)}_${i}`;
      models.push(m);
    } catch {
      /* drop unrenderable model */
    }
  }

  let scenes = (Array.isArray(r.scenes) ? r.scenes : []).slice(0, MAX_SCENES).map((sr): Scene => {
    const s = obj(sr);
    const seenUnique = new Set<string>();
    const elements = (Array.isArray(s.elements) ? s.elements : [])
      .map((e) => normalizeElement(e, models))
      .filter((e): e is SceneElement => !!e)
      .filter((e) => {
        if (models.find((m) => m.id === e.model)?.instancePolicy !== "unique") return true;
        if (seenUnique.has(e.model)) return false;
        seenUnique.add(e.model);
        return true;
      })
      .slice(0, MAX_ELEMENTS_PER_SCENE);
    const instances = elements.reduce((a, e) => a + e.count, 0);
    if (instances > MAX_INSTANCES_PER_SCENE) {
      const k = MAX_INSTANCES_PER_SCENE / instances;
      elements.forEach((e) => (e.count = Math.max(1, Math.floor(e.count * k))));
    }
    let kind = pick(SCENE_KINDS, s.kind, "diorama");
    const map = s.map || kind === "map" ? normalizeMap(s.map, location, coordinates) : undefined;
    if (kind === "map" && !map) kind = "diorama";
    const pal = obj(s.palette);
    const palette = {
      ...(hexOr(pal.sky) ? { sky: hexOr(pal.sky) } : {}),
      ...(hexOr(pal.ground) ? { ground: hexOr(pal.ground) } : {}),
      ...(hexOr(pal.accent) ? { accent: hexOr(pal.accent) } : {}),
    };
    return {
      kind,
      duration: num(s.duration, MIN_SCENE_SECONDS, MAX_SCENE_SECONDS, 5),
      kicker: text(s.kicker, 40, "—"),
      caption: text(s.caption, 160, "…"),
      setting: pick(SETTINGS, s.setting, kind === "map" ? "ocean" : "plains"),
      ...(SCENE_LAYOUTS.includes(s.layout as (typeof SCENE_LAYOUTS)[number])
        ? { layout: s.layout as (typeof SCENE_LAYOUTS)[number] }
        : {}),
      ...(SETTLEMENTS.includes(s.settlement as (typeof SETTLEMENTS)[number])
        ? { settlement: s.settlement as (typeof SETTLEMENTS)[number] }
        : {}),
      ...(typeof s.waterWidth === "number" && Number.isFinite(s.waterWidth)
        ? { waterWidth: num(s.waterWidth, MIN_WATER_WIDTH, MAX_WATER_WIDTH, 12) }
        : {}),
      ...(BANKS.includes(s.banks as (typeof BANKS)[number]) ? { banks: s.banks as (typeof BANKS)[number] } : {}),
      ...(SHOT_SIZES.includes(s.shotSize as (typeof SHOT_SIZES)[number])
        ? { shotSize: s.shotSize as (typeof SHOT_SIZES)[number] }
        : {}),
      ...(s.structureState === "ruined" || s.structureState === "intact" ? { structureState: s.structureState } : {}),
      timeOfDay: pick(TIMES_OF_DAY, s.timeOfDay, "day"),
      weather: pick(WEATHER, s.weather, "clear"),
      camera: pick(CAMERA_MOVES, s.camera, kind === "map" ? "push_in" : "orbit"),
      elements,
      ...(map ? { map } : {}),
      ...(Object.keys(palette).length ? { palette } : {}),
    };
  });

  // Fit durations to the target total, respecting per-scene bounds.
  if (scenes.length) {
    for (let pass = 0; pass < 6; pass++) {
      const sum = scenes.reduce((a, s) => a + s.duration, 0);
      const k = target / sum;
      scenes = scenes.map((s) => ({
        ...s,
        duration: Math.min(MAX_SCENE_SECONDS, Math.max(MIN_SCENE_SECONDS, s.duration * k)),
      }));
    }
    scenes = scenes.map((s) => ({ ...s, duration: Math.round(s.duration * 10) / 10 }));
    const drift = Math.round((target - scenes.reduce((a, s) => a + s.duration, 0)) * 10) / 10;
    const last = scenes[scenes.length - 1];
    last.duration =
      Math.round(Math.min(MAX_SCENE_SECONDS, Math.max(MIN_SCENE_SECONDS, last.duration + drift)) * 10) / 10;
  }
  const totalDuration = Math.round(scenes.reduce((a, s) => a + s.duration, 0) * 10) / 10;

  const pal = obj(r.palette);
  const factions = (Array.isArray(r.factions) ? r.factions : [])
    .map((f) => obj(f))
    .map((f) => ({ name: text(f.name, 32), color: hexOr(f.color, "#d9d2c3")! }))
    .filter((f) => f.name)
    .slice(0, 4);

  const seedRaw = opts.seed ?? r.seed;
  const seed =
    Number.isInteger(seedRaw) && (seedRaw as number) >= 0
      ? (seedRaw as number) % 2_147_483_647
      : hashSeed(String(r.title ?? "") + location);

  return videoScriptSchema.parse({
    version: VIDEO_SCHEMA_VERSION,
    ...(r.presentation === "immersive" ? { presentation: "immersive" } : {}),
    title: text(r.title, 60, "Untitled moment"),
    ...(typeof r.subtitle === "string" && r.subtitle.trim() ? { subtitle: text(r.subtitle, 90) } : {}),
    dateLabel: text(r.dateLabel, 40, "Date unknown"),
    location,
    ...(coordinates ? { coordinates } : {}),
    totalDuration,
    seed,
    palette: {
      primary: hexOr(pal.primary, "#a64f35"),
      secondary: hexOr(pal.secondary, "#246d62"),
      accent: hexOr(pal.accent, "#c99a3c"),
    },
    ...(factions.length ? { factions } : {}),
    models: models.filter((m) => scenes.some((s) => s.elements.some((e) => e.model === m.id))),
    scenes,
  });
}

/** Strict validation (no repair). Returns a discriminated result. */
export function validateVideoScript(raw: unknown) {
  return videoScriptSchema.safeParse(raw);
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2_147_483_647;
}

/** Every text field in a script, for output moderation. */
export function scriptText(s: VideoScript): string {
  return [
    s.title,
    s.subtitle,
    s.dateLabel,
    s.location,
    ...(s.factions ?? []).map((f) => f.name),
    ...s.models.map(modelText),
    ...s.scenes.flatMap((sc) => [sc.kicker, sc.caption, sc.map?.label, ...sc.elements.map((e) => e.label)]),
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------- Gemini
/**
 * Gemini-friendly JSON Schema (responseJsonSchema) mirroring
 * videoScriptSchema. Kept flat and enum-driven; run output through
 * normalizeVideoScript() afterwards.
 *
 * opts.modelIds: ids of models generated in an earlier call — element.model
 *   becomes an enum of exactly these ids (recommended two-step flow).
 * opts.includeModels: also ask for the `models` array inline (one-call flow).
 */
export function geminiVideoScriptJsonSchema(
  targetDuration = 40,
  opts: { modelIds?: string[]; includeModels?: boolean } = {},
) {
  const modelRef = opts.modelIds?.length
    ? { type: "string", enum: [...opts.modelIds], description: "id of a model from the provided model set" }
    : { type: "string", pattern: "^[a-z][a-z0-9_]{0,39}$", description: "id of a model defined in `models`" };
  const str = (description: string, maxLength?: number) => ({
    type: "string",
    description,
    ...(maxLength ? { maxLength } : {}),
  });
  const en = (values: readonly string[], description: string) => ({ type: "string", enum: [...values], description });
  const hexS = (description: string) => ({
    type: "string",
    description: `${description} (#rrggbb)`,
    pattern: "^#[0-9a-fA-F]{6}$",
  });
  const latlon = {
    type: "object",
    properties: {
      lat: { type: "number", minimum: -90, maximum: 90 },
      lon: { type: "number", minimum: -180, maximum: 180 },
    },
    required: ["lat", "lon"],
  };
  return {
    type: "object",
    properties: {
      version: { type: "integer", enum: [VIDEO_SCHEMA_VERSION] },
      presentation: en(["immersive"], "Connected world with unobtrusive cinematic captions"),
      title: str("Short punchy title of the event", 60),
      subtitle: str("One-line context", 90),
      dateLabel: str("Human date, e.g. 'October 14, 1066'", 40),
      location: str("Place name, e.g. 'Hastings, England'", 60),
      coordinates: latlon,
      totalDuration: {
        type: "number",
        minimum: MIN_TOTAL_SECONDS,
        maximum: MAX_TOTAL_SECONDS,
        description: `Must equal ${targetDuration}`,
      },
      seed: { type: "integer", minimum: 0, maximum: 2147483647 },
      palette: {
        type: "object",
        properties: {
          primary: hexS("Main mood colour"),
          secondary: hexS("Second faction / contrast"),
          accent: hexS("Highlights"),
        },
        required: ["primary", "secondary", "accent"],
      },
      factions: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          properties: { name: str("Side / group", 32), color: hexS("Faction colour") },
          required: ["name", "color"],
        },
      },
      scenes: {
        type: "array",
        minItems: MIN_SCENES,
        maxItems: MAX_SCENES,
        items: {
          type: "object",
          properties: {
            kind: en(SCENE_KINDS, "'map' = low-poly globe flying to a place; 'diorama' = 3D low-poly scene"),
            duration: { type: "number", minimum: MIN_SCENE_SECONDS, maximum: MAX_SCENE_SECONDS },
            kicker: str("Tiny label above the caption: a date, time or place", 40),
            caption: str("Narration shown on screen; factual, vivid, <= 160 chars", 160),
            setting: en(SETTINGS, "Environment"),
            shotSize: en(
              SHOT_SIZES,
              "wide = establish location; medium = frame main action; close = crop into the subject to show its mechanism or detail",
            ),
            layout: en(
              SCENE_LAYOUTS,
              "open = natural outdoor space; street = built streets; interior = inside a room, workshop or hall",
            ),
            settlement: en(
              SETTLEMENTS,
              "How built-up the surroundings are: wild = no buildings; village = sparse; town = continuous frontage; city = dense, paved. Urban waterfronts use layout=open with town or city.",
            ),
            waterWidth: {
              type: "number",
              minimum: MIN_WATER_WIDTH,
              maximum: MAX_WATER_WIDTH,
              description:
                "River or canal width in metres; a bridge spanning it should be about 1.5x this. Keep it constant across shots of the same place.",
            },
            banks: en(
              BANKS,
              "Waterfront edge: natural sloped banks, or embankment = stone river walls with a paved quay",
            ),
            structureState: en(
              ["intact", "ruined"],
              "Physical state of buildings: ruined turns the generated architecture into broken wall stumps and fallen debris. Use for aftermath of documented destruction; omit for intact locations.",
            ),
            timeOfDay: en(TIMES_OF_DAY, "Lighting"),
            weather: en(WEATHER, "Atmosphere"),
            camera: en(CAMERA_MOVES, "Camera move"),
            elements: {
              type: "array",
              maxItems: MAX_ELEMENTS_PER_SCENE,
              items: {
                type: "object",
                properties: {
                  model: modelRef,
                  count: { type: "integer", minimum: 1, maximum: MAX_COUNT_PER_ELEMENT },
                  formation: en(FORMATIONS, "Layout of the group"),
                  position: en(POSITIONS, "Where on the diorama"),
                  motion: en(MOTIONS, "Animation"),
                  role: en(
                    ["subject", "background", "foreground"],
                    "Only subject controls camera framing. Use scenery layers for depth.",
                  ),
                  offset: {
                    type: "object",
                    properties: {
                      x: { type: "number", minimum: -80, maximum: 80 },
                      z: { type: "number", minimum: -80, maximum: 80 },
                    },
                    required: ["x", "z"],
                    description:
                      "Optional absolute ground location in world meters; overrides position. Positive z is toward camera.",
                  },
                  facing: en(FACINGS, "Heading"),
                  color: hexS("Recolours the model's tint:true materials (faction colour)"),
                  scale: { type: "number", minimum: 0.5, maximum: 3 },
                  label: str("Optional floating tag, e.g. 'Norman cavalry'", 28),
                },
                required: ["model", "count", "formation", "position", "motion"],
              },
            },
            map: {
              type: "object",
              properties: {
                lat: { type: "number", minimum: -90, maximum: 90 },
                lon: { type: "number", minimum: -180, maximum: 180 },
                label: str("Pin label", 40),
                zoom: en(MAP_ZOOMS, "How close the globe zooms"),
                route: { type: "array", maxItems: 12, items: latlon, description: "Optional journey/campaign path" },
              },
              required: ["lat", "lon", "label", "zoom"],
            },
            palette: {
              type: "object",
              properties: {
                sky: hexS("Sky override"),
                ground: hexS("Ground override"),
                accent: hexS("Accent override"),
              },
            },
          },
          required: ["kind", "duration", "kicker", "caption", "setting", "timeOfDay", "weather", "camera", "elements"],
        },
      },
      ...(opts.includeModels
        ? {
            models: {
              type: "array",
              minItems: 1,
              maxItems: MODEL_LIMITS.maxModelsPerScript,
              items: geminiModelDefinitionJsonSchema(),
            },
          }
        : {}),
    },
    required: [
      "version",
      "title",
      "dateLabel",
      "location",
      "totalDuration",
      "seed",
      "palette",
      "scenes",
      ...(opts.includeModels ? ["models"] : []),
    ],
  };
}

/** Authoring guide to include in the scriptwriting prompt. */
export const SCRIPT_AUTHORING_GUIDE = `
You are writing a storyboard for a ${MIN_TOTAL_SECONDS}-${MAX_TOTAL_SECONDS} second low-poly animated history short.
A deterministic 3D renderer places per-event low-poly models (script.models, referenced by id) into procedural
environments (terrain, water, sky, weather) chosen by the enums below. Only use ids of models that exist.

Rules:
- ${MIN_SCENES}-${MAX_SCENES} scenes. Scene durations (${MIN_SCENE_SECONDS}-${MAX_SCENE_SECONDS}s each) MUST sum exactly to totalDuration.
- Open on a meaningful visual hook; use map.lat/lon or a route only when geography helps explain the event.
- Set presentation=immersive. The internal diorama kind means a continuous 3D WORLD, never a tabletop or isolated object display.
- Use 1–2 subject elements with role=subject plus 1–3 contextual elements with role=background or foreground. Background does not change camera framing. Use generated period architecture/vegetation to create a connected setting. Repeat reusable background definitions with 8–20 instances when a street, town, forest or fleet needs depth. Keep detail shots readable; use a few nearby context objects plus distant layers.
- Prefer eye_level and tracking cameras to place the viewer inside the location. Use an occasional wider establishing shot. Keep consistent locations/offsets and lighting across consecutive shots. Offset x/z is absolute meters; leave the camera corridor at positive z clear.
- Pick setting, timeOfDay and weather appropriate to the moment.
  Use element.color (faction colours) so sides are distinguishable; it recolours the model's tint:true materials.
  Keep total instances per scene <= ${MAX_INSTANCES_PER_SCENE} (sum of counts); use few instances for mechanisms and detail shots; larger formations only when historically necessary.
- Models with placement "air" fly at altitude and "water" models float, so pair watercraft with ocean/coast/river
  settings. Reuse one model across scenes rather than near-duplicates.
- Captions: one or two factual sentences each (<=160 chars), present tense, specific names, dates and numbers from research.
  Kickers: short labels like "Oct 14, 1066 · 9:00 AM" or "Senlac Hill".
- Depict conflict and tragedy respectfully: no gore, no glorification, no slurs, no graphic injury. Use smoke, fire,
  explosions and formations to convey scale instead of violence against individuals.
- Use Latin script only (transliterate other scripts). No emoji.
- End with a scene about the outcome or legacy.
`.trim();

/**
 * Prompt guidance for the model-building step: plan the 3-10 models the
 * story needs (people/factions, vehicles, architecture, landscape props),
 * then author each as a ModelDefinition using these reusable skills.
 */
export const MODEL_BUILDING_GUIDE = `
Plan the distinct low-poly models this event needs (typically 4-10, max ${MODEL_LIMITS.maxModelsPerScript}): the people
(per faction/role, with era-accurate clothing, armour, headwear and held items), animals, vehicles/vessels/aircraft,
signature architecture and landscape props (trees, rocks, flags, fires). Every model must be designed fresh from the
research for this specific event — period-correct silhouettes, materials and colours. Prefer one tintable model used
by several factions via element.color over duplicates.

${MODELING_SKILL_GUIDE}
`.trim();
