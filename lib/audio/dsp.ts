/** Small, deterministic signal helpers shared by the soundtrack and its tests. */

export type Coefficients = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** RBJ cookbook biquads. `q` defaults to a Butterworth response. */
export function biquad(kind: "lowpass" | "highpass" | "bandpass", hz: number, rate: number, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * Math.min(hz, rate * 0.45)) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const [b0, b1, b2] =
    kind === "lowpass"
      ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
      : kind === "highpass"
        ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
        : [alpha, 0, -alpha];
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/** A running biquad: call it once per sample. */
export function filter(c: Coefficients) {
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  return (x: number) => {
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Filters a buffer in place. */
export function applyFilter(data: Float32Array, c: Coefficients) {
  const step = filter(c);
  for (let i = 0; i < data.length; i++) data[i] = step(data[i]);
}

// ITU-R BS.1770 K-weighting at 48 kHz: a high shelf for the head, then a high-pass.
const K_SHELF: Coefficients = {
  b0: 1.53512485958697,
  b1: -2.69169618940638,
  b2: 1.19839281085285,
  a1: -1.69065929318241,
  a2: 0.73248077421585,
};
const K_HIGHPASS: Coefficients = { b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621 };

/**
 * Integrated loudness in LUFS (BS.1770 with the absolute and relative gates),
 * for 48 kHz stereo. Silence returns -Infinity.
 */
export function integratedLoudness(left: Float32Array, right: Float32Array): number {
  const rate = 48000;
  const shelfL = filter(K_SHELF),
    shelfR = filter(K_SHELF),
    passL = filter(K_HIGHPASS),
    passR = filter(K_HIGHPASS);
  const block = Math.floor(0.4 * rate);
  const hop = Math.floor(0.1 * rate);
  const power = new Float64Array(Math.floor(left.length / hop) + 1);
  for (let i = 0; i < left.length; i++) {
    const l = passL(shelfL(left[i]));
    const r = passR(shelfR(right[i]));
    power[Math.floor(i / hop)] += l * l + r * r;
  }
  const blocks: number[] = [];
  const per = block / hop;
  for (let start = 0; start + per <= power.length - 1; start++) {
    let sum = 0;
    for (let k = 0; k < per; k++) sum += power[start + k];
    blocks.push(sum / block);
  }
  const lufs = (mean: number) => -0.691 + 10 * Math.log10(mean);
  const mean = (values: number[]) => values.reduce((a, v) => a + v, 0) / Math.max(1, values.length);
  const audible = blocks.filter((m) => m > 0 && lufs(m) > -70);
  if (!audible.length) return -Infinity;
  const gate = lufs(mean(audible)) - 10;
  const kept = audible.filter((m) => lufs(m) > gate);
  return lufs(mean(kept.length ? kept : audible));
}

/** Rounds a sample's peaks toward a ceiling instead of clipping them. */
export function softCeiling(sample: number, ceiling: number, knee: number) {
  const ax = Math.abs(sample);
  if (ax <= knee) return sample;
  const span = ceiling - knee;
  const shaped = knee + span * Math.tanh((ax - knee) / span);
  return Math.sign(sample) * Math.min(ceiling, shaped);
}

/** Raised-cosine fades at both ends of a buffer, in place. */
export function fadeEnds(data: Float32Array, rate: number, inSeconds: number, outSeconds: number) {
  const fadeIn = Math.min(data.length, Math.floor(inSeconds * rate));
  for (let i = 0; i < fadeIn; i++) data[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
  const fadeOut = Math.min(data.length, Math.floor(outSeconds * rate));
  for (let k = 0; k < fadeOut; k++) {
    const i = data.length - 1 - k;
    data[i] *= 0.5 - 0.5 * Math.cos((Math.PI * k) / fadeOut);
  }
}
