"use client";
import type { Aspect } from "@/lib/schema/video";
import type { ExportProgress } from "@/lib/render/export";

import { uploadAsset } from "@/lib/client/upload";
import { videos, type Video } from "@/lib/client/api";

export type SaveStage = "animating" | "saving" | "done";

export interface SaveProgress {
  stage: SaveStage;
  fraction: number;
  detail?: ExportProgress;
}

/**
 * Animates the video's script into a HD movie + poster in the browser, uploads
 * both, and returns the refreshed video (status "rendered").
 */
export async function saveRender(
  video: Video,
  onProgress?: (p: SaveProgress) => void,
  signal?: AbortSignal,
): Promise<Video> {
  if (!video.script) throw new Error("This video has no scenes yet.");
  const aspect: Aspect = video.aspect === "portrait" ? "portrait" : "landscape";
  const { exportMovie } = await import("@/lib/render/movie");
  const result = await exportMovie(video.script, {
    aspect,
    signal,
    onProgress: (d) => onProgress?.({ stage: "animating", fraction: d.fraction, detail: d }),
  });
  onProgress?.({ stage: "saving", fraction: 0 });
  await uploadAsset(
    video.id,
    result.movie,
    result.mime,
    (f) => onProgress?.({ stage: "saving", fraction: f * 0.9 }),
    signal,
  );
  try {
    await uploadAsset(video.id, result.poster, "image/jpeg", undefined, signal);
  } catch {
    /* the movie is the record; a missing poster only affects thumbnails */
  }
  onProgress?.({ stage: "done", fraction: 1 });
  const { video: fresh } = await videos.get(video.id);
  return fresh;
}

export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function safeHref(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
