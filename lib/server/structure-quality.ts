import { ModelLibrary } from "@/lib/lowpoly/compiler";
import type { ModelDefinition } from "@/lib/schema/model";

export type LooseParts = ReturnType<ModelLibrary["structure"]>["detached"];

/** Loose parts a viewer would notice: a real share of the model, or visibly far from it. */
export function looseParts(lib: ModelLibrary, model: ModelDefinition): LooseParts {
  const s = lib.structure(model.id);
  return s.detached.filter((d) => d.share >= 0.005 || d.gap >= s.size * 0.04);
}

/** looseParts for a single model, compiled on its own. */
export function looseOf(model: ModelDefinition): LooseParts {
  const lib = new ModelLibrary([model]);
  try {
    return looseParts(lib, model);
  } finally {
    lib.dispose();
  }
}

export const looseShare = (loose: LooseParts) => loose.reduce((a, d) => a + d.share, 0);

export const describeLoose = (loose: LooseParts) =>
  loose
    .slice(0, 6)
    .map(
      (d) =>
        `parts ${d.parts.join(", ")} float ${d.gap.toFixed(2)} m away from the rest of the model (${(d.share * 100).toFixed(1)}% of its volume)`,
    )
    .join("; ");
