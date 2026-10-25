import type { VideoScript } from "@/lib/schema/video";
import { resolveScore, type ScoreLayer, type Voice } from "@/lib/audio/score";
import { addUnderscore } from "@/lib/audio/underscore";
import { applyFilter, biquad, fadeEnds, filter, integratedLoudness, softCeiling } from "@/lib/audio/dsp";

const RATE = 48000;

type Rng = () => number;

function rngOf(seed: number): Rng {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

type Span = {
  left: Float32Array;
  right: Float32Array;
  from: number;
  to: number;
  start: number;
  end: number;
  level: number;
  seed: number;
  fadeIn: boolean;
  fadeOut: boolean;
  style?: ScoreLayer["style"];
};

function spanOf(
  left: Float32Array,
  right: Float32Array,
  layer: ScoreLayer,
  fadeIn: boolean,
  fadeOut: boolean,
): Span | null {
  const from = Math.max(0, Math.floor(layer.start * RATE));
  const to = Math.min(left.length, Math.ceil(layer.end * RATE));
  if (to - from < 8) return null;
  return {
    left,
    right,
    from,
    to,
    start: layer.start,
    end: layer.end,
    level: layer.level,
    seed: layer.seed,
    fadeIn,
    fadeOut,
    style: layer.style,
  };
}

function edge(span: Span, index: number): number {
  const samples = 0.04 * RATE;
  const fadeIn = span.fadeIn ? Math.min(1, (index - span.from) / samples) : 1;
  const fadeOut = span.fadeOut ? Math.min(1, (span.to - index) / samples) : 1;
  return fadeIn * fadeOut;
}

function panGain(pan: number): [number, number] {
  const angle = Math.min(1, Math.max(0, pan)) * (Math.PI / 2);
  return [Math.cos(angle), Math.sin(angle)];
}

/** Short tonal sweep. Used for chirps, cricket pulses and whistles. */
function chirp(
  left: Float32Array,
  right: Float32Array,
  start: number,
  dur: number,
  f0: number,
  f1: number,
  amp: number,
  pan: number,
) {
  const i0 = Math.max(0, Math.floor(start * RATE));
  const n = Math.max(2, Math.floor(dur * RATE));
  const i1 = Math.min(left.length, i0 + n);
  const [pl, pr] = panGain(pan);
  let p = 0;
  let p2 = 0;
  const count = i1 - i0;
  for (let k = 0; k < count; k++) {
    const u = k / count;
    const f = f0 * (f1 / f0) ** u;
    p += (2 * Math.PI * f) / RATE;
    p2 += (2 * Math.PI * f * 2.01) / RATE;
    const s = (Math.sin(p) + 0.16 * Math.sin(p2)) * Math.sin(Math.PI * u) ** 0.8 * amp;
    left[i0 + k] += s * pl;
    right[i0 + k] += s * pr;
  }
}

function knock(left: Float32Array, right: Float32Array, time: number, amp: number, pan: number, bright: boolean) {
  const i0 = Math.max(0, Math.floor(time * RATE));
  const n = Math.floor((bright ? 0.018 : 0.05) * RATE);
  const [pl, pr] = panGain(pan);
  let state = (i0 * 17 + 9) >>> 0 || 1;
  let low = 0;
  let phase = 0;
  const body = bright ? 2400 : 90;
  for (let k = 0; k < n && i0 + k < left.length; k++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const white = state / 2147483648 - 1;
    low += (white - low) * (bright ? 0.65 : 0.28);
    phase += (2 * Math.PI * body) / RATE;
    const s =
      (low * (bright ? 0.85 : 0.65) + Math.sin(phase) * (bright ? 0.15 : 0.55)) *
      Math.exp((-k / n) * (bright ? 8 : 6)) *
      amp;
    left[i0 + k] += s * pl;
    right[i0 + k] += s * pr;
  }
}

/** Wind, room tone and the city bed were a constant hiss. They stay in the score and stay silent. */
function addWind(_span: Span, _gust: number) {}

/** Rain as many short, bright droplets scattered across the stereo field, not a hiss. */
function addRain(span: Span) {
  const rng = rngOf(span.seed);
  const density = 14 + span.level * 26;
  let t = span.start + rng() * 0.05;
  while (t < span.end) {
    const i0 = Math.floor(t * RATE);
    const n = Math.floor((0.002 + rng() * 0.004) * RATE);
    const [pl, pr] = panGain(rng());
    const amp = span.level * (0.08 + rng() * 0.3);
    let prev = 0;
    for (let k = 0; k < n && i0 + k < span.to; k++) {
      const white = rng() * 2 - 1;
      // The first difference lifts the highs, so each drop is a tick, not a thud.
      const s = (white - prev) * Math.exp((-k / n) * 6) * amp;
      prev = white;
      span.left[i0 + k] += s * pl;
      span.right[i0 + k] += s * pr;
    }
    // Poisson spacing: drops fall independently.
    t += -Math.log(1 - rng() * 0.999) / density;
  }
}

function addThunder(span: Span) {
  const rng = rngOf(span.seed);
  const count = 1 + (span.seed % 3);
  for (let n = 0; n < count; n++) {
    const t0 = span.start + (0.08 + rng() * 0.75) * (span.end - span.start);
    const dur = 1.1 + rng() * 1.6;
    const i0 = Math.max(span.from, Math.floor(t0 * RATE));
    const i1 = Math.min(span.to, i0 + Math.floor(dur * RATE));
    let low = 0;
    let phase = 0;
    const amp = span.level * (0.45 + rng() * 0.35);
    for (let i = i0; i < i1; i++) {
      const u = (i - i0) / RATE;
      low += (rng() * 2 - 1 - low) * 0.04;
      const f = 78 * Math.exp(-u * 0.7);
      phase += (2 * Math.PI * f) / RATE;
      const env = Math.exp(-u * 1.15) * (0.4 + 0.6 * Math.min(1, u / 0.08));
      const s = (low * 5.5 + Math.sin(phase) * 0.45) * env * amp;
      span.left[i] += s * 0.86;
      span.right[i] += s;
    }
  }
}

/** Surf and river wash were a steady noise floor. The cue remains; the hiss does not play. */
function addWash(_span: Span, _crash: boolean) {}

function addBirds(span: Span) {
  const rng = rngOf(span.seed);
  const gull = span.style === "gull";
  let t = span.start + 0.15 + rng() * (gull ? 0.7 : 0.35);
  while (t < span.end - 0.08) {
    const pan = 0.15 + rng() * 0.7;
    if (gull) {
      const f = 620 + rng() * 420;
      chirp(span.left, span.right, t, 0.3 + rng() * 0.26, f * 1.3, f * 0.58, span.level * 0.62, pan);
      t += 1.1 + rng() * 1.7;
      continue;
    }
    const roll = rng();
    const amp = span.level * (0.4 + rng() * 0.16);
    if (roll < 0.55) {
      const f = 1700 + rng() * 2100;
      const notes = 2 + (rng() < 0.4 ? 1 : 0);
      for (let n = 0; n < notes; n++) {
        const note = f * (1 + n * 0.08);
        chirp(span.left, span.right, t + n * 0.1, 0.05 + rng() * 0.04, note, note * (1.25 + rng() * 0.5), amp, pan);
      }
    } else {
      const f = 1400 + rng() * 1600;
      chirp(span.left, span.right, t, 0.14 + rng() * 0.1, f * 1.25, f * 0.84, amp * 0.9, pan);
    }
    t += 0.4 + rng() * 1.15;
  }
}

function addInsects(span: Span) {
  const rng = rngOf(span.seed);
  for (let c = 0; c < 3; c++) {
    const f = 3600 + rng() * 1600;
    const pan = rng();
    const pulse = 0.007 + rng() * 0.005;
    const gap = 0.016 + rng() * 0.018;
    const notes = 3 + Math.floor(rng() * 3);
    const rest = 0.14 + rng() * 0.32;
    let t = span.start + rng() * 0.3;
    while (t < span.end) {
      for (let n = 0; n < notes && t < span.end; n++) {
        chirp(span.left, span.right, t, pulse, f, f * 0.97, span.level * 0.2, pan);
        t += gap;
      }
      t += rest;
    }
  }
}

/**
 * Firing pulses rung through two body resonances: an audible putt-putt.
 * The firing rate keeps the low rhythm; the sound itself sits where speakers play it.
 */
function addEngine(span: Span) {
  const rng = rngOf(span.seed);
  const firing = 22 + (span.seed % 14);
  const body = filter(biquad("bandpass", 200 + (span.seed % 70), RATE, 2.2));
  const bark = filter(biquad("bandpass", 650 + (span.seed % 180), RATE, 1.4));
  const amp = span.level * 1.6;
  let phase = 0;
  for (let i = span.from; i < span.to; i++) {
    const t = (i - span.from) / RATE;
    phase += (firing * (1 + 0.045 * Math.sin(t * 2.1) + 0.02 * Math.sin(t * 5.3))) / RATE;
    const cycle = phase % 1;
    const pulse = Math.exp(-cycle * 18) * (0.85 + 0.3 * rng()) + (rng() * 2 - 1) * 0.3 * Math.exp(-cycle * 5);
    const s = (body(pulse) + bark(pulse) * 0.55) * amp * edge(span, i);
    span.left[i] += s * 0.82;
    span.right[i] += s;
  }
}

/** A blade-rate thrum over a band of rushing air, with the motor's buzz under it. */
function addPropeller(span: Span) {
  const rng = rngOf(span.seed);
  const air = filter(biquad("bandpass", 520, RATE, 0.8));
  const rush = filter(biquad("bandpass", 1500, RATE, 1.1));
  const motor = filter(biquad("bandpass", 240, RATE, 2));
  const amp = span.level * 2.4;
  let blade = 0;
  let fire = 0;
  for (let i = span.from; i < span.to; i++) {
    const t = (i - span.from) / RATE;
    const passes = 18 + 5 * Math.sin(t * 0.55) + 2 * Math.sin(t * 1.6);
    blade += passes / RATE;
    fire += (passes * 1.9) / RATE;
    const chop = (0.5 + 0.5 * Math.cos(2 * Math.PI * blade)) ** 3;
    const white = rng() * 2 - 1;
    const wash = air(white) * (0.35 + 0.65 * chop) + rush(white) * 0.3 * (0.5 + 0.5 * chop);
    const buzz = motor(Math.exp(-(fire % 1) * 18)) * 0.5;
    const s = (wash + buzz) * amp * edge(span, i);
    span.left[i] += s * 0.88;
    span.right[i] += s;
  }
}

function addHooves(span: Span) {
  const cycle = 0.5;
  const hits = [0, 0.1, 0.23];
  for (let t = span.start + 0.05; t < span.end; t += cycle) {
    for (const hit of hits) {
      knock(span.left, span.right, t + hit, span.level * 0.75, 0.3 + ((t * 3) % 0.4), false);
    }
  }
}

function addMarch(span: Span) {
  const step = 0.5 - span.level * 0.08;
  let n = 0;
  for (let t = span.start + 0.06; t < span.end; t += step) {
    knock(span.left, span.right, t, span.level * 0.72, n % 2 === 0 ? 0.28 : 0.72, false);
    n++;
  }
}

function addCrowd(span: Span) {
  const rng = rngOf(span.seed ^ 0x55);
  let t = span.start + 0.3;
  while (t < span.end - 0.2) {
    const f = 160 + rng() * 80;
    const pan = rng();
    const i0 = Math.floor(t * RATE);
    const n = Math.floor((0.16 + rng() * 0.14) * RATE);
    const [pl, pr] = panGain(pan);
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    for (let k = 0; k < n && i0 + k < span.to; k++) {
      const u = k / n;
      p1 += (2 * Math.PI * f) / RATE;
      p2 += (2 * Math.PI * f * 3.1) / RATE;
      p3 += (2 * Math.PI * f * 5.4) / RATE;
      const s =
        (Math.sin(p1) * 0.5 + Math.sin(p2) * 0.28 + Math.sin(p3) * 0.12) * Math.sin(Math.PI * u) * span.level * 0.12;
      span.left[i0 + k] += s * pl;
      span.right[i0 + k] += s * pr;
    }
    t += 0.45 + rng() * 0.9;
  }
}

function addFire(span: Span) {
  const rng = rngOf(span.seed);
  let t = span.start + rng() * 0.3;
  while (t < span.end) {
    knock(span.left, span.right, t, span.level * (0.12 + rng() * 0.28), rng(), true);
    t += 0.45 + rng() * 0.7;
  }
}

function addBell(span: Span) {
  const rng = rngOf(span.seed);
  const ratios = [0.5, 1, 1.19, 1.56, 2.02, 2.51, 3.05];
  const decays = [0.55, 1.3, 1.8, 2.6, 3.4, 4.4, 5.5];
  const weights = [0.4, 0.55, 0.3, 0.22, 0.14, 0.08, 0.05];
  const f0 = 360 + (span.seed % 90);
  let t = span.start + 0.12;
  while (t < span.end - 0.15) {
    const i0 = Math.floor(t * RATE);
    const n = Math.max(0, Math.min(span.to - i0, span.left.length - i0, Math.floor(2.4 * RATE)));
    const phases = ratios.map(() => rng() * 0.2);
    const amp = span.level * 0.34;
    for (let k = 0; k < n; k++) {
      const u = k / RATE;
      let s = 0;
      for (let p = 0; p < ratios.length; p++) {
        phases[p] += (2 * Math.PI * f0 * ratios[p]) / RATE;
        s += Math.sin(phases[p]) * weights[p] * Math.exp(-u * decays[p]);
      }
      span.left[i0 + k] += s * amp * 0.82;
      span.right[i0 + k] += s * amp;
    }
    t += 2.6 + rng() * 1.5;
  }
}

function addTrain(span: Span) {
  const rng = rngOf(span.seed);
  for (let t = span.start, n = 0; t < span.end; t += 0.26, n++) {
    knock(span.left, span.right, t, span.level * 0.34, n % 2 === 0 ? 0.35 : 0.65, false);
  }
  let whistle = span.start + 1.2;
  while (whistle < span.end - 0.8) {
    chirp(span.left, span.right, whistle, 0.7, 640, 880, span.level * 0.22, 0.5);
    chirp(span.left, span.right, whistle + 0.35, 0.5, 880, 700, span.level * 0.16, 0.5);
    whistle += 4.5 + rng() * 2;
  }
}

function addCity(_span: Span) {}

function addExplosion(span: Span) {
  const rng = rngOf(span.seed);
  let low = 0;
  let phase = 0;
  const amp = span.level * 0.7;
  const i1 = Math.min(span.to, span.from + Math.floor(1.35 * RATE));
  for (let i = span.from; i < i1; i++) {
    const u = (i - span.from) / RATE;
    low += (rng() * 2 - 1 - low) * 0.22;
    const f = 64 * Math.exp(-u * 1.5);
    phase += (2 * Math.PI * f) / RATE;
    const noiseEnv = (u < 0.05 ? u / 0.05 : 1) * Math.exp(-Math.max(0, u - 0.05) * 5.5);
    const s = (low * noiseEnv * 1.1 + Math.sin(phase) * Math.exp(-u * 1.5) * 0.55) * amp;
    span.left[i] += s;
    span.right[i] += s * 0.93;
  }
}

const RENDER: Record<Voice, (span: Span) => void> = {
  wind: (span) => addWind(span, 0.32),
  rain: addRain,
  thunder: addThunder,
  surf: (span) => addWash(span, true),
  river: (span) => addWash(span, false),
  birds: addBirds,
  insects: addInsects,
  room: (span) => addWind(span, 0.07),
  engine: addEngine,
  propeller: addPropeller,
  hooves: addHooves,
  march: addMarch,
  crowd: addCrowd,
  fire: addFire,
  bell: addBell,
  train: addTrain,
  city: addCity,
  explosion: addExplosion,
};

/** The internal mix level the score is held at before the film is brought to its final loudness. */
const LEVEL = 0.05;
/** Effects sit under the score. They follow the shot and cannot cover it. */
const EFFECT_GAIN = 0.2;
/** Integrated loudness of a finished film: the usual level for web and phone video. */
export const TARGET_LUFS = -16;
/** −1 dBFS. */
const PEAK = 0.891;

/**
 * Pulls the score onto one loudness. The gain follows a centred 0.4 s window and
 * moves at most ±3 dB, so phrases even out while each note keeps its attack.
 */
function levelTo(left: Float32Array, right: Float32Array, target: number) {
  const n = left.length;
  if (n < 2) return;
  const half = Math.floor(0.2 * RATE);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + left[i] * left[i] + right[i] * right[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half);
    const rms = Math.sqrt((prefix[b] - prefix[a]) / (2 * Math.max(1, b - a)));
    const gain = rms > 0 ? Math.min(1.41, Math.max(0.71, target / rms)) : 1;
    left[i] *= gain;
    right[i] *= gain;
  }
}

