import { requireUser } from "@/lib/server/auth";
import { ApiError, failure, json, limit, sameOrigin } from "@/lib/server/http";
import { storeNarration } from "@/lib/server/media";
import { narrateFilm } from "@/lib/server/narration";
import { ownedVideo, videoResponse } from "@/lib/server/videos";
import { normalizeVideoScript } from "@/lib/schema/video";
import { STEP_DEADLINE_MS } from "@/lib/server/gemini";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Records the narration of a film whose script is ready but not yet rendered, and stores it with the video. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    const row = await ownedVideo((await context.params).id, user.id);
    if (row.status !== "ready" || !row.plan) throw new ApiError(409, "This video is not waiting for its narration.");
    // A recording and its retries for each film; not a cap on how many films anyone makes.
    await limit(`narrate:${row.id}`, 3, 3600);
    const script = normalizeVideoScript(row.plan, { targetDuration: row.plan.totalDuration, seed: row.plan.seed });
    const signal = AbortSignal.any([AbortSignal.timeout(STEP_DEADLINE_MS), request.signal]);
    const wav = await narrateFilm(script, signal);
    await storeNarration(row.id, user.id, wav);
    console.info("Film narration", { scenes: script.scenes.length, bytes: wav.length });
    return json({ video: videoResponse(await ownedVideo(row.id, user.id)) });
  } catch (error) {
    return failure(error);
  }
}
