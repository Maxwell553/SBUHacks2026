import type { Scene, SceneElement, VideoScript } from "@/lib/schema/video";
import type { ModelDefinition } from "@/lib/schema/model";

/** Voices the synthesizer can play. Chosen from the shot, never from a cue list on the storyboard. */
export const VOICES = [
  "wind",
  "rain",
  "thunder",
  "surf",
  "river",
  "birds",
  "insects",
  "room",
  "engine",
  "propeller",
  "hooves",
  "march",
  "crowd",
  "fire",
  "bell",
  "train",
  "city",
  "explosion",
] as const;
export type Voice = (typeof VOICES)[number];
export type BirdStyle = "gull" | "song";

export type ScoreLayer = {
  cue: Voice;
  /** Seconds from the start of the film. */
  start: number;
  end: number;
  level: number;
  seed: number;
  style?: BirdStyle;
};

type Piece = {
  cue: Voice;
  level: number;
  at?: number;
  duration?: number;
  style?: BirdStyle;
};

const BIRD = /bird|gull|crow|raven|eagle|hawk|owl|sparrow|pigeon|duck|goose|swan|falcon|vulture|parrot/;
const GULL = /gull|duck|goose|swan/;
const MOUNT = /horse|cavalry|ox|bull|cattle|camel|elephant|donkey|mule/;
const TRAIN = /train|locomotive|rail/;
const BELL = /bell|church|cathedral|chapel/;
const FIRE = /\bfire|flame|torch/;
const MOTOR = /steam|motor|engine/;

