import { requireUser } from "@/lib/server/auth";
import { json, failure, sameOrigin } from "@/lib/server/http";
import { ownedVideo, videoResponse } from "@/lib/server/videos";
import { query } from "@/lib/server/db";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const row = await ownedVideo((await context.params).id, user.id);
    const { rows: assets } = await query(
      'SELECT id,mime,total_bytes AS "totalBytes",sha256,created_at AS "createdAt" FROM ph_assets WHERE video_id=$1 AND complete=true ORDER BY created_at DESC',
      [row.id],
    );
    const movie = assets.find((asset) => ["video/mp4", "video/webm"].includes(asset.mime));
    return json({
      video: {
        ...videoResponse(row),
        assets,
        movieUrl: movie ? `/api/videos/${row.id}/media?assetId=${movie.id}` : null,
        movieMime: movie?.mime ?? null,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const user = await requireUser();
    const row = await ownedVideo((await context.params).id, user.id);
    await query("DELETE FROM ph_videos WHERE id=$1 AND user_id=$2 AND ($3::boolean=false OR status<>'rendered')", [
      row.id,
      user.id,
      new URL(request.url).searchParams.get("incomplete") === "1",
    ]);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
