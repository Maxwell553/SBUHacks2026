import type { ModelChannel } from "@/lib/schema/model";

/**
 * Scene progress for a model's own one-way action: held at its start before the
 * shot that shows it, at its end after, or played across the shot.
 */
export function stageProgress(stage: "before" | "during" | "after" | undefined, progress: number): number {
  return stage === "before" ? 0 : stage === "after" ? 1 : progress;
}

/** Stateless sampling supports seeking, export, and previews in any frame order. */
export function channelValue(c: ModelChannel, time: number, progress: number, flip: boolean): number {
  const keys = c.keyframes;
  if (keys?.length) {
    const p = Math.max(0, Math.min(1, progress));
    let value = keys[0].value;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1],
        b = keys[i];
      if (p >= b.at) {
        value = b.value;
        continue;
      }
      if (p <= a.at) break;
      let t = (p - a.at) / Math.max(1e-9, b.at - a.at);
      if (c.interpolation === "hold") t = 0;
      else if (c.interpolation !== "linear") t = t * t * (3 - 2 * t);
      value = a.value + (b.value - a.value) * t;
      break;
    }
    return c.amplitude * value * (flip ? -1 : 1);
  }
  const phase = (((c.phase ?? 0) + (flip ? 180 : 0)) * Math.PI) / 180;
  const w = 2 * Math.PI * c.frequency;
  switch (c.wave) {
    case "spin":
      return c.property === "rotation" ? c.amplitude * time : c.amplitude * Math.sin(w * time + phase);
    case "pulse":
      return c.amplitude * (0.5 + 0.5 * Math.sin(w * time + phase)) ** 2;
    case "bounce":
      return c.amplitude * Math.abs(Math.sin((w / 2) * time + phase));
    default:
      return c.amplitude * Math.sin(w * time + phase);
  }
}
