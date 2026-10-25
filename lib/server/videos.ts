import { z } from "zod";
import { query } from "@/lib/server/db";
import { ApiError } from "@/lib/server/http";
export const uuid = z.string().uuid();
export async function ownedVideo(id: string, userId: string) {
  if (!uuid.safeParse(id).success) throw new ApiError(404, "Video not found.");
  const { rows } = await query("SELECT * FROM ph_videos WHERE id=$1 AND user_id=$2", [id, userId]);
  if (!rows[0]) throw new ApiError(404, "Video not found.");
  return rows[0];
}
export function videoResponse(row: Record<string, unknown>) {
  // While a film is in production, plan holds its working state, not a script.
  const script = row.status === "ready" || row.status === "rendered" ? row.plan : null;
  return {
    id: row.id,
    prompt: row.prompt,
    title: row.title,
    duration: row.duration,
    aspect: row.aspect,
    status: row.status,
    plan: script,
    script,
    research: row.research,
    sources: row.sources,
    error: row.error,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
    gifUrl: row.gif_asset_id ? `/api/videos/${row.id}/media?assetId=${row.gif_asset_id}` : null,
    posterUrl: row.poster_asset_id ? `/api/videos/${row.id}/media?assetId=${row.poster_asset_id}` : null,
    narrationUrl: row.narration_asset_id ? `/api/videos/${row.id}/media?assetId=${row.narration_asset_id}` : null,
    gifBytes: row.gif_bytes ?? null,
    mediaUrl: row.status === "rendered" ? `/api/videos/${row.id}/media` : null,
  };
}
