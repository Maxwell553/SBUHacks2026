import { requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { ApiError, body, failure, json, limit, sameOrigin } from "@/lib/server/http";
import { MAX_REVIEW_ROUNDS, reviewFilm, reviewInputSchema } from "@/lib/server/review";
import { ownedVideo, videoResponse } from "@/lib/server/videos";
import { normalizeVideoScript } from "@/lib/schema/video";
import { stageAllowance } from "@/lib/server/film-budget";
export const runtime = "nodejs";
export const maxDuration = 300;

/** One quality-review round on a film whose script is ready but not yet rendered. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    const row = await ownedVideo((await context.params).id, user.id);
    if (row.status !== "ready" || !row.plan) throw new ApiError(409, "This video is not waiting to be reviewed.");
    // Each round of each film, with room for retries; not a cap on how many films anyone makes.
    await limit(`review:${row.id}`, MAX_REVIEW_ROUNDS * 2, 3600);
    const parsed = reviewInputSchema.safeParse(await body(request, 6_500_000));
    if (!parsed.success) throw new ApiError(400, "The review needs a rendered contact sheet.");
    const script = normalizeVideoScript(row.plan, { targetDuration: row.plan.totalDuration, seed: row.plan.seed });
    const elapsed = Date.now() - new Date(row.created_at as string).getTime();
    const reviewMs = Math.max(3_000, stageAllowance("review", elapsed));
    const deadline = Date.now() + reviewMs;
    const signal = AbortSignal.any([AbortSignal.timeout(reviewMs), request.signal]);
    const result = await reviewFilm(script, parsed.data, signal, { userId: user.id, videoId: row.id }, deadline);
    console.info("Film review", {
      round: parsed.data.round,
      measuredIssues: parsed.data.issues.length,
      verdict: result.verdict,
      shotsChanged: result.shotsChanged,
      modelsRepaired: result.modelsRepaired.length,
    });
    let video = row;
    if (result.script !== script) {
      const { rows } = await query(
        "UPDATE ph_videos SET plan=$2,updated_at=now() WHERE id=$1 AND status='ready' RETURNING *",
        [row.id, JSON.stringify(result.script)],
      );
      if (!rows[0]) throw new ApiError(409, "This video changed while it was being reviewed.");
      video = rows[0];
    }
    return json({
      video: videoResponse(video),
      review: {
        verdict: result.verdict,
        summary: result.summary,
        shotsChanged: result.shotsChanged,
        modelsRepaired: result.modelsRepaired,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
