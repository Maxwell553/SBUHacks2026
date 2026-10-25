import type { ModelDefinition } from "@/lib/schema/model";
/** Root bobbing and visual effects do not demonstrate an articulated action. */
export function hasUsefulMotion(model: ModelDefinition, articulated: boolean): boolean {
  const byId = new Map(model.parts.map((part) => [part.id, part]));
  let joints = 0;
  let mechanical = false;
  for (const part of model.parts) {
    if (["fire", "smoke", "explosion", "flag"].includes(part.shape)) continue;
    const channels =
      part.animation?.filter((c) => {
        if (c.amplitude === 0) return false;
        if (c.keyframes?.length) return c.keyframes.some((k) => k.value !== c.keyframes![0].value);
        return c.frequency > 0 || (c.wave === "spin" && c.property === "rotation");
      }) ?? [];
    if (channels.length && (part.parent || part.shape !== "group")) mechanical = true;
    if (channels.some((c) => c.property === "rotation") && (part.parent || part.shape !== "group")) {
      // Repetition belongs to the hierarchy, not only the animated leaf.
      let repeated = false;
      let ancestor: typeof part | undefined = part;
      const visited = new Set<string>();
      while (ancestor && !visited.has(ancestor.id)) {
        visited.add(ancestor.id);
        repeated ||= !!ancestor.mirror || (ancestor.repeat?.count ?? 0) > 1;
        ancestor = ancestor.parent ? byId.get(ancestor.parent) : undefined;
      }
      joints += repeated && channels.some((c) => c.property === "rotation" && c.alternate) ? 2 : 1;
    }
  }
  return articulated ? joints >= 2 : mechanical;
}

/** A one-way action cannot be satisfied by decorative periodic motion. */
export function hasProgressiveMotion(model: ModelDefinition): boolean {
  return model.parts.some(
    (part) =>
      !["fire", "smoke", "explosion", "flag"].includes(part.shape) &&
      part.animation?.some((channel) => {
        const keys = channel.keyframes;
        return (
          channel.amplitude !== 0 &&
          !!keys &&
          keys.length >= 2 &&
          Math.abs(keys[keys.length - 1].value - keys[0].value) > 0.05
        );
      }),
  );
}
