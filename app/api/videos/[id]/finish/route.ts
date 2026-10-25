import { requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { assembleFilm, loadBuiltModel } from "@/lib/server/gemini";
import { ApiError, failure, json, sameOrigin } from "@/lib/server/http";
import { productionOf } from "@/lib/server/production";
import { ownedVideo, videoResponse } from "@/lib/server/videos";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Joins the storyboard with the built models, validates and moderates the film, and marks it ready to render. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    const row = await ownedVideo((await context.params).id, user.id);
    const { requests, story } = productionOf(row);
    if (!story) throw new ApiError(409, "The storyboard isn't written yet.");
    const models = await Promise.all(requests.map((r) => loadBuiltModel(user.id, r)));
    if (models.some((m) => !m)) throw new ApiError(409, "Some models aren't built yet.");
    const signal = AbortSignal.any([AbortSignal.timeout(60_000), request.signal]);
    const script = await assembleFilm(
      story,
      models.filter((m) => !!m),
      row.duration,
      signal,
      {
        userId: user.id,
        videoId: row.id,
      },
    );
    const { rows } = await query(
      "UPDATE ph_videos SET status='ready',title=$2,plan=$3,updated_at=now() WHERE id=$1 AND status='scripting' RETURNING *",
      [row.id, script.title, JSON.stringify(script)],
    );
    if (!rows[0]) throw new ApiError(409, "This video changed while it was being finished.");
    return json({ video: videoResponse(rows[0]) });
  } catch (error) {
    return failure(error);
  }
}