/** Scales a buffer to one RMS level with a single gain. */
function scaleTo(left: Float32Array, right: Float32Array, target: number) {
  let sum = 0;
  for (let i = 0; i < left.length; i++) sum += left[i] * left[i] + right[i] * right[i];
  const rms = Math.sqrt(sum / Math.max(1, 2 * left.length));
  if (rms <= 0) return;
  const gain = target / rms;
  for (let i = 0; i < left.length; i++) {
    left[i] *= gain;
    right[i] *= gain;
  }
}

/**
 * Keeps the finished mix from rising above the score. Quiet passages are left
 * alone, so a noise floor is never turned up into a hiss.
 */
function holdLevel(left: Float32Array, right: Float32Array, target: number) {
  const n = left.length;
  if (n < 2) return;
  const win = Math.floor(0.18 * RATE);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + left[i] * left[i] + right[i] * right[i];
  // Room for the music's own peaks; the final limiter is in bringToLoudness.
  const ceiling = target * 4;
  const knee = ceiling * 0.9;
  for (let i = 0; i < n; i++) {
    const end = Math.min(n, i + win);
    const rms = Math.sqrt((prefix[end] - prefix[i]) / (2 * (end - i)));
    const gain = rms > target ? target / rms : 1;
    left[i] = softCeiling(left[i] * gain, ceiling, knee);
    right[i] = softCeiling(right[i] * gain, ceiling, knee);
  }
}

