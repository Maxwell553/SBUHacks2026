import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { buildModel, STEP_DEADLINE_MS } from "@/lib/server/gemini";
import { ApiError, body, failure, json, limit, sameOrigin } from "@/lib/server/http";
import { MAX_PLANNED_MODELS } from "@/lib/server/model-planning";
import { productionOf } from "@/lib/server/production";
import { ownedVideo } from "@/lib/server/videos";
export const runtime = "nodejs";
export const maxDuration = 300;

const input = z.object({ models: z.array(z.string().max(40)).min(1).max(MAX_PLANNED_MODELS) });

/** Builds some of a film's planned models in parallel. Each finished model is cached for the finish step. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    const row = await ownedVideo((await context.params).id, user.id);
    const { requests } = productionOf(row);
    // Retries for each planned model, not a cap on how many films anyone makes.
    await limit(`build:${row.id}`, MAX_PLANNED_MODELS * 3, 3600);
    const parsed = input.safeParse(await body(request));
    if (!parsed.success) throw new ApiError(400, "Choose which models to build.");
    const wanted = requests.filter((r) => parsed.data.models.includes(r.id));
    if (!wanted.length) throw new ApiError(400, "Those models are not part of this film.");
    const deadline = Date.now() + STEP_DEADLINE_MS;
    const results = await Promise.allSettled(
      wanted.map((r) => buildModel(user.id, row.research ?? "", r, request.signal, deadline)),
    );
    return json({
      built: wanted.filter((_, i) => results[i].status === "fulfilled").map((r) => r.id),
      failed: wanted.filter((_, i) => results[i].status === "rejected").map((r) => r.id),
    });
  } catch (error) {
    return failure(error);
  }
}
