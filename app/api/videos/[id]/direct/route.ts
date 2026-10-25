import { requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { directFilm } from "@/lib/server/gemini";
import { failure, json, limit, sameOrigin } from "@/lib/server/http";
import { productionOf } from "@/lib/server/production";
import { ownedVideo } from "@/lib/server/videos";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Writes a film's storyboard while its models are being built, and keeps it for the finish step. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    const row = await ownedVideo((await context.params).id, user.id);
    const { requests } = productionOf(row);
    await limit(`direct:${row.id}`, 4, 3600);
    const story = await directFilm(
      {
        prompt: row.prompt,
        duration: row.duration,
        research: row.research ?? "",
        requests,
        aspect: row.aspect === "landscape" ? "landscape" : "portrait",
      },
      request.signal,
    );
    await query(
      "UPDATE ph_videos SET plan=jsonb_set(plan,'{production,story}',$2::jsonb),updated_at=now() WHERE id=$1 AND status='scripting'",
      [row.id, JSON.stringify(story)],
    );
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