function continues(layers: ScoreLayer[], layer: ScoreLayer, at: "start" | "end"): boolean {
  return layers.some(
    (other) =>
      other !== layer &&
      other.cue === layer.cue &&
      Math.abs((at === "start" ? other.end : other.start) - (at === "start" ? layer.start : layer.end)) < 0.08,
  );
}

/**
 * Lays the narrator over the mix. The music and effects dip about 10 dB while
 * the voice speaks, and the voice's speech sits about 4 dB over the undipped bed.
 */
function addVoice(left: Float32Array, right: Float32Array, voice: Float32Array) {
  const n = Math.min(left.length, voice.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(voice[i]) < 1e-4) continue;
    sum += voice[i] * voice[i];
    count++;
  }
  if (!count) return;
  const speech = Math.sqrt(sum / count);
  const gain = (LEVEL * 1.6) / speech;
  const ahead = Math.floor(0.03 * RATE);
  const attack = 1 - Math.exp(-1 / (0.02 * RATE));
  const release = 1 - Math.exp(-1 / (0.4 * RATE));
  let env = 0;
  for (let i = 0; i < left.length; i++) {
    // The dip starts just before the voice so its first syllable is clear.
    const lead = i + ahead < n ? Math.abs(voice[i + ahead]) : 0;
    env += (lead - env) * (lead > env ? attack : release);
    const dip = 1 - 0.68 * Math.min(1, env / (speech * 0.5));
    const v = i < n ? voice[i] * gain : 0;
    left[i] = left[i] * dip + v;
    right[i] = right[i] * dip + v;
  }
}

