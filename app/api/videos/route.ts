import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/server/auth";
import { query, transaction } from "@/lib/server/db";
import { body, sameOrigin, json, failure, ApiError } from "@/lib/server/http";
import { videoResponse } from "@/lib/server/videos";
import { moderate, planModels, researchEvent, STEP_DEADLINE_MS } from "@/lib/server/gemini";
export const runtime = "nodejs";
export const maxDuration = 300;
const input = z.object({
  prompt: z.string().trim().min(8).max(2000),
  duration: z.number().int().min(20).max(60).default(40),
  aspect: z.enum(["landscape", "portrait"]).default("landscape"),
});
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await query(
      "DELETE FROM ph_videos WHERE user_id=$1 AND (status IN ('failed','rejected') OR (status<>'rendered' AND updated_at<now()-interval '30 minutes'))",
      [user.id],
    );
    const { rows } = await query(
      "SELECT id,prompt,title,duration,aspect,status,sources,error,created_at,updated_at,gif_asset_id,poster_asset_id,gif_bytes FROM ph_videos WHERE user_id=$1 AND (status='rendered' OR $2::boolean) ORDER BY created_at DESC LIMIT 100",
      [user.id, new URL(request.url).searchParams.get("active") === "1"],
    );
    return json({ videos: rows.map(videoResponse) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  let id: string | undefined;
  try {
    sameOrigin(request);
    const user = await requireUser();
    const parsed = input.safeParse(await body(request));
    if (!parsed.success)
      throw new ApiError(400, "Describe a historical event in 8–2000 characters and choose 20–60 seconds.");
    const { prompt, duration, aspect } = parsed.data;
    id = await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [user.id]);
      const {
        rows: [usage],
      } = await db.query(
        "SELECT count(*)::int AS count, count(*) FILTER(WHERE status IN ('pending','researching','scripting') AND updated_at>now()-interval '10 minutes')::int AS active FROM ph_videos WHERE user_id=$1",
        [user.id],
      );
      if (usage.active > 0) throw new ApiError(409, "A video is already being researched. Wait for it to finish.");
      if (usage.count >= 100) throw new ApiError(409, "Your library is full. Delete an older video to create another.");
      const videoId = randomUUID();
      await db.query(
        "INSERT INTO ph_videos(id,user_id,prompt,duration,aspect,status) VALUES($1,$2,$3,$4,$5,'pending')",
        [videoId, user.id, prompt, duration, aspect],
      );
      return videoId;
    });
    const signal = AbortSignal.any([AbortSignal.timeout(STEP_DEADLINE_MS), request.signal]);
    const audit = { userId: user.id, videoId: id };
    await moderate(prompt, false, signal, audit);
    signal.throwIfAborted();
    await query("UPDATE ph_videos SET status='researching',updated_at=now() WHERE id=$1", [id]);
    // Reuse only this user's recent sourced briefing for the exact same request.
    // Moderation still runs above; no other user's prompt/research is exposed.
    const { rows: priorResearch } = await query(
      "SELECT research,sources FROM ph_videos WHERE user_id=$1 AND prompt=$2 AND duration=$3 AND id<>$4 AND research IS NOT NULL AND jsonb_array_length(sources)>0 AND created_at>now()-interval '1 day' ORDER BY created_at DESC LIMIT 1",
      [user.id, prompt, duration, id],
    );
    const research = priorResearch[0] ?? (await researchEvent(prompt, duration, signal));
    await query("UPDATE ph_videos SET status='scripting',research=$2,sources=$3,updated_at=now() WHERE id=$1", [
      id,
      research.research,
      JSON.stringify(research.sources),
    ]);
    // Building, directing and assembling follow as separate requests (build, direct, finish)
    // so no single function runs long; this step ends with the model plan.
    const plan = await planModels(prompt, research.research, signal);
    const { rows } = await query("UPDATE ph_videos SET plan=$2,updated_at=now() WHERE id=$1 RETURNING *", [
      id,
      JSON.stringify({ production: { requests: plan.models } }),
    ]);
    return json({ video: videoResponse(rows[0]), models: plan.models.map((m) => ({ id: m.id, name: m.name })) }, 201);
  } catch (error) {
    if (id) {
      await query("DELETE FROM ph_videos WHERE id=$1 AND status<>'rendered'", [id]).catch(() => {});
    }
    return failure(error);
  }
}
