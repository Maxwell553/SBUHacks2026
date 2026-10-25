import type { Scene, VideoScript } from "@/lib/schema/video";

const RATE = 48000;
const BPM = 66;
const BEAT = 60 / BPM;

/**
 * Original underscore: a slow minor ostinato and a low drone.
 * One continuous piece for the whole film, held at one level.
 * It is not a quotation of any existing work.
 */
const CHORDS = [
  [220, 329.63, 261.63],
  [174.61, 261.63, 220],
  [130.81, 196, 164.81],
  [196, 293.66, 246.94],
];

type Span = { start: number; end: number; gain: number; dark: boolean };

function spansOf(script: VideoScript): Span[] {
  let origin = 0;
  return script.scenes.map((scene) => {
    const span = { start: origin, end: origin + scene.duration, ...moodOf(scene) };
    origin += scene.duration;
    return span;
  });
}

function moodOf(scene: Scene): { gain: number; dark: boolean } {
  const interior = scene.layout === "interior";
  const vacuum = !interior && (scene.setting === "orbit" || scene.setting === "lunar");
  const night = scene.timeOfDay === "night" || scene.timeOfDay === "dusk";
  const storm = scene.weather === "storm" || scene.setting === "battlefield";
  return { gain: 0.84, dark: vacuum || night || storm };
}

function gainAt(spans: Span[], t: number): { gain: number; dark: boolean } {
  let index = spans.length - 1;
  for (let i = 0; i < spans.length; i++) {
    if (t < spans[i].end) {
      index = i;
      break;
    }
  }
  const span = spans[index];
  const into = t - span.start;
  if (index === 0 || into >= 0.14) return span;
  const prev = spans[index - 1];
  const k = into / 0.14;
  return { gain: prev.gain + (span.gain - prev.gain) * k, dark: k < 0.5 ? prev.dark : span.dark };
}

/** Adds the score into an existing stereo buffer. */
export function addUnderscore(left: Float32Array, right: Float32Array, script: VideoScript) {
  const spans = spansOf(script);
  if (!spans.length || left.length < 2) return;
  const bar = BEAT * 4;
  let notePhase = 0;
  let notePhase2 = 0;
  let rootPhase = 0;
  let rootPhase2 = 0;
  for (let i = 0; i < left.length; i++) {
    const t = i / RATE;
    const { gain, dark } = gainAt(spans, t);
    const chord = CHORDS[Math.floor(t / bar) % CHORDS.length];
    const step = Math.floor(t / BEAT) % 4;
    const local = (t % BEAT) / BEAT;
    const octave = dark ? 0.5 : 1;
    const note = chord[step % 3] * octave;
    notePhase += (2 * Math.PI * note) / RATE;
    notePhase2 += (2 * Math.PI * note * 2) / RATE;
    const held = Math.min(1, local * 80, (1 - local) * 80);
    const tone = Math.sin(notePhase) * 0.62 + Math.sin(notePhase2) * (dark ? 0.04 : 0.1);
    const ost = tone * held * 0.09 * gain;
    const root = (chord[0] / 2) * (dark ? 0.5 : 1);
    rootPhase += (2 * Math.PI * root) / RATE;
    rootPhase2 += (2 * Math.PI * root * 2) / RATE;
    const drone = (Math.sin(rootPhase) * 0.075 + Math.sin(rootPhase2) * 0.02) * gain;
    const pan = 0.12 * Math.sin((2 * Math.PI * t) / bar);
    const sample = ost + drone;
    left[i] += sample * (1 - pan);
    right[i] += sample * (1 + pan);
  }
}