/** One gain to the target loudness, then a soft limit at −1 dBFS. */
function bringToLoudness(left: Float32Array, right: Float32Array) {
  const loudness = integratedLoudness(left, right);
  if (!Number.isFinite(loudness)) return;
  const gain = 10 ** ((TARGET_LUFS - loudness) / 20);
  for (let i = 0; i < left.length; i++) {
    left[i] = softCeiling(left[i] * gain, PEAK, PEAK * 0.85);
    right[i] = softCeiling(right[i] * gain, PEAK, PEAK * 0.85);
  }
}

/**
 * Every film, live or saved, comes through here. Effects from the shot are
 * mixed under the score and the sum is held so nothing can jump. Sub-bass no
 * speaker plays is removed, the narrator (if any) goes on top, and the film is
 * brought to one loudness with a fade at each end.
 *
 * `voice` is the narration stem: mono, 48 kHz, starting at the film's start.
 */
export function mixSoundtrack(script: VideoScript, voice?: Float32Array): { left: Float32Array; right: Float32Array } {
  const length = Math.max(1, Math.ceil(script.totalDuration * RATE));
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const layers = resolveScore(script);
  for (const layer of layers) {
    const span = spanOf(left, right, layer, !continues(layers, layer, "start"), !continues(layers, layer, "end"));
    if (span) RENDER[layer.cue](span);
  }
  for (let i = 0; i < length; i++) {
    left[i] *= EFFECT_GAIN;
    right[i] *= EFFECT_GAIN;
  }
  const scoreL = new Float32Array(length);
  const scoreR = new Float32Array(length);
  addUnderscore(scoreL, scoreR, script);
  scaleTo(scoreL, scoreR, LEVEL);
  levelTo(scoreL, scoreR, LEVEL);
  for (let i = 0; i < length; i++) {
    left[i] += scoreL[i];
    right[i] += scoreR[i];
  }
  applyFilter(left, biquad("highpass", 40, RATE));
  applyFilter(right, biquad("highpass", 40, RATE));
  holdLevel(left, right, LEVEL);
  if (voice?.length) addVoice(left, right, voice);
  bringToLoudness(left, right);
  fadeEnds(left, RATE, 0.25, 1.5);
  fadeEnds(right, RATE, 0.25, 1.5);
  return { left, right };
}

/** mixSoundtrack as an AudioBuffer, for the player and the movie encoder. */
export function renderSoundtrack(script: VideoScript, voice?: Float32Array): AudioBuffer {
  const { left, right } = mixSoundtrack(script, voice);
  return bufferOf(left, right);
}

export function bufferOf(left: Float32Array, right: Float32Array): AudioBuffer {
  const buffer = new AudioBuffer({ length: left.length, numberOfChannels: 2, sampleRate: RATE });
  buffer.getChannelData(0).set(left);
  buffer.getChannelData(1).set(right);
  return buffer;
}

/** One sound on its own, as a film would render it (left channel), for tests and tuning. */
export function voiceProbe(cue: Voice, seconds: number, level = 0.8, seed = 7): Float32Array {
  const left = new Float32Array(Math.ceil(seconds * RATE));
  const right = new Float32Array(left.length);
  const span = spanOf(left, right, { cue, start: 0, end: seconds, level, seed }, true, true);
  if (span) RENDER[cue](span);
  return left;
}
