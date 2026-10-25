import {
  inferScoreMood,
  isScoreMood,
  toneOf,
  type ScoreMood,
  type ScoreTone,
  type VideoScript,
} from "@/lib/schema/video";

const RATE = 48000;

/**
 * Original underscores, one character per mood the director can choose.
 * None of these is a quotation. Loudness is leveled later; only the
 * notes, the tempo, and the register change from film to film.
 */
const BEDS: Record<ScoreMood, { bpm: number; chords: number[][]; decay: number }> = {
  solemn: {
    bpm: 60,
    decay: 2.2,
    chords: [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [196, 246.94, 293.66],
      [164.81, 196, 246.94],
    ],
  },
  mournful: {
    bpm: 54,
    decay: 1.35,
    chords: [
      [146.83, 174.61, 220],
      [130.81, 155.56, 196],
      [110, 130.81, 164.81],
      [146.83, 174.61, 196],
    ],
  },
  tense: {
    bpm: 72,
    decay: 3.4,
    chords: [
      [220, 233.08, 329.63],
      [196, 207.65, 293.66],
      [174.61, 185, 261.63],
      [233.08, 277.18, 349.23],
    ],
  },
  martial: {
    bpm: 76,
    decay: 3.1,
    chords: [
      [164.81, 246.94, 329.63],
      [146.83, 220, 293.66],
      [196, 293.66, 392],
      [174.61, 261.63, 349.23],
    ],
  },
  pastoral: {
    bpm: 63,
    decay: 1.8,
    chords: [
      [196, 246.94, 293.66],
      [174.61, 220, 261.63],
      [220, 277.18, 329.63],
      [164.81, 196, 246.94],
    ],
  },
  hopeful: {
    bpm: 68,
    decay: 2,
    chords: [
      [261.63, 329.63, 392],
      [196, 246.94, 293.66],
      [220, 277.18, 329.63],
      [174.61, 220, 261.63],
    ],
  },
  wonder: {
    bpm: 58,
    decay: 1.6,
    chords: [
      [293.66, 440, 293.66],
      [246.94, 369.99, 246.94],
      [220, 329.63, 220],
      [196, 293.66, 196],
    ],
  },
  urgent: {
    bpm: 92,
    decay: 4.2,
    chords: [
      [164.81, 196, 246.94],
      [146.83, 174.61, 220],
      [130.81, 164.81, 196],
      [174.61, 207.65, 261.63],
    ],
  },
};

/** Small key shifts so two films that share a mood do not share a pitch. */
const TUNINGS = [1, 1.122462, 0.890899, 1.059463];

type Span = { start: number; end: number; tone: ScoreTone };

export function scoreRoot(script: VideoScript): number {
  const bed = BEDS[moodOf(script)];
  const tune = TUNINGS[(script.seed ?? 0) % TUNINGS.length];
  const turn = Math.floor((script.seed ?? 0) / TUNINGS.length) % bed.chords.length;
  return bed.chords[turn][0] * tune;
}

function moodOf(script: VideoScript): ScoreMood {
  const mood = script.music?.mood;
  return isScoreMood(mood) ? mood : inferScoreMood(script);
}

function spansOf(script: VideoScript): Span[] {
  let origin = 0;
  return script.scenes.map((scene) => {
    const span = { start: origin, end: origin + scene.duration, tone: toneOf(scene) };
    origin += scene.duration;
    return span;
  });
}

function toneAt(spans: Span[], t: number): ScoreTone {
  let index = spans.length - 1;
  for (let i = 0; i < spans.length; i++) {
    if (t < spans[i].end) {
      index = i;
      break;
    }
  }
  const span = spans[index];
  const into = t - span.start;
  if (index === 0 || into >= 0.14) return span.tone;
  return into / 0.14 < 0.5 ? spans[index - 1].tone : span.tone;
}

function register(tone: ScoreTone): number {
  return tone === "dark" || tone === "spare" ? 0.5 : 1;
}

/** Adds the score into an existing stereo buffer. */
export function addUnderscore(left: Float32Array, right: Float32Array, script: VideoScript) {
  const spans = spansOf(script);
  if (!spans.length || left.length < 2) return;
  const bed = BEDS[moodOf(script)];
  const beat = 60 / bed.bpm;
  const bar = beat * 4;
  const tune = TUNINGS[(script.seed ?? 0) % TUNINGS.length];
  const turn = Math.floor((script.seed ?? 0) / TUNINGS.length) % bed.chords.length;
  let notePhase = 0;
  let notePhase2 = 0;
  let rootPhase = 0;
  let rootPhase2 = 0;
  for (let i = 0; i < left.length; i++) {
    const t = i / RATE;
    const tone = toneAt(spans, t);
    const chord = bed.chords[(Math.floor(t / bar) + turn) % bed.chords.length];
    const step = Math.floor(t / beat) % 4;
    const local = (t % beat) / beat;
    const octave = register(tone);
    const degree = tone === "spare" ? 0 : step % 3;
    const note = chord[degree] * octave * tune;
    notePhase += (2 * Math.PI * note) / RATE;
    notePhase2 += (2 * Math.PI * note * 2) / RATE;
    const held = Math.min(1, local * 80, (1 - local) * 80);
    const decay = Math.exp(-local * bed.decay);
    const upper = tone === "bright" ? 0.16 : tone === "dark" ? 0.04 : tone === "spare" ? 0.02 : 0.1;
    const color = tone === "spare" ? 0 : 0.035;
    const voice = Math.sin(notePhase) * 0.46 + Math.sin(notePhase2) * upper + Math.sin(notePhase * 3) * color;
    const ost = voice * held * decay * 0.11;
    const root = (chord[0] / 2) * octave * tune;
    rootPhase += (2 * Math.PI * root) / RATE;
    rootPhase2 += (2 * Math.PI * root * 2) / RATE;
    const drone =
      (Math.sin(rootPhase) * 0.07 + Math.sin(rootPhase2) * 0.018 + Math.sin(rootPhase * 1.5) * 0.012) * 0.84;
    const pan = 0.12 * Math.sin((2 * Math.PI * t) / bar);
    const sample = ost + drone;
    left[i] += sample * (1 - pan);
    right[i] += sample * (1 + pan);
  }
}
