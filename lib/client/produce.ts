"use client";
import { ApiError, videos, type PlannedModel, type Video } from "@/lib/client/api";

export interface ProduceProgress {
  built: number;
  total: number;
  storyboard: boolean;
}

/**
 * Runs a planned film's production as short requests: the models are built
 * while the storyboard is written, then the server assembles the film.
 * A model that misses the two-minute budget is left out. The film continues
 * with the models that finished. Nothing built at all still stops the film.
 */
export async function produceFilm(
  video: Video,
  models: PlannedModel[],
  onProgress?: (p: ProduceProgress) => void,
  signal?: AbortSignal,
): Promise<Video> {
  // A failed request stops the other side. A short model list does not.
  const stop = new AbortController();
  signal = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
  const total = models.length;
  let built = 0;
  let storyboard = false;
  const report = () => onProgress?.({ built, total, storyboard });
  report();

  const ids = models.map((m) => m.id);
  const buildAll = async () => {
    const result = await videos.build(video.id, ids, signal);
    built = result.built.length;
    report();
    if (!built) throw new ApiError(502, "Some of the 3D models couldn’t be finished. Please try again.");
  };
  const direct = async () => {
    await videos.direct(video.id, signal);
    storyboard = true;
    report();
  };

  await Promise.all(
    [buildAll, direct].map((task) =>
      task().catch((error: unknown) => {
        stop.abort();
        throw error;
      }),
    ),
  );
  const { video: ready } = await videos.finish(video.id, signal);
  return ready;
}
