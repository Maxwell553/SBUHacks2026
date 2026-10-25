import assert from "node:assert/strict";
import { decodePcm16, encodeWav, layoutNarration, MAX_SPEED, resample, trimSilence } from "../../lib/audio/voice-track";

const RATE = 24000;
const tone = (seconds: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / RATE));

// A WAV round trip keeps the rate and the samples (to 16-bit precision).
const line = tone(0.5);
const wav = encodeWav(line, RATE);
assert.equal(String.fromCharCode(...wav.subarray(0, 4)), "RIFF");
const decoded = decodePcm16(wav, 16000);
assert.equal(decoded.rate, RATE, "The WAV header's rate wins over the fallback");
assert.equal(decoded.samples.length, line.length);
assert(decoded.samples.every((s, i) => Math.abs(s - line[i]) < 1e-4));
// Raw PCM from the speech model uses the rate from its mime type.
assert.equal(decodePcm16(wav.subarray(44), RATE).samples.length, line.length);

// Engines pad lines with silence; it is trimmed to a short margin.
const padded = new Float32Array(RATE * 2);
padded.set(line, RATE / 2);
const trimmed = trimSilence(padded, RATE);
assert(trimmed.length < line.length + 0.1 * RATE && trimmed.length >= line.length, "Silence trimmed");

assert.equal(resample(line, 1.1).length, Math.floor(line.length / 1.1), "Speeding up shortens the line");

// Layout: each line starts just after its shot, lines never overlap, and an overlong line is sped up only so far.
const starts = [0, 4, 8];
const clips = [tone(2), tone(6), tone(1)];
const track = layoutNarration(clips, starts, 12, RATE);
assert.equal(track.length, 12 * RATE);
const firstSound = (from: number) => {
  for (let i = Math.floor(from * RATE); i < track.length; i++) if (Math.abs(track[i]) > 1e-3) return i / RATE;
  return Infinity;
};
assert(Math.abs(firstSound(0) - 0.2) < 0.01, "The first line starts 0.2 s into its shot");
assert(Math.abs(firstSound(2.3) - 4.2) < 0.01, "The second line waits for its own shot");
// The 6 s line has 4.4 s before the next shot plus a 0.6 s overlap: it is sped up to the limit and still runs over,
// so the third line waits for it to finish.
const secondEnds = 4.2 + 6 / MAX_SPEED;
assert(firstSound(secondEnds + 0.05) >= secondEnds + 0.1, "Lines never overlap");
assert(Number.isFinite(firstSound(secondEnds + 0.05)), "The third line is still heard");
assert(
  track.every((s) => Math.abs(s) <= 0.5 + 1e-6),
  "Lines are placed, not summed",
);

// A line that runs past the end of the film fades out instead of cutting off.
const late = layoutNarration([null, tone(3)], [0, 3], 5, RATE);
assert(Math.abs(late[late.length - 1]) < 0.01, "The last line fades at the end");
assert.equal(layoutNarration([null, null], [0, 3], 5, RATE).some(Boolean), false, "No lines, no sound");

console.log("PASS narration: WAV round trip, silence trimming, shot-aligned lines that never overlap, end fade");
