import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "@/lib/server/db";
import { ApiError } from "@/lib/server/http";
import { ownedVideo, uuid } from "@/lib/server/videos";
export const CHUNK_SIZE = 1024 * 1024;
export const uploadSchema = z.object({
  mime: z.enum(["image/gif", "image/jpeg", "video/webm", "video/mp4"]),
  totalBytes: z
    .number()
    .int()
    .min(6)
    .max(32 * CHUNK_SIZE),
  chunkCount: z.number().int().min(1).max(32),
});
export async function createUpload(videoId: string, userId: string, input: z.infer<typeof uploadSchema>) {
  await ownedVideo(videoId, userId);
  if (input.chunkCount !== Math.ceil(input.totalBytes / CHUNK_SIZE))
    throw new ApiError(400, "Chunk count does not match file size.");
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('polyhistor-storage-quota'))");
    // Expired incomplete uploads can be safely replaced; completed assets remain until explicit deletion.
    await db.query("DELETE FROM ph_assets WHERE complete=false AND created_at<now()-interval '1 day'");
    const {
      rows: [usage],
    } = await db.query(
      `SELECT coalesce(sum(a.total_bytes),0)::bigint AS total,
   coalesce(sum(a.total_bytes) FILTER (WHERE v.user_id=$1),0)::bigint AS personal
   FROM ph_assets a JOIN ph_videos v ON v.id=a.video_id`,
      [userId],
    );
    if (
      Number(usage.total) + input.totalBytes > 700 * CHUNK_SIZE ||
      Number(usage.personal) + input.totalBytes > 96 * CHUNK_SIZE
    )
      throw new ApiError(409, "Storage limit reached. Delete an older video before uploading another.");
    const id = randomUUID();
    await db.query("INSERT INTO ph_assets(id,video_id,mime,total_bytes,chunk_count) VALUES($1,$2,$3,$4,$5)", [
      id,
      videoId,
      input.mime,
      input.totalBytes,
      input.chunkCount,
    ]);
    return { assetId: id, chunkSize: CHUNK_SIZE };
  });
}
export async function ownedAsset(videoId: string, assetId: string, userId: string) {
  if (!uuid.safeParse(assetId).success) throw new ApiError(404, "Asset not found.");
  await ownedVideo(videoId, userId);
  const { rows } = await query("SELECT * FROM ph_assets WHERE id=$1 AND video_id=$2", [assetId, videoId]);
  if (!rows[0]) throw new ApiError(404, "Asset not found.");
  return rows[0];
}
export async function writeChunk(request: Request, videoId: string, assetId: string, index: number, userId: string) {
  const asset = await ownedAsset(videoId, assetId, userId);
  if (asset.complete) throw new ApiError(409, "This render is already saved.");
  if (!Number.isInteger(index) || index < 0 || index >= asset.chunk_count)
    throw new ApiError(400, "Invalid chunk index.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Missing chunk data.");
  let size = 0;
  const pieces: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > CHUNK_SIZE) {
      await reader.cancel();
      throw new ApiError(413, "Chunk exceeds 1 MiB.");
    }
    pieces.push(value);
  }
  const expected = index === asset.chunk_count - 1 ? asset.total_bytes - index * CHUNK_SIZE : CHUNK_SIZE;
  if (size !== expected) throw new ApiError(400, "Chunk has incorrect length.");
  const data = Buffer.concat(pieces);
  await transaction(async (db) => {
    const {
      rows: [locked],
    } = await db.query("SELECT complete FROM ph_assets WHERE id=$1 FOR UPDATE", [assetId]);
    if (!locked || locked.complete) throw new ApiError(409, "Upload is no longer writable.");
    await db.query(
      "INSERT INTO ph_asset_chunks(asset_id,chunk_index,data) VALUES($1,$2,$3) ON CONFLICT(asset_id,chunk_index) DO UPDATE SET data=excluded.data",
      [assetId, index, data],
    );
  });
}
export async function completeUpload(videoId: string, assetId: string, userId: string) {
  await ownedAsset(videoId, assetId, userId);
  return transaction(async (db) => {
    const {
      rows: [asset],
    } = await db.query("SELECT * FROM ph_assets WHERE id=$1 FOR UPDATE", [assetId]);
    if (asset.complete)
      return {
        mediaUrl: `/api/videos/${videoId}/media?assetId=${assetId}`,
        sha256: asset.sha256,
      };
    const { rows: chunks } = await db.query(
      "SELECT chunk_index,data FROM ph_asset_chunks WHERE asset_id=$1 ORDER BY chunk_index",
      [assetId],
    );
    if (chunks.length !== asset.chunk_count || chunks.reduce((sum, c) => sum + c.data.length, 0) !== asset.total_bytes)
      throw new ApiError(409, "Upload is incomplete. Retry the missing chunks.");
    const first: Buffer = chunks[0].data;
    const signature = first.subarray(0, 6).toString("ascii");
    const valid =
      asset.mime === "image/jpeg"
        ? first.subarray(0, 3).toString("hex") === "ffd8ff"
        : asset.mime === "image/gif"
          ? ["GIF89a", "GIF87a"].includes(signature)
          : asset.mime === "video/webm"
            ? first.subarray(0, 4).toString("hex") === "1a45dfa3"
            : first.subarray(4, 8).toString("ascii") === "ftyp";
    if (!valid) throw new ApiError(400, "Media contents do not match the declared format.");
    const hash = createHash("sha256");
    for (const chunk of chunks) hash.update(chunk.data);
    const digest = hash.digest("hex");
    await db.query("UPDATE ph_assets SET complete=true,sha256=$2 WHERE id=$1", [assetId, digest]);
    if (asset.mime === "image/jpeg")
      await db.query("UPDATE ph_videos SET poster_asset_id=$2,updated_at=now() WHERE id=$1", [videoId, assetId]);
    else if (asset.mime === "image/gif")
      await db.query(
        "UPDATE ph_videos SET status='rendered',gif_asset_id=$2,gif_bytes=$3,updated_at=now() WHERE id=$1",
        [videoId, assetId, asset.total_bytes],
      );
    else await db.query("UPDATE ph_videos SET status='rendered',updated_at=now() WHERE id=$1", [videoId]);
    return {
      mediaUrl: `/api/videos/${videoId}/media?assetId=${assetId}`,
      sha256: digest,
    };
  });
}
