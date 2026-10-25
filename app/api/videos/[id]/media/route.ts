import { requireUser } from "@/lib/server/auth";
import { failure, ApiError } from "@/lib/server/http";
import { ownedVideo, uuid } from "@/lib/server/videos";
import { query } from "@/lib/server/db";
import { CHUNK_SIZE } from "@/lib/server/media";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await ownedVideo(id, user.id);
    const assetId = new URL(request.url).searchParams.get("assetId");
    if (assetId && !uuid.safeParse(assetId).success) throw new ApiError(404, "Render not found.");
    const {
      rows: [asset],
    } = await query(
      `SELECT * FROM ph_assets WHERE video_id=$1 AND complete=true ${assetId ? "AND id=$2" : "AND mime NOT IN ('image/jpeg','audio/wav')"} ORDER BY created_at DESC LIMIT 1`,
      assetId ? [id, assetId] : [id],
    );
    if (!asset) throw new ApiError(404, "No saved render yet.");
    let start = 0,
      end = asset.total_bytes - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${asset.total_bytes}` },
        });
      if (!match[1]) start = Math.max(0, asset.total_bytes - Number(match[2]));
      else start = Number(match[1]);
      if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
      if (start > end || start >= asset.total_bytes || !Number.isSafeInteger(start) || !Number.isSafeInteger(end))
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${asset.total_bytes}` },
        });
    }
    let index = Math.floor(start / CHUNK_SIZE);
    const last = Math.floor(end / CHUNK_SIZE);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (index > last) {
            controller.close();
            return;
          }
          const {
            rows: [chunk],
          } = await query("SELECT data FROM ph_asset_chunks WHERE asset_id=$1 AND chunk_index=$2", [asset.id, index]);
          if (!chunk) throw Error("Missing media chunk");
          const offset = index * CHUNK_SIZE;
          controller.enqueue(
            new Uint8Array(
              chunk.data.subarray(Math.max(0, start - offset), Math.min(chunk.data.length, end - offset + 1)),
            ),
          );
          index++;
        } catch (error) {
          controller.error(error);
        }
      },
    });
    const extension =
      asset.mime === "image/jpeg"
        ? "jpg"
        : asset.mime === "image/gif"
          ? "gif"
          : asset.mime === "video/webm"
            ? "webm"
            : asset.mime === "audio/wav"
              ? "wav"
              : "mp4";
    return new Response(stream, {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": asset.mime,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="polychronicle-${id}.${extension}"`,
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${asset.total_bytes}` } : {}),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
