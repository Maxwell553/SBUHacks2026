/**
 * PolyChronicle video script — the contract between the Gemini scriptwriter
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
export const MAX_SCENES = 16;
export const MIN_SCENE_SECONDS = 2.5;
export const MAX_SCENE_SECONDS = 10;
export const MAX_ELEMENTS_PER_SCENE = 16;
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
/** number: a tally; duration: seconds shown as m:ss; clock: hour of day shown as HH:MM. */
export const COUNTER_FORMATS = ["number", "duration", "clock"] as const;
export const MAX_COUNTER_VALUE = 1e12;
export const MAP_ZOOMS = ["world", "region", "local"] as const;
export const ASPECTS = ["landscape", "portrait"] as const;
/**
 * Underscore the director chooses for the whole film. Loudness stays even;
 * the character is what changes from one history to the next.
 */
export const SCORE_MOODS = [
  "solemn",
  "mournful",
  "tense",
  "martial",
  "pastoral",
  "hopeful",
  "wonder",
  "urgent",
] as const;
/** How one shot sits inside that underscore. */
export const SCORE_TONES = ["spare", "open", "dark", "bright"] as const;

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
export type ScoreMood = (typeof SCORE_MOODS)[number];
export type ScoreTone = (typeof SCORE_TONES)[number];

export function isScoreMood(value: unknown): value is ScoreMood {
  return typeof value === "string" && (SCORE_MOODS as readonly string[]).includes(value);
}

export function isScoreTone(value: unknown): value is ScoreTone {
  return typeof value === "string" && (SCORE_TONES as readonly string[]).includes(value);
}

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

