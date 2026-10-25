import type { Scene, VideoScript } from "@/lib/schema/video";

const RATE = 48000;

/**
 * Original underscore: a plucked minor arpeggio over a soft pad and a low drone,
 * one continuous piece for the whole film. Each film's seed picks its key,
 * tempo, chord sequence and arpeggio, so films do not all share one tune.
 * It is not a quotation of any existing work.
 *
 * Chords are semitones above A3 (220 Hz), root first.
 */
const PROGRESSIONS: number[][][] = [
  // i – VI – III – VII
  [
    [0, 3, 7],
    [-4, 0, 3],
    [3, 7, 10],
    [-2, 2, 5],
  ],
  // i – iv – VI – V
  [
    [0, 3, 7],
    [-7, -4, 0],
    [-4, 0, 3],
    [-5, -1, 2],
  ],
  // i – VII – VI – VII
  [
    [0, 3, 7],
    [-2, 2, 5],
    [-4, 0, 3],
    [-2, 2, 5],
  ],
  // i – v – VI – iv
  [
    [0, 3, 7],
    [-5, -2, 2],
    [-4, 0, 3],
    [-7, -4, 0],
  ],
];
/** Which chord tone each beat of a bar plays; 3 is the root an octave up. */
const ARPEGGIOS = [
  [0, 1, 2, 1],
  [0, 2, 1, 2],
  [0, 1, 2, 3],
  [2, 1, 0, 1],
];
/** Ping-pong echo of the arpeggio. */
const ECHO_FEEDBACK = 0.34;

type Span = { start: number; end: number; dark: boolean };

function spansOf(script: VideoScript): Span[] {
  let origin = 0;
  return script.scenes.map((scene) => {
    const span = { start: origin, end: origin + scene.duration, dark: darkOf(scene) };
    origin += scene.duration;
    return span;
  });
}

function darkOf(scene: Scene): boolean {
  const interior = scene.layout === "interior";
  const vacuum = !interior && (scene.setting === "orbit" || scene.setting === "lunar");
  const night = scene.timeOfDay === "night" || scene.timeOfDay === "dusk";
  const storm = scene.weather === "storm" || scene.setting === "battlefield";
  return vacuum || night || storm;
}

/** 0 for a bright shot, 1 for a dark one, eased across each cut. */
function darknessAt(spans: Span[], t: number): number {
  let index = spans.length - 1;
  for (let i = 0; i < spans.length; i++) {
    if (t < spans[i].end) {
      index = i;
      break;
    }
  }
  const span = spans[index];
  const value = span.dark ? 1 : 0;
  const into = t - span.start;
  if (index === 0 || into >= 0.6) return value;
  const prev = spans[index - 1].dark ? 1 : 0;
  return prev + (value - prev) * (into / 0.6);
}

function hash(seed: number, salt: number): number {
  let h = Math.imul((seed >>> 0) ^ (salt * 0x9e3779b9), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The film's musical choices, all from its seed. */
export function scoreOf(script: VideoScript) {
  const seed = script.seed || 431;
  return {
    bpm: 60 + (hash(seed, 1) % 17),
    transpose: (hash(seed, 2) % 7) - 3,
    progression: PROGRESSIONS[hash(seed, 3) % PROGRESSIONS.length],
    arpeggio: ARPEGGIOS[hash(seed, 4) % ARPEGGIOS.length],
  };
}

const hz = (semitones: number) => 220 * 2 ** (semitones / 12);

/** Adds the score into an existing stereo buffer. */
export function addUnderscore(left: Float32Array, right: Float32Array, script: VideoScript) {
  const spans = spansOf(script);
  const n = left.length;
  if (!spans.length || n < 2) return;
  const { bpm, transpose, progression, arpeggio } = scoreOf(script);
  const beat = 60 / bpm;
  const bar = beat * 4;
  const release = 0.012 / beat;
  const pluck = new Float32Array(n);
  // Angular steps per sample for each chord tone, worked out once.
  const step0 = (2 * Math.PI) / RATE;
  const chords = progression.map((chord) => chord.map((semitones) => hz(semitones + transpose) * step0));
  const detune = [0.9985, 1, 1.0015];
  let notePhase = 0;
  const padPhase = [0, 0, 0, 0, 0, 0];
  let dronePhase = 0;
  let droneStep = chords[0][0] / 2;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const darkness = darknessAt(spans, t);
    const barIndex = Math.floor(t / bar);
    const chord = chords[barIndex % chords.length];
    const next = chords[(barIndex + 1) % chords.length];
    const intoBar = t / bar - barIndex;

    // Plucked arpeggio, one note a beat, decaying and released just before the next.
    const step = Math.floor(t / beat) % 4;
    const local = (t % beat) / beat;
    const tone = arpeggio[step];
    notePhase += tone === 3 ? chord[0] * 2 : chord[tone];
    const envelope = Math.min(1, local / 0.01) * Math.exp(-local / 1.3) * Math.min(1, (1 - local) / release);
    const bright = 0.32 - 0.2 * darkness;
    pluck[i] =
      (Math.sin(notePhase) + bright * Math.sin(2 * notePhase) + 0.12 * (1 - darkness) * Math.sin(3 * notePhase)) *
      envelope *
      0.075;

    // Soft pad on the chord, slightly detuned, crossfading into the next chord at the end of each bar.
    // Two oscillator banks take turns, so the bank fading in carries straight on into the next bar.
    const blend = intoBar > 0.9 ? (intoBar - 0.9) / 0.1 : 0;
    const current = (barIndex % 2) * 3;
    const upcoming = 3 - current;
    let pad = 0;
    for (let v = 0; v < 3; v++) {
      padPhase[current + v] += chord[v] * detune[v];
      padPhase[upcoming + v] += next[v] * detune[v];
      pad += Math.sin(padPhase[current + v]) * (1 - blend) + (blend ? Math.sin(padPhase[upcoming + v]) * blend : 0);
    }
    pad *= 0.036;

    // Drone on the chord root, gliding to each new root rather than jumping.
    droneStep += (chord[0] / 2 - droneStep) * 0.0004;
    dronePhase += droneStep;
    const drone = (Math.sin(dronePhase) * 0.055 + Math.sin(2 * dronePhase) * 0.02) * (1 - 0.25 * darkness);

    const pan = 0.12 * Math.sin((2 * Math.PI * t) / bar);
    const bed = pad + drone;
    left[i] += bed * (1 - pan) + pluck[i] * (1 - pan);
    right[i] += bed * (1 + pan) + pluck[i] * (1 + pan);
  }
  // The arpeggio's echo bounces left then right.
  const delay = Math.max(1, Math.round(beat * 0.75 * RATE));
  const wetL = new Float32Array(n);
  const wetR = new Float32Array(n);
  for (let i = delay; i < n; i++) {
    wetL[i] = ECHO_FEEDBACK * (pluck[i - delay] + wetR[i - delay]);
    wetR[i] = ECHO_FEEDBACK * wetL[i - delay];
    left[i] += wetL[i];
    right[i] += wetR[i];
  }
}
