import type { VideoScript } from "@/lib/schema/video";
import { resolveScore, type ScoreLayer, type Voice } from "@/lib/audio/score";
import { addUnderscore, scoreRoot } from "@/lib/audio/underscore";

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
  /** Underscore root, so place tones sit in the film's key. */
  root: number;
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
    root: 220,
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

/** A narrow tone in the film's key. Not a noise bed. */
function addTone(span: Span, freq: number, amp: number, partial: number) {
  let fundamental = 0;
  let fifth = 0;
  const overtone = freq * 1.5;
  for (let i = span.from; i < span.to; i++) {
    fundamental += (2 * Math.PI * freq) / RATE;
    fifth += (2 * Math.PI * overtone) / RATE;
    const s = (Math.sin(fundamental) + partial * Math.sin(fifth)) * amp * edge(span, i);
    span.left[i] += s * 0.86;
    span.right[i] += s;
  }
}

function placeFreq(root: number, ratio: number, floor: number) {
  let freq = Math.max(20, root) * ratio;
  while (freq < floor) freq *= 2;
  return freq;
}

function addWind(span: Span) {
  addTone(span, placeFreq(span.root, 0.5, 90), span.level * 0.2, 0.35);
}

function addRoom(span: Span) {
  addTone(span, placeFreq(span.root, 0.25, 70), span.level * 0.14, 0.06);
}

function addRain(span: Span) {
  const rng = rngOf(span.seed);
  let t = span.start + rng() * 0.4;
  while (t < span.end) {
    const f = 1600 + rng() * 4200;
    const pan = rng();
    const i0 = Math.floor(t * RATE);
    const n = Math.floor((0.008 + rng() * 0.01) * RATE);
    const [pl, pr] = panGain(pan);
    let phase = rng() * 6;
    const drop = span.level * (0.16 + rng() * 0.22);
    for (let k = 0; k < n && i0 + k < span.to; k++) {
      phase += (2 * Math.PI * f) / RATE;
      const s = Math.sin(phase) * Math.exp((-k / n) * 5) * drop;
      span.left[i0 + k] += s * pl;
      span.right[i0 + k] += s * pr;
    }
    t += 0.35 + rng() * 0.55;
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

/** Low water in the film's key. Surf sits lower than a river. */
function addWash(span: Span, crash: boolean) {
  addTone(
    span,
    placeFreq(span.root, crash ? 0.25 : 0.375, crash ? 52 : 80),
    span.level * (crash ? 0.2 : 0.15),
    crash ? 0.22 : 0.32,
  );
}

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

function addEngine(span: Span) {
  const firing = 12 + (span.seed % 11);
  let p1 = 0;
  let p2 = 0;
  let p3 = 0;
  const amp = span.level * 0.4;
  for (let i = span.from; i < span.to; i++) {
    const t = (i - span.from) / RATE;
    const hz = firing * (1 + 0.045 * Math.sin(t * 2.1) + 0.02 * Math.sin(t * 5.3));
    const cycle = (t * hz) % 1;
    const knockEnv = Math.exp(-cycle * 16);
    p1 += (2 * Math.PI * hz) / RATE;
    p2 += (2 * Math.PI * hz * 2) / RATE;
    p3 += (2 * Math.PI * hz * 3.02) / RATE;
    const tone = Math.sin(p1) * 0.5 + Math.sin(p2) * 0.24 + Math.sin(p3) * 0.1;
    const s = tone * (0.8 + 0.2 * knockEnv) * amp * edge(span, i);
    span.left[i] += s * 0.82;
    span.right[i] += s;
  }
}

function addPropeller(span: Span) {
  let blade = 0;
  const amp = span.level * 0.36;
  for (let i = span.from; i < span.to; i++) {
    const t = (i - span.from) / RATE;
    const hz = 26 + 8 * Math.sin(t * 0.55) + 3 * Math.sin(t * 1.6);
    blade += (2 * Math.PI * hz) / RATE;
    const chop = 0.82 + 0.18 * Math.abs(Math.sin(blade));
    const motor = Math.sin(blade * 0.33) * 0.28 + Math.sin(blade * 0.66) * 0.12;
    const s = motor * chop * amp * edge(span, i);
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

function addCity(span: Span) {
  addTone(span, placeFreq(span.root, 1, 170), span.level * 0.12, 0.5);
}

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
  wind: addWind,
  rain: addRain,
  thunder: addThunder,
  surf: (span) => addWash(span, true),
  river: (span) => addWash(span, false),
  birds: addBirds,
  insects: addInsects,
  room: addRoom,
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

const LEVEL = 0.05;

/** Pulls a buffer onto one loudness. Used for the score before effects are added. */
function levelTo(left: Float32Array, right: Float32Array, target: number) {
  const n = left.length;
  if (n < 2) return;
  const win = Math.floor(0.18 * RATE);
  const floor = target / 8;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + left[i] * left[i] + right[i] * right[i];
  for (let i = 0; i < n; i++) {
    const end = Math.min(n, i + win);
    const rms = Math.sqrt((prefix[end] - prefix[i]) / (2 * (end - i)));
    const gain = target / Math.max(rms, floor);
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
  const ceiling = target * 2.6;
  const knee = ceiling * 0.9;
  for (let i = 0; i < n; i++) {
    const end = Math.min(n, i + win);
    const rms = Math.sqrt((prefix[end] - prefix[i]) / (2 * (end - i)));
    const gain = rms > target ? target / rms : 1;
    left[i] = softCeiling(left[i] * gain, ceiling, knee);
    right[i] = softCeiling(right[i] * gain, ceiling, knee);
  }
}

function softCeiling(sample: number, ceiling: number, knee: number) {
  const ax = Math.abs(sample);
  if (ax <= knee) return sample;
  const span = ceiling - knee;
  const shaped = knee + span * Math.tanh((ax - knee) / span);
  return Math.sign(sample) * Math.min(ceiling, shaped);
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
 * Every film, live or saved, comes through here. The score is leveled first.
 * Effects from the shot are mixed under it, then the sum is held so nothing can jump.
 */
export function renderSoundtrack(script: VideoScript): AudioBuffer {
  const layers = resolveScore(script);
  const root = scoreRoot(script);
  const buffer = new AudioBuffer({
    length: Math.max(1, Math.ceil(script.totalDuration * RATE)),
    numberOfChannels: 2,
    sampleRate: RATE,
  });
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (const layer of layers) {
    const span = spanOf(left, right, layer, !continues(layers, layer, "start"), !continues(layers, layer, "end"));
    if (span) {
      span.root = root;
      RENDER[layer.cue](span);
    }
  }
  // Effects sit under the score. They follow the shot and cannot cover it.
  const effectGain = 0.2;
  for (let i = 0; i < left.length; i++) {
    left[i] *= effectGain;
    right[i] *= effectGain;
  }
  const scoreL = new Float32Array(left.length);
  const scoreR = new Float32Array(right.length);
  addUnderscore(scoreL, scoreR, script);
  levelTo(scoreL, scoreR, LEVEL);
  for (let i = 0; i < left.length; i++) {
    left[i] += scoreL[i];
    right[i] += scoreR[i];
  }
  holdLevel(left, right, LEVEL);
  return buffer;
}