const counterValue = z.number().min(-MAX_COUNTER_VALUE).max(MAX_COUNTER_VALUE);
/** On-screen running clock or tally that moves from `from` to `to` across the shot. */
export const counterSchema = z.object({
  label: z.string().min(1).max(32),
  from: counterValue,
  to: counterValue,
  format: z.enum(COUNTER_FORMATS),
  decimals: z.number().int().min(0).max(3).optional(),
  unit: z.string().max(16).optional(),
  note: z.string().max(40).optional(),
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
  /** How this shot sits in the film's underscore. Omit and the picture decides. */
  tone: z.enum(SCORE_TONES).optional(),
  camera: z.enum(CAMERA_MOVES),
  elements: z.array(sceneElementSchema).max(MAX_ELEMENTS_PER_SCENE),
  map: mapSpecSchema.optional(),
  counter: counterSchema.optional(),
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
    /** Original underscore for this film. Inferred from the story when the director omits it. */
    music: z.object({ mood: z.enum(SCORE_MOODS) }).optional(),
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
export type SceneCounter = z.infer<typeof counterSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Faction = z.infer<typeof factionSchema>;
export type VideoScript = z.infer<typeof videoScriptSchema>;

const MOOD_CUES: { mood: ScoreMood; test: RegExp }[] = [
  {
    mood: "martial",
    test: /\b(battle|battles|war|wars|army|armies|siege|cavalry|soldier|soldiers|invasion|regiment|cannon|artillery)\b/,
  },
  {
    mood: "wonder",
    test: /\b(flight|flights|flew|flying|discover\w*|moon|telescope|invent\w*|voyage|aviation|spacecraft)\b/,
  },
  {
    mood: "mournful",
    test: /\b(fire|fires|burn\w*|ash|plague|funeral|grief|death|died|dead|ruin\w*|destroy\w*|massacre|mourning|exile|famine)\b/,
  },
  { mood: "urgent", test: /\b(flee|fled|escape|countdown|collapse|rush\w*)\b|\b(hours|minutes)\s+(left|remain)/ },
  { mood: "tense", test: /\b(storm|crisis|assassin\w*|uprising|revolution|plot|danger|threat)\b/ },
  {
    mood: "hopeful",
    test: /\b(peace|treaty|freedom|rebuilt|rebuild\w*|founded|abolished|recover\w*|saved|liberation)\b/,
  },
  { mood: "pastoral", test: /\b(harvest|farm|farming|village|market|garden|pasture)\b/ },
];

/** Mood for a film whose director left `music` unset. An explicit mood always wins over this. */
export function inferScoreMood(source: {
  title?: string;
  subtitle?: string;
  scenes?: Pick<Scene, "caption" | "setting" | "weather">[];
}): ScoreMood {
  const scenes = source.scenes ?? [];
  const text = [source.title, source.subtitle, ...scenes.map((scene) => scene.caption)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const cue of MOOD_CUES) if (cue.test.test(text)) return cue.mood;
  const share = (match: (scene: Pick<Scene, "setting" | "weather">) => boolean) =>
    scenes.filter(match).length / Math.max(1, scenes.length);
  if (share((scene) => scene.setting === "battlefield") >= 0.34) return "martial";
  if (share((scene) => scene.setting === "orbit" || scene.setting === "lunar") >= 0.34) return "wonder";
  if (share((scene) => scene.weather === "storm" || scene.weather === "smoke") >= 0.34) return "tense";
  return "solemn";
}

/** Tone for a shot. The director's `tone` wins; otherwise the picture sets it. */
export function toneOf(
  scene: Pick<Scene, "tone" | "layout" | "shotSize" | "structureState" | "setting" | "timeOfDay" | "weather">,
): ScoreTone {
  if (scene.tone) return scene.tone;
  if (
    scene.structureState === "ruined" ||
    scene.setting === "battlefield" ||
    scene.timeOfDay === "night" ||
    scene.weather === "storm" ||
    scene.weather === "smoke"
  )
    return "dark";
  if (scene.layout === "interior" || scene.shotSize === "close") return "spare";
  if (scene.timeOfDay === "dawn") return "bright";
  return "open";
}

// ---------------------------------------------------------------- text
const CHARSET = new Set<string>(Array.from(charsetJson as string));

/**
 * Restricts text to glyphs present in the PolyChronicle typefaces. Accented
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

function normalizeCounter(raw: unknown): SceneCounter | undefined {
  const c = obj(raw);
  const label = text(c.label, 32);
  const from = num(c.from, -MAX_COUNTER_VALUE, MAX_COUNTER_VALUE, NaN);
  const to = num(c.to ?? c.from, -MAX_COUNTER_VALUE, MAX_COUNTER_VALUE, NaN);
  if (!label || !Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  const unit = typeof c.unit === "string" ? text(c.unit, 16) : "";
  const note = typeof c.note === "string" ? text(c.note, 40) : "";
  return {
    label,
    from,
    to,
    format: pick(COUNTER_FORMATS, c.format, "number"),
    ...(c.decimals !== undefined ? { decimals: Math.round(num(c.decimals, 0, 3, 0)) } : {}),
    ...(unit ? { unit } : {}),
    ...(note ? { note } : {}),
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
    const counter = s.counter ? normalizeCounter(s.counter) : undefined;
    const duration = num(s.duration, MIN_SCENE_SECONDS, MAX_SCENE_SECONDS, 5);
    const pal = obj(s.palette);
    const palette = {
      ...(hexOr(pal.sky) ? { sky: hexOr(pal.sky) } : {}),
      ...(hexOr(pal.ground) ? { ground: hexOr(pal.ground) } : {}),
      ...(hexOr(pal.accent) ? { accent: hexOr(pal.accent) } : {}),
    };
    return {
      kind,
      duration,
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
      ...(isScoreTone(s.tone) ? { tone: s.tone } : {}),
      camera: pick(CAMERA_MOVES, s.camera, "push_in"),
      elements,
      ...(map ? { map } : {}),
      ...(counter ? { counter } : {}),
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
  const title = text(r.title, 60, "Untitled moment");
  const subtitle = typeof r.subtitle === "string" && r.subtitle.trim() ? text(r.subtitle, 90) : undefined;
  const requestedMood = obj(r.music).mood;

  return videoScriptSchema.parse({
    version: VIDEO_SCHEMA_VERSION,
    ...(r.presentation === "immersive" ? { presentation: "immersive" } : {}),
    title,
    ...(subtitle ? { subtitle } : {}),
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
    music: {
      mood: isScoreMood(requestedMood) ? requestedMood : inferScoreMood({ title, subtitle, scenes }),
    },
    ...(factions.length ? { factions } : {}),
    models: models.filter((m) => scenes.some((s) => s.elements.some((e) => e.model === m.id))),
    scenes,
  });
}

/**
 * Drops diorama shots left with no models, then fits the remaining shots to the
 * film's length. A film can lose a model that did not finish building and still play.
 */
export function withoutEmptyDioramas(script: VideoScript): VideoScript {
  const scenes = script.scenes.filter((scene) => scene.kind === "map" || scene.elements.length > 0);
  if (scenes.length === script.scenes.length) return script;
  if (scenes.length < MIN_SCENES) throw new Error("Not enough shots remain after a model was left out.");
  return normalizeVideoScript({ ...script, scenes }, { targetDuration: script.totalDuration, seed: script.seed });
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
    ...s.scenes.flatMap((sc) => [
      sc.kicker,
      sc.caption,
      sc.map?.label,
      sc.counter?.label,
      sc.counter?.unit,
      sc.counter?.note,
      ...sc.elements.map((e) => e.label),
    ]),
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
      title: str("The film's title, shown large over the first shot", 60),
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
      music: {
        type: "object",
        description: "Original underscore for this film. Loudness stays even across shots.",
        properties: {
          mood: en(
            SCORE_MOODS,
            "solemn = weighty history; mournful = loss; tense = danger; martial = conflict; pastoral = ordinary life; hopeful = a way forward; wonder = a first or a discovery; urgent = a race against time",
          ),
        },
        required: ["mood"],
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
            tone: en(
              SCORE_TONES,
              "How this shot sits in music.mood. spare = thinner; open = as written; dark = lower and narrower; bright = lighter. Omit and the picture decides. Loudness does not change.",
            ),
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
            counter: {
              type: "object",
              description: "Optional on-screen running clock or tally that moves from `from` to `to` across the shot",
              properties: {
                label: str("What is measured, e.g. 'Fire has burned for'", 32),
                from: { type: "number", description: "Value at the start of the shot" },
                to: { type: "number", description: "Value at the end of the shot" },
                format: en(
                  COUNTER_FORMATS,
                  "number = a tally; duration = seconds shown as m:ss; clock = hour of day (13.5 = 13:30)",
                ),
                decimals: {
                  type: "integer",
                  minimum: 0,
                  maximum: 3,
                  description: "Fraction digits (3 = milliseconds)",
                },
                unit: str("Suffix for a number, e.g. 'homes'", 16),
                note: str("Small line under the value, e.g. 'Sunday, 2 September'", 40),
              },
              required: ["label", "from", "to", "format"],
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
      "music",
      "scenes",
      ...(opts.includeModels ? ["models"] : []),
    ],
  };
}

/** What the renderer does with each storyboard field, for the scriptwriting prompt. */
export const SCRIPT_AUTHORING_GUIDE = `
A storyboard is data for a deterministic low-poly 3D renderer that plays on phones (vertical first, also landscape). Each
diorama scene is a shot: the film's generated models (referenced by id) placed in a procedural place (terrain, water, sky,
weather, light) and filmed with a camera move. presentation=immersive renders one continuous world at human scale.

How the renderer reads a shot:
- elements place models. role=subject elements are what the camera frames; background and foreground elements stand around
  them without changing framing, foreground ones between the lens and the action.
- A repeatable building or plant used as a background element with count >= 2 becomes set dressing: in a street layout it
  lines both sides in rows with a skyline beyond; on open land it gathers into clusters, groves and distant landforms; along
  water it lines the banks. Other elements are placed as individual instances.
- offset {x,z} is absolute metres (+z toward the camera); position is a coarse alternative. formation and count lay out a
  group, spaced by the models' real footprints. Footprints are kept apart, and movers stop short of anything in their way.
- A person or animal who uses, holds or steadies something shares that object's offset, a metre or two to one side, feet
  on the ground. Witnesses may sit a few metres toward the camera as foreground. Only buildings and landscape sit tens of
  metres away. The renderer pulls a stray subject person back beside a subject vehicle, aircraft, boat or prop. A crowd
  of six or more stays in its formation.
- motion: march, charge and retreat travel along the facing on land, sail on water, fly in the air; launch takes off; burn and
  explode attach fire or blasts to the object; collapse topples it; idle, wave and sway stay put while the model's own
  animation plays. wave is a small greeting, not a swing at the air. A person hauling, pouring, prying, or steering
  stands at that object and uses march only to travel with it; otherwise idle. The rope, jar, or lever is part of the
  work, aimed at it. color recolours a model's tint:true materials.
- layout: street (a built corridor), open (land, water or flight), interior (inside a room-shell model that is an element of
  the shot). settlement, waterWidth, banks and structureState describe the place; shotSize and camera choose the coverage.
- kind=map flies a faceted globe to map.lat/lon, with an optional route.
- counter draws a running clock or tally under the heading, moving steadily from \`from\` to \`to\` over the shot: format
  number (a count, with unit and decimals), duration (seconds as m:ss; decimals 3 shows milliseconds) or clock (hour of
  day, 13.5 = 13:30). label says what is measured; note is a small line under it. To keep one clock running through
  the film, give consecutive shots a counter whose \`from\` is the previous shot's \`to\`.
- music.mood is the underscore for the whole film: solemn, mournful, tense, martial, pastoral, hopeful, wonder, or
  urgent. Choose the one this history needs. tone on a shot (spare, open, dark, bright) thins, darkens, or lifts that
  same bed; omit it and the picture decides. Loudness does not change between shots. The rest of the soundtrack is
  heard from this shot: the setting, the weather, the time of day, and each element's motion and what that model is.
  Set those so they match the picture. Wind, water, a room, or a street, and an engine, bell, fire, or footsteps,
  enter only with the thing they belong to and stay under the underscore. There is no constant noise bed and no voice.
- Shots change with a quick cut. title is shown large on the first shot and kicker on the others; caption is the line
  of narration along the bottom. A closing title card covers the last 2 seconds of the final shot, so give that shot
  enough extra time for its caption to be read first.

Contract: ${MIN_SCENES}-${MAX_SCENES} scenes of ${MIN_SCENE_SECONDS}-${MAX_SCENE_SECONDS}s whose durations sum exactly to totalDuration; only model ids from the
provided set; at most ${MAX_ELEMENTS_PER_SCENE} elements and ${MAX_INSTANCES_PER_SCENE} instances (sum of counts) per scene; captions of at most 160
characters, written as a complete sentence that finishes its thought; Latin script only (the fonts have no other glyphs), no emoji.
`.trim();
