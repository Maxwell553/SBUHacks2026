import { z } from "zod";
import { ApiError } from "@/lib/server/http";
import { modelRequestSchema, type ModelRequest } from "@/lib/server/model-planning";

/**
 * A film in production keeps its model plan and, once written, its raw
 * storyboard in ph_videos.plan while its status is 'scripting'. The steps
 * (build, direct, finish) are separate requests so each stays short.
 */
const productionSchema = z.object({
  production: z.object({
    requests: z.array(modelRequestSchema).min(1),
    story: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type Production = { requests: ModelRequest[]; story?: Record<string, unknown> };

export function productionOf(row: Record<string, unknown>): Production {
  const parsed = productionSchema.safeParse(row.plan);
  if (row.status !== "scripting" || !parsed.success) throw new ApiError(409, "This video is not being produced.");
  return parsed.data.production;
}
