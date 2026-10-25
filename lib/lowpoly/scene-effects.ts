import type { Scene } from "@/lib/schema/video";
import type { ModelDefinition } from "@/lib/schema/model";

/** Bind environmental fire to its fuel, retaining independent effects when no fuel is authored. */
export function attachEnvironmentalFire(scene: Scene, models: readonly ModelDefinition[]): Scene {
  const definitions = new Map(models.map((model) => [model.id, model]));
  const fire = scene.elements.filter((e) => definitions.get(e.model)?.category === "effect" && e.motion === "burn");
  if (!fire.length) return scene;
  const fuel = scene.elements.filter(
    (e) =>
      ["building", "structure", "nature"].includes(definitions.get(e.model)?.category ?? "") &&
      (e.motion === "idle" || e.motion === "burn"),
  );
  if (!fuel.length) return scene;
  const hasSolidSubject = scene.elements.some((e) => !fire.includes(e) && (!e.role || e.role === "subject"));
  return {
    ...scene,
    elements: scene.elements
      .filter((e) => !fire.includes(e))
      .map((e) => (fuel.includes(e) ? { ...e, motion: "burn", role: !hasSolidSubject ? "subject" : e.role } : e)),
  };
}
