import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { stageAllowance } from "@/lib/server/film-budget";
import { BUILD_CONCURRENCY, buildModel } from "@/lib/server/gemini";
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
    const elapsed = Date.now() - new Date(row.created_at as string).getTime();
    const deadline = Date.now() + stageAllowance("parallel", elapsed);
    const results: PromiseSettledResult<Awaited<ReturnType<typeof buildModel>>>[] = [];
    for (let i = 0; i < wanted.length; i += BUILD_CONCURRENCY) {
      if (request.signal.aborted || Date.now() >= deadline) break;
      const batch = await Promise.allSettled(
        wanted
          .slice(i, i + BUILD_CONCURRENCY)
          .map((r) => buildModel(user.id, row.research ?? "", r, request.signal, deadline)),
      );
      for (const item of batch) {
        if (item.status === "rejected") {
          const reason = item.reason instanceof Error ? item.reason.message : "failed";
          console.warn("Model build failed", reason.slice(0, 300));
        }
      }
      results.push(...batch);
    }
    return json({
      built: wanted.filter((_, i) => results[i]?.status === "fulfilled").map((r) => r.id),
      failed: wanted.filter((_, i) => results[i]?.status !== "fulfilled").map((r) => r.id),
    });
  } catch (error) {
    return failure(error);
  }
}
