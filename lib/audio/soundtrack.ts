import type { VideoScript } from "@/lib/schema/video";

/** Deterministic environmental soundtrack. No voice, remote assets or permissions. */
export function renderSoundtrack(script: VideoScript): AudioBuffer {
  const rate = 48000;
  const buffer = new AudioBuffer({
    length: Math.ceil(script.totalDuration * rate),
    numberOfChannels: 2,
    sampleRate: rate,
  });
  let start = 0;
  let seed = script.seed || 431;
  let brown = 0;
  for (const scene of script.scenes) {
    const interior = scene.layout === "interior";
    const water = !interior && ["ocean", "coast", "river"].includes(scene.setting);
    const rain = !interior && ["rain", "storm"].includes(scene.weather);
    const space = !interior && ["orbit", "lunar"].includes(scene.setting);
    const machinery = scene.elements.some((e) => ["march", "sail", "ride"].includes(e.motion));
    const from = Math.floor(start * rate),
      to = Math.min(buffer.length, Math.floor((start + scene.duration) * rate));
    const left = buffer.getChannelData(0),
      right = buffer.getChannelData(1);
    for (let i = from; i < to; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = seed / 2147483648 - 1;
      brown = (brown + white * 0.025) / 1.025;
      const t = i / rate,
        local = t - start;
      const fade = Math.min(1, local / 0.22, (scene.duration - local) / 0.35);
      const swell = 0.7 + 0.3 * Math.sin(t * (water ? 0.7 : 0.24));
      // Sheltered rooms get a quiet, muffled bed instead of outdoor wind/surf.
      const bed =
        brown * (interior ? 0.12 : rain ? 0.5 : water ? 0.65 : 0.3) * swell +
        white * (interior ? 0.0005 : rain ? 0.024 : 0.002);
      const rumble = machinery ? Math.sin(t * 2 * Math.PI * 57) * 0.008 * (0.6 + 0.4 * Math.sin(t * 3)) : 0;
      const sample = space ? 0 : (bed + rumble) * Math.max(0, fade);
      left[i] = sample * (0.95 + 0.05 * Math.sin(t * 0.6));
      right[i] = sample * (0.95 - 0.05 * Math.sin(t * 0.6));
    }
    start += scene.duration;
  }
  return buffer;
}
