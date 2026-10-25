/**
 * Narration as one mono track on the film's timeline: each caption's spoken
 * clip starts just after its shot begins, clips never overlap, and a clip that
 * would overrun is sped up a little. Pure and isomorphic, so it can be tested.
 */

/** Seconds into a shot before its line starts. */
const LEAD = 0.2;
/** Silence kept between one line and the next. */
const GAP = 0.15;
/** A line may run this far into the next shot. */
const OVERLAP = 0.6;
/** The fastest a line is played to make it fit. */
export const MAX_SPEED = 1.12;

/** 16-bit little-endian PCM (or a WAV file holding it) as floats, with its sample rate. */
export function decodePcm16(bytes: Uint8Array, fallbackRate: number): { samples: Float32Array; rate: number } {
  let data = bytes;
  let rate = fallbackRate;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (bytes.length >= 12 && tag(0) === "RIFF" && tag(8) === "WAVE") {
    for (let at = 12; at + 8 <= bytes.length;) {
      const size = view.getUint32(at + 4, true);
      if (tag(at) === "fmt ") rate = view.getUint32(at + 12, true);
      if (tag(at) === "data") {
        data = bytes.subarray(at + 8, Math.min(bytes.length, at + 8 + size));
        break;
      }
      at += 8 + size + (size % 2);
    }
  }
  const count = Math.floor(data.length / 2);
  const pcm = new DataView(data.buffer, data.byteOffset, count * 2);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) samples[i] = pcm.getInt16(i * 2, true) / 32768;
  return { samples, rate };
}

/** Linear resampling: `factor` > 1 shortens the clip (faster, slightly higher). */
export function resample(samples: Float32Array, factor: number): Float32Array {
  if (Math.abs(factor - 1) < 1e-6) return samples;
  const out = new Float32Array(Math.max(1, Math.floor(samples.length / factor)));
  for (let i = 0; i < out.length; i++) {
    const at = i * factor;
    const k = Math.floor(at);
    const a = samples[Math.min(k, samples.length - 1)];
    const b = samples[Math.min(k + 1, samples.length - 1)];
    out[i] = a + (b - a) * (at - k);
  }
  return out;
}

/** Drops the silence speech engines pad around a line, keeping a short margin. */
export function trimSilence(samples: Float32Array, rate: number, threshold = 0.003): Float32Array {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) < threshold) start++;
  while (end > start && Math.abs(samples[end - 1]) < threshold) end--;
  const margin = Math.floor(0.03 * rate);
  return samples.subarray(Math.max(0, start - margin), Math.min(samples.length, end + margin));
}

/**
 * Places one clip per shot on the film's timeline. `clips[i]` is shot i's
 * line (or null), `starts[i]` the shot's start in seconds.
 */
export function layoutNarration(
  clips: (Float32Array | null)[],
  starts: number[],
  total: number,
  rate: number,
): Float32Array {
  const track = new Float32Array(Math.ceil(total * rate));
  let cursor = 0;
  clips.forEach((clip, index) => {
    if (!clip?.length) return;
    const start = Math.max(starts[index] + LEAD, cursor);
    const nextStart = index + 1 < starts.length ? starts[index + 1] + OVERLAP : total - 0.3;
    const room = Math.max(0.5, nextStart - start);
    const seconds = clip.length / rate;
    const line = seconds > room ? resample(clip, Math.min(MAX_SPEED, seconds / room)) : clip;
    const from = Math.floor(start * rate);
    const length = Math.min(line.length, track.length - from);
    if (length <= 0) return;
    // A line that still runs past the end of the film fades out over its last 0.3 s.
    const fade = length < line.length ? Math.min(length, Math.floor(0.3 * rate)) : 0;
    for (let k = 0; k < length; k++) {
      const out = fade && k >= length - fade ? (length - k) / fade : 1;
      track[from + k] += line[k] * out;
    }
    cursor = start + line.length / rate + GAP;
  });
  return track;
}

/** A mono 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return bytes;
}