function mixSeed(seed: number, a: number, b: number): number {
  let h = (seed + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (a + 1), 0x85ebca6b);
  h = Math.imul(h ^ (b + 0x27), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function placeOf(scene: Scene): Piece[] {
  const pieces: Piece[] = [];
  const add = (piece: Piece) => {
    const same = pieces.find((item) => item.cue === piece.cue);
    if (!same) {
      pieces.push(piece);
      return;
    }
    if (piece.level < same.level) return;
    same.level = piece.level;
    if (piece.at != null) same.at = piece.at;
    else delete same.at;
    if (piece.duration != null) same.duration = piece.duration;
    else delete same.duration;
    if (piece.style) same.style = piece.style;
  };

  if (scene.kind === "map") {
    add({ cue: "wind", level: 0.26 });
    return pieces;
  }
  const interior = scene.layout === "interior";
  const vacuum = scene.setting === "orbit" || scene.setting === "lunar";
  if (!interior && vacuum) return pieces;

  const night = scene.timeOfDay === "night";
  const dusk = scene.timeOfDay === "dusk";
  const storm = scene.weather === "storm";
  const setting = scene.setting;
  const sheltered = storm || scene.weather === "rain" || scene.weather === "snow" || scene.weather === "dust";
  const built =
    setting === "city" || scene.layout === "street" || scene.settlement === "town" || scene.settlement === "city";

  if (interior) add({ cue: "room", level: 0.48 });
  else if (storm) {
    add({ cue: "rain", level: 0.74 });
    add({ cue: "thunder", level: 0.58 });
    add({ cue: "wind", level: setting === "desert" || setting === "coast" || setting === "ocean" ? 0.55 : 0.4 });
  } else if (scene.weather === "rain") {
    add({ cue: "rain", level: 0.64 });
    add({ cue: "wind", level: 0.24 });
  } else if (scene.weather === "snow" || scene.weather === "fog") {
    add({ cue: "wind", level: setting === "mountains" ? 0.46 : 0.28 });
  } else if (scene.weather === "dust" || scene.weather === "smoke") {
    add({ cue: "wind", level: setting === "desert" ? 0.72 : 0.48 });
  } else if (setting === "ocean" || setting === "coast") {
    add({ cue: "surf", level: 0.52 });
    add({ cue: "wind", level: 0.24 });
  } else if (setting === "river") {
    add({ cue: "river", level: 0.5 });
    add({ cue: "wind", level: 0.18 });
  } else if (setting === "desert") add({ cue: "wind", level: night ? 0.32 : 0.58 });
  else if (setting === "forest" || setting === "jungle") add({ cue: "wind", level: 0.16 });
  else if (setting === "mountains" || setting === "snow") add({ cue: "wind", level: 0.42 });
  else if (built) add({ cue: "city", level: night ? 0.3 : 0.44 });
  else if (setting === "battlefield") add({ cue: "wind", level: 0.34 });
  else add({ cue: "wind", level: night ? 0.22 : 0.3 });

  // Life belongs to the habitat. A desert, a city, a snowfield and a battle do not get a birdsong bed.
  if (!interior && !sheltered && !night && (setting === "forest" || setting === "jungle"))
    add({ cue: "birds", level: setting === "jungle" ? 0.58 : dusk ? 0.36 : 0.66, style: "song" });
  if (!interior && !sheltered && !night && (setting === "coast" || setting === "ocean"))
    add({ cue: "birds", level: 0.28, style: "gull" });
  const warm =
    setting === "desert" ||
    setting === "plains" ||
    setting === "hills" ||
    setting === "forest" ||
    setting === "jungle" ||
    setting === "coast" ||
    setting === "river";
  if (!interior && !storm && scene.weather !== "snow" && warm && (night || dusk || setting === "jungle"))
    add({ cue: "insects", level: night ? 0.38 : 0.2 });

  return pieces;
}

function fromCast(script: VideoScript, scene: Scene, pieces: Piece[]) {
  const add = (piece: Piece) => {
    const same = pieces.find((item) => item.cue === piece.cue);
    if (!same) {
      pieces.push(piece);
      return;
    }
    if (piece.level < same.level) return;
    same.level = piece.level;
    if (piece.at != null) same.at = piece.at;
    else delete same.at;
    if (piece.duration != null) same.duration = piece.duration;
    else delete same.duration;
    if (piece.style) same.style = piece.style;
  };
  const interior = scene.layout === "interior";
  const vacuum = scene.setting === "orbit" || scene.setting === "lunar";
  if (!interior && vacuum) return;
  const models = new Map(script.models.map((model) => [model.id, model]));
  let people = 0;

  const consider = (element: SceneElement, model: ModelDefinition | undefined) => {
    const name = `${model?.name ?? ""} ${element.model} ${element.label ?? ""}`.toLowerCase();
    const category = model?.category;
    const featured = element.role !== "background";
    if (category === "figure") people += element.count;

    if (!vacuum && BIRD.test(name)) {
      const gull = GULL.test(name) || scene.setting === "coast" || scene.setting === "ocean";
      add({ cue: "birds", level: Math.min(0.8, 0.42 + element.count * 0.08), style: gull ? "gull" : "song" });
    }
    if (interior) {
      if (element.motion === "burn" || FIRE.test(name)) add({ cue: "fire", level: 0.55 });
      if (
        category === "figure" &&
        (element.motion === "march" || element.motion === "charge" || element.motion === "retreat")
      )
        add({ cue: "march", level: Math.min(0.4, 0.12 + element.count * 0.04) });
      return;
    }
    if (category === "aircraft" || (category === "spacecraft" && !vacuum)) {
      if (element.motion === "fly") add({ cue: "propeller", level: featured ? 0.78 : 0.42 });
      else if (element.motion === "launch") {
        const rise = Math.round(scene.duration * 0.12 * 10) / 10;
        add({ cue: "engine", level: featured ? 0.84 : 0.48, ...(rise >= 0.2 ? { at: rise } : {}) });
        const airborne = Math.round(Math.min(scene.duration - 0.9, scene.duration * 0.55) * 10) / 10;
        if (airborne >= 0.4) add({ cue: "propeller", level: featured ? 0.66 : 0.36, at: airborne });
      } else if (featured) add({ cue: "engine", level: 0.38 });
    } else if (category === "vehicle") {
      if (TRAIN.test(name)) add({ cue: "train", level: 0.66 });
      else add({ cue: "engine", level: element.motion === "idle" ? (featured ? 0.34 : 0.18) : 0.6 });
    } else if (category === "watercraft") {
      if (!["ocean", "coast", "river"].includes(scene.setting)) add({ cue: "surf", level: 0.3 });
      if (MOTOR.test(name)) add({ cue: "engine", level: 0.32 });
    }
    if (MOUNT.test(name)) {
      const moving = element.motion === "march" || element.motion === "charge" || element.motion === "retreat";
      add({ cue: "hooves", level: Math.min(0.78, (moving ? 0.36 : 0.18) + element.count * 0.06) });
    } else if (
      category === "figure" &&
      (element.motion === "march" || element.motion === "charge" || element.motion === "retreat")
    ) {
      add({
        cue: "march",
        level: Math.min(0.7, (element.motion === "charge" ? 0.26 : 0.14) + Math.min(element.count, 12) * 0.045),
      });
    }
    if (element.motion === "burn" || FIRE.test(name)) add({ cue: "fire", level: 0.62 });
    if (element.motion === "explode") {
      const at = Math.round(Math.min(scene.duration * 0.42, Math.max(0, scene.duration - 0.6)) * 10) / 10;
      add({ cue: "explosion", level: 0.82, ...(at >= 0.2 ? { at } : {}), duration: 1.5 });
    }
    if (BELL.test(name) && category !== "figure") add({ cue: "bell", level: 0.26 });
  };

  for (const element of scene.elements) consider(element, models.get(element.model));
  if (!interior && !vacuum && people >= 8) add({ cue: "crowd", level: Math.min(0.52, 0.2 + people * 0.012) });
  else if (!interior && !vacuum && scene.setting === "battlefield" && people >= 4) add({ cue: "crowd", level: 0.28 });
}

/** What this shot sounds like, from its place, weather and the models in it. */
export function resolveScore(script: VideoScript): ScoreLayer[] {
  const layers: ScoreLayer[] = [];
  let origin = 0;
  script.scenes.forEach((scene, sceneIndex) => {
    const pieces = placeOf(scene);
    fromCast(script, scene, pieces);
    pieces.forEach((piece, index) => {
      const at = Math.min(scene.duration, Math.max(0, piece.at ?? 0));
      const start = origin + at;
      const end = Math.min(origin + scene.duration, start + (piece.duration ?? Math.max(0, scene.duration - at)));
      if (end - start < 0.12) return;
      layers.push({
        cue: piece.cue,
        start,
        end,
        level: piece.level,
        seed: mixSeed(script.seed || 431, sceneIndex * 16 + index, piece.cue.length * 13),
        ...(piece.style ? { style: piece.style } : {}),
      });
    });
    origin += scene.duration;
  });
  return layers;
}
