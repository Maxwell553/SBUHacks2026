"use client";
/**
 * Offscreen, deterministic export: renders every frame of a script at a
 * fixed timestep (independent of display refresh), encodes an animated GIF
 * in a worker and captures a JPEG poster.
 */
import type { Aspect, VideoScript } from "@/lib/schema/video";
import { PolyEngine } from "@/lib/lowpoly/engine";

export interface ExportProgress {
  phase: "prepare" | "render" | "encode" | "poster";
  fraction: number;
  frame?: number;
  frames?: number;
  fps?: number;
}

export interface ExportResult {
  gif: Blob;
  poster: Blob;
  width: number;
  height: number;
  frames: number;
  fps: number;
  durationMs: number;
}

export const GIF_SIZES: Record<Aspect, [number, number]> = {
  landscape: [512, 288],
  portrait: [288, 512],
};

export const MAX_GIF_BYTES = 32 * 1024 * 1024;
export const MIN_FPS = 6;
const STALL_MS = 30_000;
const MB = 1024 * 1024;

const abortError = () => new DOMException("Export cancelled", "AbortError");
const nextTick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportVideo(
  script: VideoScript,
  o: { aspect: Aspect; fps?: number; colors?: number; onProgress?: (p: ExportProgress) => void; signal?: AbortSignal },
): Promise<ExportResult> {
  let fps = o.fps ?? 10;
  let colors = o.colors ?? 128;
  const [width, height] = GIF_SIZES[o.aspect];
  o.onProgress?.({ phase: "prepare", fraction: 0 });
  await PolyEngine.loadFonts();
  if (o.signal?.aborted) throw abortError();

  let result = await encodeGif(script, width, height, fps, colors, o.onProgress, o.signal);
  while (result.gif.size > MAX_GIF_BYTES && fps > MIN_FPS) {
    fps = Math.max(MIN_FPS, fps - 2);
    colors = 96;
    result = await encodeGif(script, width, height, fps, colors, o.onProgress, o.signal);
  }
  if (result.gif.size > MAX_GIF_BYTES) {
    throw new Error(
      `The GIF is ${(result.gif.size / MB).toFixed(1)} MB, above the ${MAX_GIF_BYTES / MB} MB limit even at ${MIN_FPS} fps. Try a shorter duration.`,
    );
  }
  if (o.signal?.aborted) throw abortError();
  o.onProgress?.({ phase: "poster", fraction: 0.97 });
  const poster = await renderPoster(script, o.aspect);
  o.onProgress?.({ phase: "poster", fraction: 1 });
  return { ...result, poster };
}

async function encodeGif(
  script: VideoScript,
  width: number,
  height: number,
  fps: number,
  colors: number,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw abortError();
  const engine = new PolyEngine(script, { width, height, pixelRatio: 1, shadows: true });
  const ctx = engine.canvas.getContext("2d", { willReadFrequently: true })!;
  const worker = new Worker(new URL("./gif.worker.ts", import.meta.url), { type: "module" });
  const frames = Math.max(1, Math.round(script.totalDuration * fps));
  const starts = new Set(engine.boundaries.map((b) => Math.round(b * fps)));
  let acked = 0;
  let failure: string | null = null;
  let doneBytes: ArrayBuffer | null = null;
  let lastProgress = Date.now();
  const wakers = new Set<() => void>();
  const wakeAll = () => wakers.forEach((w) => w());

  worker.onmessage = (ev) => {
    const m = ev.data as { type: string; bytes?: ArrayBuffer; message?: string };
    if (m.type === "ack") acked++;
    else if (m.type === "done" && m.bytes) doneBytes = m.bytes;
    else if (m.type === "error") failure = m.message ?? "GIF encoder failed";
    lastProgress = Date.now();
    wakeAll();
  };
  worker.onerror = (e) => {
    failure = e.message || "GIF worker crashed";
    wakeAll();
  };

  /** Resolves when cond() holds; rejects on abort, worker failure or a stall. Always cleans up. */
  const waitUntil = (cond: () => boolean, label: string) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: unknown) => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        signal?.removeEventListener("abort", check);
        wakers.delete(check);
        if (err) reject(err);
        else resolve();
      };
      function check() {
        if (signal?.aborted) return finish(abortError());
        if (failure) return finish(new Error(failure));
        if (cond()) return finish();
        if (Date.now() - lastProgress > STALL_MS)
          finish(new Error(`The GIF encoder stopped responding while ${label}. Please retry.`));
      }
      const timer = setInterval(check, 100);
      signal?.addEventListener("abort", check);
      wakers.add(check);
      check();
    });

  try {
    worker.postMessage({ type: "init", width, height, fps, colors });
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw abortError();
      if (failure) throw new Error(failure);
      await waitUntil(() => i - acked < 6, "encoding frames");
      engine.renderAt(i / fps);
      const img = ctx.getImageData(0, 0, width, height);
      worker.postMessage(
        { type: "frame", index: i, data: img.data.buffer, refresh: i === 0 || starts.has(i) || i % 12 === 0 },
        [img.data.buffer],
      );
      if (i % 4 === 0 || i === frames - 1)
        onProgress?.({ phase: "render", fraction: ((i + 1) / frames) * 0.9, frame: i + 1, frames, fps });
      if (i % 8 === 0) await nextTick();
    }
    await waitUntil(() => acked >= frames, "encoding the last frames");
    onProgress?.({ phase: "encode", fraction: 0.93, fps });
    lastProgress = Date.now();
    worker.postMessage({ type: "finish" });
    await waitUntil(() => doneBytes !== null, "finalising the GIF");
    return {
      gif: new Blob([doneBytes!], { type: "image/gif" }),
      width,
      height,
      frames,
      fps,
      durationMs: Math.round((frames / fps) * 1000),
    };
  } finally {
    wakers.clear();
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    engine.dispose();
  }
}

export async function renderPoster(script: VideoScript, aspect: Aspect): Promise<Blob> {
  const [w, h] = aspect === "portrait" ? [540, 960] : [960, 540];
  const engine = new PolyEngine(script, { width: w, height: h, pixelRatio: 1 });
  try {
    const idx = script.scenes.length > 1 ? 1 : 0;
    const start = script.scenes.slice(0, idx).reduce((a, s) => a + s.duration, 0);
    engine.renderAt(start + script.scenes[idx].duration * 0.55);
    return await new Promise<Blob>((resolve, reject) =>
      engine.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Poster capture failed"))), "image/jpeg", 0.86),
    );
  } finally {
    engine.dispose();
  }
}
