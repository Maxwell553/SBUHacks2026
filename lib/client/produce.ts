"use client";
import { ApiError, videos, type PlannedModel, type Video } from "@/lib/client/api";

export interface ProduceProgress {
  built: number;
  total: number;
  storyboard: boolean;
}

/** Parallel build requests; with the storyboard request this stays within a browser's six connections per site. */
const BUILD_REQUESTS = 4;

/**
 * Runs a planned film's production as short requests: the models are built in
 * a few parallel groups while the storyboard is written, failed pieces are
 * retried once in a fresh request, then the server assembles the film.
 */
export async function produceFilm(
  video: Video,
  models: PlannedModel[],
  onProgress?: (p: ProduceProgress) => void,
  signal?: AbortSignal,
): Promise<Video> {
  // One piece failing for good fails the film, so stop the other requests too.
  const stop = new AbortController();
  signal = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
  const total = models.length;
  let built = 0;
  let storyboard = false;
  const report = () => onProgress?.({ built, total, storyboard });
  report();

  const ids = models.map((m) => m.id);
  const size = Math.ceil(ids.length / Math.min(BUILD_REQUESTS, ids.length));
  const groups = Array.from({ length: Math.ceil(ids.length / size) }, (_, i) => ids.slice(i * size, (i + 1) * size));
  const buildGroup = async (group: string[]) => {
    let pending = group;
    for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
      const result = await videos.build(video.id, pending, signal);
      built += result.built.length;
      report();
      pending = result.failed;
    }
    if (pending.length) throw new ApiError(502, "Some of the 3D models couldn’t be finished. Please try again.");
  };
  const direct = async () => {
    try {
      await videos.direct(video.id, signal);
    } catch (error) {
      if ((error as Error).name === "AbortError" || !(error instanceof ApiError) || error.status < 500) throw error;
      await videos.direct(video.id, signal);
    }
    storyboard = true;
    report();
  };

  await Promise.all(
    [...groups.map(buildGroup), direct()].map((task) =>
      task.catch((error: unknown) => {
        stop.abort();
        throw error;
      }),
    ),
  );
  const { video: ready } = await videos.finish(video.id, signal);
  return ready;
}
